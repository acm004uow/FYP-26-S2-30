import Layout from '../../../components/Layout'
import AddressFields from '../../../components/AddressFields'
import TimeInput from '../../../components/TimeInput'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import { ArrowLeft, Calendar, CheckCircle, ChevronDown, ClipboardList, Clock, Info, MapPin, Repeat, Sparkles } from 'lucide-react'
import { supabase } from '../../../../lib/supabaseClient'
import { generateRecommendations } from '../../../../lib/recommendationEngine'
import { getMinBookableDate, DEFAULT_CUTOFF } from '../../../../lib/businessWeek'
import { SERVICE_TYPES, loadAllServiceTypes } from '../../../../lib/serviceTypes'
import { loadCompaniesForServiceType, loadCompanyRatings, rankCompaniesForServiceType } from '../../../../lib/companyDirectory'
import { createRecurringBookingRequest, expandRecurrenceDates } from '../../../../lib/recurringBookings'
import { fetchClosuresClient, isDateClosed } from '../../../../lib/businessClosures'
import { fetchSchedulingSettingsClient } from '../../../../lib/scheduleSettings'
import { useAuthUser } from '../../../context/AuthUserContext'

const DAY_LABELS = [
  { value: 1, label: 'Mon' }, { value: 2, label: 'Tue' }, { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' }, { value: 5, label: 'Fri' }, { value: 6, label: 'Sat' }, { value: 0, label: 'Sun' },
]

export default function CustomerBooking() {
  const router = useRouter()
  const { user } = useAuthUser()
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [composedLocation, setComposedLocation] = useState('')
  const [coordinates, setCoordinates] = useState(null)
  const [companies, setCompanies] = useState([])
  const [companiesLoading, setCompaniesLoading] = useState(true)
  const [serviceTypes, setServiceTypes] = useState(SERVICE_TYPES)
  const [bookingMode, setBookingMode] = useState('one-time')
  const [closures, setClosures] = useState([])
  const [cutoff, setCutoff] = useState(DEFAULT_CUTOFF)
  const [daysDropdownOpen, setDaysDropdownOpen] = useState(false)
  const daysDropdownRef = useRef(null)
  const [form, setForm] = useState({
    companyId: '', serviceType: SERVICE_TYPES[0], description: '',
    scheduledDate: '', scheduledTime: '', estimatedHours: 2, notes: '',
    startDate: '', endDate: '', daysOfWeek: [],
  })

  const toggleDayOfWeek = (day) => {
    setForm(prev => ({
      ...prev,
      daysOfWeek: prev.daysOfWeek.includes(day) ? prev.daysOfWeek.filter(d => d !== day) : [...prev.daysOfWeek, day],
    }))
  }

  useEffect(() => {
    if (!daysDropdownOpen) return
    const handleClickOutside = (event) => {
      if (daysDropdownRef.current && !daysDropdownRef.current.contains(event.target)) {
        setDaysDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [daysDropdownOpen])

  // Service type is chosen before company (customers know what they need before they know who
  // offers it), so the full type list loads once up front rather than being scoped to a company.
  useEffect(() => {
    (async () => {
      const types = await loadAllServiceTypes(supabase)
      setServiceTypes(types)
      setForm(prev => (types.includes(prev.serviceType) ? prev : { ...prev, serviceType: types[0] }))
    })()
  }, [])

  useEffect(() => {
    if (!router.isReady) return
    const companyId = typeof router.query.companyId === 'string' ? router.query.companyId : ''
    if (companyId) setForm(prev => ({ ...prev, companyId }))
  }, [router.isReady, router.query.companyId])

  // Narrows the company picker to companies that actually offer the chosen service type, then
  // ranks them by suitability for THAT service specifically (rating + review volume for that
  // service type, not a blanket company-wide average) — the same weighted-score-with-explanation
  // approach the staff recommendation engine already uses, just applied to companies. Never drops
  // an already-selected company just because it doesn't match this filter — e.g. the marketplace
  // page deep-links here with ?companyId=X, and that explicit choice must stay intact even if it
  // doesn't cleanly match the category name.
  useEffect(() => {
    if (!form.serviceType) return
    let cancelled = false
    setCompaniesLoading(true)
    ;(async () => {
      const eligible = await loadCompaniesForServiceType(supabase, form.serviceType)
      let list = eligible
      if (form.companyId && !eligible.some(c => c.id === form.companyId)) {
        const { data: selected } = await supabase
          .from('profiles')
          .select('id,business_name')
          .eq('id', form.companyId)
          .maybeSingle()
        if (selected) list = [selected, ...eligible]
      }
      const ratings = await loadCompanyRatings(supabase, list.map(c => c.id), form.serviceType)
      if (cancelled) return
      setCompanies(rankCompaniesForServiceType(list, ratings))
      setCompaniesLoading(false)
    })()
    return () => { cancelled = true }
  }, [form.serviceType, form.companyId])

  useEffect(() => {
    if (!form.companyId) {
      setClosures([])
      return
    }
    fetchClosuresClient(supabase, form.companyId).then(setClosures).catch(() => setClosures([]))
  }, [form.companyId])

  useEffect(() => {
    if (!form.companyId) {
      setCutoff(DEFAULT_CUTOFF)
      return
    }
    fetchSchedulingSettingsClient(supabase, form.companyId).then(setCutoff).catch(() => setCutoff(DEFAULT_CUTOFF))
  }, [form.companyId])

  const minDate = getMinBookableDate(new Date(), cutoff)
  // Companies are pre-sorted by score in the ranking effect, so the top entry is the AI pick —
  // but only surface it as a recommendation once it actually has reviews backing it up.
  const recommendedCompany = companies[0]?.score > 0 ? companies[0] : null

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (submitting) return
    if (!form.companyId) {
      setError('Please select which company you want to book with.')
      return
    }
    if (!composedLocation) {
      setError('Please provide a postal code, block number, and street name.')
      return
    }

    if (bookingMode === 'recurring') {
      if (!form.startDate || !form.endDate) {
        setError('Please provide a start and end date for the service period.')
        return
      }
      if (form.startDate < minDate) {
        setError(`Recurring bookings can only start from ${minDate} onward. This week's schedule has already been finalized.`)
        return
      }
      if (form.endDate < form.startDate) {
        setError('The service period end date is before its start date.')
        return
      }
      if (form.daysOfWeek.length === 0) {
        setError('Please select at least one day of the week for the visits.')
        return
      }
      const candidateDates = expandRecurrenceDates({ start_date: form.startDate, end_date: form.endDate, days_of_week: form.daysOfWeek })
      if (candidateDates.length > 0 && candidateDates.every(date => isDateClosed(date, closures))) {
        const closure = isDateClosed(candidateDates[0], closures)
        setError(`This entire period is closed${closure?.reason ? `: ${closure.reason}` : ''}. Please choose a different period.`)
        return
      }

      setSubmitting(true)
      setError('')

      try {
        await createRecurringBookingRequest(supabase, form.companyId, user?.id, {
          service_type: form.serviceType,
          location: composedLocation,
          latitude: coordinates?.latitude ?? null,
          longitude: coordinates?.longitude ?? null,
          description: form.description,
          days_of_week: form.daysOfWeek,
          scheduled_time: form.scheduledTime || null,
          estimated_hours: form.estimatedHours || 2,
          start_date: form.startDate,
          end_date: form.endDate,
        })
      } catch (recurringError) {
        setError(recurringError.message)
        setSubmitting(false)
        return
      }

      await supabase.from('audit_logs').insert({ user_id: user?.id, action: 'create_recurring_booking', details: form.serviceType })

      let { data: customerProfile } = await supabase
        .from('profiles')
        .select('full_name,email')
        .eq('id', user?.id)
        .single()

      const { data: managers } = await supabase
        .from('profiles')
        .select('id')
        .eq('role', 'manager')
        .eq('status', 'active')
        .eq('host_admin_id', form.companyId)

      const customerName = customerProfile?.full_name || customerProfile?.email || 'A customer'
      const managerNotifications = (managers || []).map(manager => ({
        user_id: manager.id,
        title: 'New recurring booking request',
        message: `${customerName} requested recurring ${form.serviceType} at ${composedLocation} from ${form.startDate} to ${form.endDate}.`,
      }))
      if (managerNotifications.length) {
        await supabase.from('notifications').insert(managerNotifications)
      }

      setSubmitted(true)
      setTimeout(() => {
        router.push('/customer')
      }, 2000)
      return
    }

    if (form.scheduledDate && form.scheduledDate < minDate) {
      setError(`Bookings are only open from ${minDate} onward. This week's schedule has already been finalized.`)
      return
    }
    if (form.scheduledDate) {
      const closure = isDateClosed(form.scheduledDate, closures)
      if (closure) {
        setError(`This date is closed${closure.reason ? `: ${closure.reason}` : ''}. Please choose a different date.`)
        return
      }
    }
    setSubmitting(true)
    setError('')
    const { data: createdBooking, error: insertError } = await supabase.from('bookings').insert({
      customer_id: user?.id,
      host_admin_id: form.companyId,
      service_type: form.serviceType,
      description: form.description,
      location: composedLocation,
      latitude: coordinates?.latitude ?? null,
      longitude: coordinates?.longitude ?? null,
      scheduled_date: form.scheduledDate || null,
      scheduled_time: form.scheduledTime || null,
      estimated_hours: form.estimatedHours || 2,
      notes: form.notes,
      status: 'pending',
    }).select('id').single()

    if (insertError) {
      setError(insertError.message)
      setSubmitting(false)
      return
    }

    await supabase.from('audit_logs').insert({ user_id: user?.id, action: 'create_booking', details: form.serviceType })

    if (createdBooking?.id) {
      const [{ data: staffRows }, { data: systemParams }] = await Promise.all([
        supabase
          .from('staff_profiles')
          .select('id,staff_name,availability,performance_rating,current_workload,assigned_region,latitude,longitude,weekly_working_hours,max_weekly_hours,is_suspended,status')
          .eq('host_admin_id', form.companyId)
          .eq('is_suspended', false)
          .eq('status', 'active'),
        supabase.from('system_parameters').select('*').eq('id', 1).single(),
      ])

      const recommendations = generateRecommendations(
        staffRows || [],
        {
          location: composedLocation,
          latitude: coordinates?.latitude ?? null,
          longitude: coordinates?.longitude ?? null,
          estimated_hours: form.estimatedHours,
          requested_text: `${form.description || ''} ${form.notes || ''}`,
        },
        systemParams || {}
      )
      const topMatch = recommendations[0]

      if (topMatch) {
        await supabase.from('bookings').update({
          assigned_staff_id: topMatch.staff_id,
          recommendation_reason: topMatch.reason,
          updated_at: new Date().toISOString(),
        }).eq('id', createdBooking.id)
      }

      let { data: customerProfile } = await supabase
        .from('profiles')
        .select('full_name,email')
        .eq('id', user?.id)
        .single()

      const { data: managers } = await supabase
        .from('profiles')
        .select('id')
        .eq('role', 'manager')
        .eq('status', 'active')
        .eq('host_admin_id', form.companyId)

      const customerName = customerProfile?.full_name || customerProfile?.email || 'A customer'
      const managerNotifications = (managers || []).map(manager => ({
        user_id: manager.id,
        title: 'New booking request',
        message: `${customerName} booked ${form.serviceType} at ${composedLocation}.${topMatch ? ` AI recommends ${topMatch.staff_name} for this booking.` : ''}`,
      }))

      if (managerNotifications.length) {
        await supabase.from('notifications').insert(managerNotifications)
      }
    }

    setSubmitted(true)
    setTimeout(() => {
      router.push('/customer')
    }, 2000)
  }

  if (submitted) {
    return (
      <Layout role="customer">
        <div className="min-h-[80vh] flex items-center justify-center">
          <div className="text-center">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-10 h-10 text-green-500" />
            </div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">{bookingMode === 'recurring' ? 'Recurring Booking Requested!' : 'Booking Submitted!'}</h2>
            <p className="text-gray-500">{bookingMode === 'recurring' ? 'A manager will review your recurring booking request shortly.' : 'Redirecting to your bookings...'}</p>
          </div>
        </div>
      </Layout>
    )
  }

  return (
    <Layout role="customer">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <button type="button" onClick={() => router.push('/customer')} className="mb-2 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <h1 className="text-2xl font-bold text-gray-900">Book a Cleaning Service</h1>
        </div>
        {error && <div className="mb-4 rounded-lg border bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <h3 className="font-semibold text-gray-800 mb-5 flex items-center gap-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent-100"><ClipboardList className="w-4 h-4 text-accent" /></span>
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-white">1</span>
              Service Details
            </h3>
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Service Type *</label>
                  <select required value={form.serviceType} onChange={e => setForm({ ...form, serviceType: e.target.value, companyId: '' })} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-accent-500 text-sm bg-gray-50">
                    {serviceTypes.map(type => <option key={type} value={type}>{type}</option>)}
                  </select>
                </div>
                {recommendedCompany && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">&nbsp;</label>
                    <button
                      type="button"
                      onClick={() => setForm(prev => ({ ...prev, companyId: recommendedCompany.id }))}
                      className={`flex w-full items-start gap-2 rounded-xl border px-3 py-2.5 text-left transition ${form.companyId === recommendedCompany.id ? 'border-accent-300 bg-accent-100' : 'border-accent-100 bg-accent-50 hover:bg-accent-100'}`}
                    >
                      <Sparkles className="w-4 h-4 text-accent-600 mt-0.5 shrink-0" />
                      <span className="text-sm">
                        <span className="font-semibold text-accent-800">AI Recommended: {recommendedCompany.business_name}</span>
                        <span className="block text-xs text-accent-600 mt-0.5">{recommendedCompany.reason}</span>
                      </span>
                    </button>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">Estimated Hours <Info className="w-3.5 h-3.5 text-gray-400" /></label>
                  <div className="flex items-center gap-2 w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 focus-within:ring-2 focus-within:ring-accent-500">
                    <Clock className="w-4 h-4 text-gray-400 shrink-0" />
                    <input type="number" min="1" step="0.5" value={form.estimatedHours} onChange={e => setForm({ ...form, estimatedHours: e.target.value })} className="flex-1 bg-transparent text-sm focus:outline-none" />
                    <span className="text-xs text-gray-400 shrink-0">hours</span>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Company *</label>
                  <select required value={form.companyId} onChange={e => setForm({ ...form, companyId: e.target.value })} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-accent-500 text-sm bg-gray-50">
                    <option value="">{companiesLoading ? 'Loading companies...' : 'Select a company...'}</option>
                    {companies.map(company => (
                      <option key={company.id} value={company.id}>
                        {company.id === recommendedCompany?.id ? '⭐ ' : ''}{company.business_name}{company.rating ? ` — ★${company.rating.average.toFixed(1)} (${company.rating.count})` : ''}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-accent-600">
                    {companies.length === 0 && !companiesLoading
                      ? 'No companies are available to book with yet.'
                      : 'Sorted by suitability for this service, based on past customer reviews.'}
                  </p>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                <div className="relative">
                  <textarea maxLength={500} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={4} placeholder="Describe what needs to be cleaned..." className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-accent-500 text-sm bg-gray-50 resize-none" />
                  <span className="pointer-events-none absolute bottom-2 right-3 text-xs text-gray-400">{form.description.length} / 500</span>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <h3 className="font-semibold text-gray-800 mb-5 flex items-center gap-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-green-50"><MapPin className="w-4 h-4 text-green-500" /></span>
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green-500 text-xs font-semibold text-white">2</span>
              Location
            </h3>
            <AddressFields onLocationChange={setComposedLocation} onCoordinatesChange={setCoordinates} />
          </div>

          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <h3 className="font-semibold text-gray-800 mb-5 flex items-center gap-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-purple-50"><Clock className="w-4 h-4 text-purple-500" /></span>
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-purple-500 text-xs font-semibold text-white">3</span>
              Schedule
            </h3>
            <div className="space-y-4">
              <div className="inline-flex rounded-lg bg-gray-100 p-1">
                <button type="button" onClick={() => setBookingMode('one-time')} className={`px-3 py-1.5 text-sm font-medium rounded-md transition ${bookingMode === 'one-time' ? 'bg-white text-accent-600 shadow-sm' : 'text-gray-500'}`}>One-time</button>
                <button type="button" onClick={() => setBookingMode('recurring')} className={`px-3 py-1.5 text-sm font-medium rounded-md transition flex items-center gap-1 ${bookingMode === 'recurring' ? 'bg-white text-accent-600 shadow-sm' : 'text-gray-500'}`}><Repeat className="w-3.5 h-3.5" /> Recurring</button>
              </div>

              {bookingMode === 'one-time' ? (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Preferred Date *</label>
                    <div className="relative">
                      <input required type="date" min={minDate} value={form.scheduledDate} onChange={e => setForm({ ...form, scheduledDate: e.target.value })} className="date-input w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-500 text-sm bg-gray-50" />
                      <Calendar className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    </div>
                    <p className="mt-1 flex items-start gap-1 text-xs text-accent-600"><Info className="w-3.5 h-3.5 shrink-0 mt-0.5" /> Bookings open from {minDate} onward — this week&apos;s schedule is already finalized.</p>
                  </div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-2">Preferred Time</label><TimeInput value={form.scheduledTime} onChange={value => setForm({ ...form, scheduledTime: value })} /></div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1"><Calendar className="w-4 h-4" /> Service Period Start</label>
                      <div className="relative">
                        <input type="date" min={minDate} value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} className="date-input w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-500 text-sm bg-gray-50" />
                        <Calendar className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1"><Calendar className="w-4 h-4" /> Service Period End</label>
                      <div className="relative">
                        <input type="date" min={form.startDate || minDate} value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })} className="date-input w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-500 text-sm bg-gray-50" />
                        <Calendar className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      </div>
                    </div>
                    <div className="relative" ref={daysDropdownRef}>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Days of Week</label>
                      <button
                        type="button"
                        onClick={() => setDaysDropdownOpen(o => !o)}
                        className="w-full flex items-center justify-between gap-1 px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-gray-50 text-left focus:outline-none focus:ring-2 focus:ring-accent-500"
                      >
                        <span className={`truncate ${form.daysOfWeek.length ? 'text-gray-800' : 'text-gray-400'}`}>
                          {form.daysOfWeek.length
                            ? DAY_LABELS.filter(d => form.daysOfWeek.includes(d.value)).map(d => d.label).join(', ')
                            : 'Select days'}
                        </span>
                        <ChevronDown className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${daysDropdownOpen ? 'rotate-180' : ''}`} />
                      </button>
                      {daysDropdownOpen && (
                        <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-md p-1.5 space-y-0.5">
                          {DAY_LABELS.map(day => {
                            const checked = form.daysOfWeek.includes(day.value)
                            return (
                              <label key={day.value} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-gray-50 cursor-pointer text-sm text-gray-700">
                                <input type="checkbox" checked={checked} onChange={() => toggleDayOfWeek(day.value)} className="w-4 h-4 rounded border-gray-300 accent-accent" />
                                {day.label}
                              </label>
                            )
                          })}
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Preferred Time</label>
                      <TimeInput value={form.scheduledTime} onChange={value => setForm({ ...form, scheduledTime: value })} />
                    </div>
                  </div>
                  <p className="text-xs text-accent-600">Recurring bookings can only start from {minDate} onward — this week&apos;s schedule is already finalized.</p>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-end gap-3">
            <button type="button" onClick={() => router.push('/customer')} className="px-5 py-2.5 bg-white border border-gray-200 text-gray-600 rounded-xl font-medium text-sm hover:bg-gray-50 transition">Cancel</button>
            <button type="submit" disabled={submitting} className="px-5 py-2.5 bg-[#003152] hover: bg-[#003152]-600 text-white rounded-xl font-semibold text-sm transition disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2">
              <Calendar className="w-4 h-4" /> {submitting ? 'Submitting...' : bookingMode === 'recurring' ? 'Submit Recurring Booking Request' : 'Submit Booking'}
            </button>
          </div>
        </form>
      </div>
    </Layout>
  )
}