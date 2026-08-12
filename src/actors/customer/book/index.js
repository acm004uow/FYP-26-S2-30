import Layout from '../../../components/Layout'
import { useState } from 'react'
import { useRouter } from 'next/router'
import { ArrowLeft, CheckCircle } from 'lucide-react'
import { supabase } from '../../../../lib/supabaseClient'
import { generateRecommendations } from '../../../../lib/recommendationEngine'
import { getMinBookableDate, DEFAULT_CUTOFF } from '../../../../lib/businessWeek'
import { createRecurringBookingRequest, expandRecurrenceDates } from '../../../../lib/recurringBookings'
import { fetchClosuresClient, isDateClosed } from '../../../../lib/businessClosures'
import { fetchSchedulingSettingsClient } from '../../../../lib/scheduleSettings'
import { useAuthUser } from '../../../context/AuthUserContext'
import StepperNav from './StepperNav'
import Step1Need from './Step1Need'
import Step2Company from './Step2Company'
import Step3Schedule from './Step3Schedule'

const INITIAL_FORM = {
  serviceType: '', priority: 'normal', description: '', additionalRequirements: '',
  scheduledDate: '', scheduledTime: '', estimatedHours: 1,
  startDate: '', endDate: '', daysOfWeek: [],
  postalCode: '', composedLocation: '',
}

// Orchestrates the 3-step booking wizard (see StepperNav): Step 1 turns a free-text description or
// a direct service-card pick into a service type + optional requested staff member; Step 2 ranks
// real companies for that service and lets the customer pick one; Step 3 collects the address/time
// and submits. All wizard-wide state (the draft booking, which company/staff was chosen) lives here
// so the three step components can stay focused on their own UI.
export default function CustomerBooking() {
  const router = useRouter()
  const { user } = useAuthUser()
  const [step, setStep] = useState(1)
  const [maxStepReached, setMaxStepReached] = useState(1)
  const [rawDescription, setRawDescription] = useState('')
  const [form, setForm] = useState(INITIAL_FORM)
  const [requestedStaff, setRequestedStaff] = useState(null)
  const [selectedCompany, setSelectedCompany] = useState(null)
  const [coordinates, setCoordinates] = useState(null)
  const [bookingMode, setBookingMode] = useState('one-time')
  const [closures, setClosures] = useState([])
  const [cutoff, setCutoff] = useState(DEFAULT_CUTOFF)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  const patchForm = (patch) => setForm(prev => ({ ...prev, ...patch }))

  const goToStep = (target) => {
    setStep(target)
    setMaxStepReached(prev => Math.max(prev, target))
  }

  const handleStep1Proceed = (patch) => {
    patchForm(patch)
    setRequestedStaff(patch.requestedStaff)
    setSelectedCompany(null)
    goToStep(2)
  }

  const handleStep2Select = async (company) => {
    setSelectedCompany(company)
    setError('')
    const [companyClosures, companyCutoff] = await Promise.all([
      fetchClosuresClient(supabase, company.id).catch(() => []),
      fetchSchedulingSettingsClient(supabase, company.id).catch(() => DEFAULT_CUTOFF),
    ])
    setClosures(companyClosures)
    setCutoff(companyCutoff)
    goToStep(3)
  }

  const minDate = getMinBookableDate(new Date(), cutoff)

  const handleSubmit = async () => {
    if (submitting) return
    if (!selectedCompany) {
      setError('Please select which company you want to book with.')
      return
    }
    if (!form.composedLocation) {
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
        await createRecurringBookingRequest(supabase, selectedCompany.id, user?.id, {
          service_type: form.serviceType,
          location: form.composedLocation,
          latitude: coordinates?.latitude ?? null,
          longitude: coordinates?.longitude ?? null,
          description: [form.description, form.additionalRequirements].filter(Boolean).join(' — '),
          days_of_week: form.daysOfWeek,
          scheduled_time: form.scheduledTime || null,
          estimated_hours: form.estimatedHours || 1,
          start_date: form.startDate,
          end_date: form.endDate,
        })
      } catch (recurringError) {
        setError(recurringError.message)
        setSubmitting(false)
        return
      }

      await supabase.from('audit_logs').insert({ user_id: user?.id, action: 'create_recurring_booking', details: form.serviceType })

      const { data: customerProfile } = await supabase.from('profiles').select('full_name,email').eq('id', user?.id).single()
      const { data: managers } = await supabase
        .from('profiles').select('id').eq('role', 'manager').eq('status', 'active').eq('host_admin_id', selectedCompany.id)

      const customerName = customerProfile?.full_name || customerProfile?.email || 'A customer'
      const managerNotifications = (managers || []).map(manager => ({
        user_id: manager.id,
        title: 'New recurring booking request',
        message: `${customerName} requested recurring ${form.serviceType} at ${form.composedLocation} from ${form.startDate} to ${form.endDate}.${requestedStaff ? ` They asked for ${requestedStaff.staff_name}.` : ''}`,
      }))
      if (managerNotifications.length) await supabase.from('notifications').insert(managerNotifications)

      setSubmitted(true)
      setTimeout(() => router.push('/customer'), 2000)
      return
    }

    if (!form.scheduledDate) {
      setError('Please choose a date.')
      return
    }
    if (!form.scheduledTime) {
      setError('Please choose a time slot.')
      return
    }
    if (form.scheduledDate < minDate) {
      setError(`Bookings are only open from ${minDate} onward. This week's schedule has already been finalized.`)
      return
    }
    const closure = isDateClosed(form.scheduledDate, closures)
    if (closure) {
      setError(`This date is closed${closure.reason ? `: ${closure.reason}` : ''}. Please choose a different date.`)
      return
    }

    setSubmitting(true)
    setError('')
    const { data: createdBooking, error: insertError } = await supabase.from('bookings').insert({
      customer_id: user?.id,
      host_admin_id: selectedCompany.id,
      service_type: form.serviceType,
      description: form.description,
      notes: form.additionalRequirements,
      location: form.composedLocation,
      latitude: coordinates?.latitude ?? null,
      longitude: coordinates?.longitude ?? null,
      scheduled_date: form.scheduledDate,
      scheduled_time: form.scheduledTime,
      estimated_hours: form.estimatedHours || 1,
      urgency: form.priority,
      // selectedCompany.price is the company's hourly rate for this service; the stored booking
      // price is the computed total (rate x estimated hours), matching what Step 3's summary shows.
      price: selectedCompany.price != null ? selectedCompany.price * Number(form.estimatedHours || 0) : null,
      requested_staff_name: requestedStaff?.staff_name || null,
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
          .eq('host_admin_id', selectedCompany.id)
          .eq('is_suspended', false)
          .eq('status', 'active'),
        supabase.from('system_parameters').select('*').eq('id', 1).single(),
      ])

      const recommendations = generateRecommendations(
        staffRows || [],
        {
          location: form.composedLocation,
          latitude: coordinates?.latitude ?? null,
          longitude: coordinates?.longitude ?? null,
          estimated_hours: form.estimatedHours,
          requested_text: `${requestedStaff?.staff_name || ''} ${form.description || ''} ${form.additionalRequirements || ''}`,
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

      const { data: customerProfile } = await supabase.from('profiles').select('full_name,email').eq('id', user?.id).single()
      const { data: managers } = await supabase
        .from('profiles').select('id').eq('role', 'manager').eq('status', 'active').eq('host_admin_id', selectedCompany.id)

      const customerName = customerProfile?.full_name || customerProfile?.email || 'A customer'
      const managerNotifications = (managers || []).map(manager => ({
        user_id: manager.id,
        title: 'New booking request',
        message: `${customerName} booked ${form.serviceType} at ${form.composedLocation}.${requestedStaff ? ` Customer requested ${requestedStaff.staff_name}.` : ''}${topMatch ? ` AI recommends ${topMatch.staff_name} for this booking.` : ''}`,
      }))
      if (managerNotifications.length) await supabase.from('notifications').insert(managerNotifications)
    }

    setSubmitted(true)
    setTimeout(() => router.push('/customer'), 2000)
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
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <button type="button" onClick={() => router.push('/customer')} className="mb-2 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <h1 className="text-2xl font-bold text-gray-900">Book a Cleaning Service</h1>
        </div>

        <StepperNav currentStep={step} maxStepReached={maxStepReached} onStepClick={goToStep} />

        {step === 1 && (
          <Step1Need
            description={rawDescription}
            setDescription={setRawDescription}
            onProceed={handleStep1Proceed}
          />
        )}

        {step === 2 && (
          <Step2Company
            serviceType={form.serviceType}
            requestedStaff={requestedStaff}
            postalCode={form.postalCode}
            setPostalCode={(value) => patchForm({ postalCode: value })}
            onSelect={handleStep2Select}
            onBack={() => goToStep(1)}
          />
        )}

        {step === 3 && (
          <Step3Schedule
            selectedCompany={selectedCompany}
            serviceType={form.serviceType}
            requestedStaff={requestedStaff}
            form={form}
            patchForm={patchForm}
            bookingMode={bookingMode}
            setBookingMode={setBookingMode}
            onLocationChange={(location) => patchForm({ composedLocation: location })}
            onCoordinatesChange={setCoordinates}
            minDate={minDate}
            onBack={() => goToStep(2)}
            onSubmit={handleSubmit}
            submitting={submitting}
            error={error}
          />
        )}
      </div>
    </Layout>
  )
}
