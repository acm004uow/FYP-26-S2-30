import Layout from '../../../components/Layout'
import { useEffect, useState } from 'react'
import { CalendarOff, Send } from 'lucide-react'
import { supabase } from '../../../../lib/supabaseClient'
import { fetchOwnTimeOffRequests } from '../../../../lib/staffTimeOff'

const WEEKDAYS = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
]

const statusMeta = {
  pending: { label: 'Pending', badge: 'bg-yellow-100 text-yellow-700' },
  approved: { label: 'Approved', badge: 'bg-green-100 text-green-700' },
  rejected: { label: 'Rejected', badge: 'bg-red-100 text-red-700' },
}

const todayIso = () => new Date().toISOString().slice(0, 10)

const describeRequest = (request) => {
  if (request.request_type === 'weekly_day_off') {
    const label = WEEKDAYS.find(day => day.value === request.day_of_week)?.label || 'Unknown day'
    return `Every ${label}, from ${request.start_date}`
  }
  return `${request.start_date} – ${request.end_date}`
}

export default function StaffTimeOff() {
  const [profile, setProfile] = useState(null)
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [requestType, setRequestType] = useState('weekly_day_off')
  const [dayOfWeek, setDayOfWeek] = useState('5')
  const [startDate, setStartDate] = useState(todayIso())
  const [endDate, setEndDate] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [notification, setNotification] = useState(null)

  useEffect(() => {
    let requestChannel = null
    let cancelled = false

    const loadRequests = async (userId) => {
      const rows = await fetchOwnTimeOffRequests(supabase, userId)
      if (!cancelled) setRequests(rows)
    }

    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: staffProfile } = await supabase
        .from('staff_profiles')
        .select('id,host_admin_id,staff_name')
        .eq('user_id', user?.id)
        .single()

      if (cancelled) return
      setProfile(staffProfile)
      if (!staffProfile || !user) {
        setLoading(false)
        return
      }

      await loadRequests(user.id)
      setLoading(false)

      requestChannel = supabase
        .channel(`staff-time-off-${user.id}-${Date.now()}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'staff_time_off_requests', filter: `requested_by=eq.${user.id}` },
          () => loadRequests(user.id)
        )
        .subscribe()
    }

    load()

    return () => {
      cancelled = true
      if (requestChannel) supabase.removeChannel(requestChannel)
    }
  }, [])

  const resetForm = () => {
    setDayOfWeek('5')
    setStartDate(todayIso())
    setEndDate('')
    setReason('')
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    if (!profile) return

    if (requestType === 'weekly_day_off') {
      if (startDate < todayIso()) {
        setError('Start date cannot be in the past.')
        return
      }
    } else {
      if (!startDate || !endDate) {
        setError('Choose a start and end date.')
        return
      }
      if (endDate < startDate) {
        setError('End date must be on or after the start date.')
        return
      }
      if (!reason.trim()) {
        setError('A reason is required for leave requests.')
        return
      }
    }

    setSubmitting(true)
    const { data: { user } } = await supabase.auth.getUser()

    const payload = {
      staff_profile_id: profile.id,
      host_admin_id: profile.host_admin_id,
      requested_by: user?.id,
      request_type: requestType,
      day_of_week: requestType === 'weekly_day_off' ? Number(dayOfWeek) : null,
      start_date: startDate,
      end_date: requestType === 'leave' ? endDate : null,
      reason: reason.trim() || null,
      status: 'pending',
    }

    const { error: insertError } = await supabase.from('staff_time_off_requests').insert(payload)

    if (insertError) {
      setError(insertError.message)
      setSubmitting(false)
      return
    }

    const summary = requestType === 'weekly_day_off'
      ? `every ${WEEKDAYS.find(day => day.value === Number(dayOfWeek))?.label}`
      : `leave from ${startDate} to ${endDate}`

    // host_admin_id always resolves to the owner's own profile id (the owner's host_admin_id
    // points to itself), so this notifies the owner directly with no extra lookup needed.
    if (profile.host_admin_id) {
      await supabase.from('notifications').insert({
        user_id: profile.host_admin_id,
        title: 'New time-off request',
        message: `${profile.staff_name} requested ${summary}${reason.trim() ? `: ${reason.trim()}` : ''}.`,
      })
    }

    await supabase.from('audit_logs').insert({
      user_id: user?.id,
      action: 'create_time_off_request',
      details: `${profile.staff_name} requested ${summary}`,
    })

    setSubmitting(false)
    setNotification('Time-off request submitted.')
    setTimeout(() => setNotification(null), 4000)
    resetForm()
  }

  return (
    <Layout role="staffMember">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><CalendarOff className="w-6 h-6 text-indigo-500" /> Time Off</h1>
        <p className="text-gray-500 text-sm mt-1 mb-6">Request a standing weekly day off, or a one-off leave period. The owner will review and approve or reject each request.</p>

        {notification && (
          <div className="mb-5 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">{notification}</div>
        )}

        <div className="bg-white rounded-xl shadow-sm border p-6 mb-8">
          <div className="inline-flex rounded-xl bg-gray-100 p-1 mb-5">
            <button
              type="button"
              onClick={() => setRequestType('weekly_day_off')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${requestType === 'weekly_day_off' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Weekly Day Off
            </button>
            <button
              type="button"
              onClick={() => setRequestType('leave')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${requestType === 'leave' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              One-off Leave
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {requestType === 'weekly_day_off' ? (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Day of the week</label>
                  <select
                    value={dayOfWeek}
                    onChange={event => setDayOfWeek(event.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {WEEKDAYS.map(day => <option key={day.value} value={day.value}>{day.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Starting from</label>
                  <input
                    type="date"
                    value={startDate}
                    min={todayIso()}
                    onChange={event => setStartDate(event.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Note (optional)</label>
                  <textarea
                    value={reason}
                    onChange={event => setReason(event.target.value)}
                    rows={2}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Start date</label>
                    <input
                      type="date"
                      value={startDate}
                      min={todayIso()}
                      onChange={event => setStartDate(event.target.value)}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">End date</label>
                    <input
                      type="date"
                      value={endDate}
                      min={startDate || todayIso()}
                      onChange={event => setEndDate(event.target.value)}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
                  <textarea
                    value={reason}
                    onChange={event => setReason(event.target.value)}
                    rows={3}
                    placeholder="e.g. family trip, medical leave"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </>
            )}

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-blue-500 to-green-500 px-4 py-2 text-sm font-medium text-white shadow-sm disabled:opacity-60"
            >
              <Send className="w-4 h-4" /> {submitting ? 'Submitting...' : 'Submit Request'}
            </button>
          </form>
        </div>

        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">My Requests</h2>
          {loading ? (
            <p className="text-sm text-gray-400">Loading...</p>
          ) : requests.length === 0 ? (
            <p className="text-sm text-gray-400">You haven&apos;t submitted any time-off requests yet.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {requests.map(request => (
                <div key={request.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {request.request_type === 'weekly_day_off' ? 'Weekly Day Off' : 'Leave'}
                      </p>
                      <p className="text-xs text-gray-500">{describeRequest(request)}</p>
                      {request.reason && <p className="text-xs text-gray-400 mt-1">{request.reason}</p>}
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${statusMeta[request.status]?.badge || 'bg-gray-100 text-gray-600'}`}>
                      {statusMeta[request.status]?.label || request.status}
                    </span>
                  </div>
                  {request.status === 'rejected' && request.rejection_reason && (
                    <p className="mt-1 text-xs text-red-500">Reason: {request.rejection_reason}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}
