import Layout from '../../../components/Layout'
import AddressFields from '../../../components/AddressFields'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { ClipboardList, MapPin, Calendar, CheckCircle, Repeat } from 'lucide-react'
import { supabase } from '../../../../lib/supabaseClient'
import { generateRecommendations } from '../../../../lib/recommendationEngine'
import { getMinBookableDate } from '../../../../lib/businessWeek'
import { SERVICE_TYPES, loadServiceTypes } from '../../../../lib/serviceTypes'
import { createRecurringBookingRequest } from '../../../../lib/recurringBookings'

const DAY_LABELS = [
  { value: 1, label: 'Mon' }, { value: 2, label: 'Tue' }, { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' }, { value: 5, label: 'Fri' }, { value: 6, label: 'Sat' }, { value: 0, label: 'Sun' },
]

export default function CustomerBooking() {
  const router = useRouter()
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [composedLocation, setComposedLocation] = useState('')
  const [coordinates, setCoordinates] = useState(null)
  const [companies, setCompanies] = useState([])
  const [serviceTypes, setServiceTypes] = useState(SERVICE_TYPES)
  const [bookingMode, setBookingMode] = useState('one-time')
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
    async function loadCompanies() {
      const { data } = await supabase
        .from('profiles')
        .select('id,business_name')
        .eq('role', 'system_admin')
        .eq('status', 'active')
        .not('business_name', 'is', null)
        .order('business_name')
      setCompanies(data || [])
    }
    loadCompanies()
  }, [])

  useEffect(() => {
    if (!router.isReady) return
    const companyId = typeof router.query.companyId === 'string' ? router.query.companyId : ''
    if (companyId) setForm(prev => ({ ...prev, companyId }))
  }, [router.isReady, router.query.companyId])

  useEffect(() => {
    (async () => {
      const types = await loadServiceTypes(supabase, form.companyId || null)
      setServiceTypes(types)
      setForm(prev => (types.includes(prev.serviceType) ? prev : { ...prev, serviceType: types[0] }))
    })()
  }, [form.companyId])

  const minDate = getMinBookableDate()

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

      setSubmitting(true)
      setError('')
      const { data: { user } } = await supabase.auth.getUser()

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
    setSubmitting(true)
    setError('')
    const { data: { user } } = await supabase.auth.getUser()
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
          .select('id,staff_name,skills,availability,performance_rating,current_workload,assigned_region,weekly_working_hours,max_weekly_hours,is_suspended,status')
          .eq('host_admin_id', form.companyId)
          .eq('is_suspended', false)
          .eq('status', 'active'),
        supabase.from('system_parameters').select('*').eq('id', 1).single(),
      ])

      const recommendations = generateRecommendations(
        staffRows || [],
        {
          required_skill: 'Cleaning',
          location: composedLocation,
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
          <h1 className="text-2xl font-bold text-gray-900">Book a Cleaning Service</h1>
          <p className="text-gray-500 text-sm mt-1">Tell us what you need and a manager will review and assign staff.</p>
        </div>
        {error && <div className="mb-4 rounded-lg border bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <h3 className="font-semibold text-gray-800 mb-5 flex items-center gap-2"><ClipboardList className="w-5 h-5 text-blue-500" /> Service Details</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Company *</label>
                <select required value={form.companyId} onChange={e => setForm({ ...form, companyId: e.target.value })} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-gray-50">
                  <option value="">Select a company...</option>
                  {companies.map(company => <option key={company.id} value={company.id}>{company.business_name}</option>)}
                </select>
                {companies.length === 0 && <p className="mt-1 text-xs text-gray-400">No companies are available to book with yet.</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Service Type *</label>
                <select required value={form.serviceType} onChange={e => setForm({ ...form, serviceType: e.target.value })} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-gray-50">
                  {serviceTypes.map(type => <option key={type} value={type}>{type}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={4} placeholder="Describe what needs to be cleaned..." className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-gray-50 resize-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Estimated Hours</label>
                <input type="number" min="1" step="0.5" value={form.estimatedHours} onChange={e => setForm({ ...form, estimatedHours: e.target.value })} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-gray-50" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <h3 className="font-semibold text-gray-800 mb-5 flex items-center gap-2"><MapPin className="w-5 h-5 text-green-500" /> Location & Schedule</h3>
            <div className="space-y-4">
              <AddressFields onLocationChange={setComposedLocation} onCoordinatesChange={setCoordinates} />

              <div className="inline-flex rounded-lg bg-gray-100 p-1">
                <button type="button" onClick={() => setBookingMode('one-time')} className={`px-3 py-1.5 text-sm font-medium rounded-md transition ${bookingMode === 'one-time' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'}`}>One-time</button>
                <button type="button" onClick={() => setBookingMode('recurring')} className={`px-3 py-1.5 text-sm font-medium rounded-md transition flex items-center gap-1 ${bookingMode === 'recurring' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'}`}><Repeat className="w-3.5 h-3.5" /> Recurring</button>
              </div>

              {bookingMode === 'one-time' ? (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1"><Calendar className="w-4 h-4" /> Preferred Date</label>
                    <input type="date" min={minDate} value={form.scheduledDate} onChange={e => setForm({ ...form, scheduledDate: e.target.value })} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-gray-50" />
                    <p className="mt-1 text-xs text-gray-400">Bookings open from {minDate} onward — this week&apos;s schedule is already finalized.</p>
                  </div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-2">Preferred Time</label><input type="time" value={form.scheduledTime} onChange={e => setForm({ ...form, scheduledTime: e.target.value })} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-gray-50" /></div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1"><Calendar className="w-4 h-4" /> Service Period Start</label>
                      <input type="date" min={minDate} value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-gray-50" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1"><Calendar className="w-4 h-4" /> Service Period End</label>
                      <input type="date" min={form.startDate || minDate} value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-gray-50" />
                    </div>
                  </div>
                  <p className="text-xs text-gray-400">Recurring bookings can only start from {minDate} onward — this week&apos;s schedule is already finalized.</p>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Days of Week</label>
                    <div className="flex flex-wrap gap-2">
                      {DAY_LABELS.map(day => (
                        <button
                          key={day.value}
                          type="button"
                          onClick={() => toggleDayOfWeek(day.value)}
                          className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition ${form.daysOfWeek.includes(day.value) ? 'bg-blue-500 border-blue-500 text-white' : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-blue-300'}`}
                        >
                          {day.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-2">Preferred Time</label><input type="time" value={form.scheduledTime} onChange={e => setForm({ ...form, scheduledTime: e.target.value })} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-gray-50" /></div>
                </div>
              )}

              <div><label className="block text-sm font-medium text-gray-700 mb-2">Additional Notes</label><textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} placeholder="Any special instructions..." className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-gray-50 resize-none" /></div>
            </div>
          </div>

          <div className="space-y-3">
            <button type="submit" disabled={submitting} className="w-full py-3 bg-gradient-to-r from-blue-500 to-green-500 text-white rounded-xl font-semibold text-sm hover:from-blue-600 hover:to-green-600 transition shadow-md disabled:opacity-60 disabled:cursor-not-allowed">{submitting ? 'Submitting...' : bookingMode === 'recurring' ? 'Submit Recurring Booking Request' : 'Submit Booking'}</button>
            <button type="button" onClick={() => router.push('/customer')} className="w-full py-3 bg-white border border-gray-200 text-gray-600 rounded-xl font-medium text-sm hover:bg-gray-50 transition">Cancel</button>
          </div>
        </form>
      </div>
    </Layout>
  )
}
