import Layout from '../../../components/Layout'
import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, Clock, Send, Sun } from 'lucide-react'
import { supabase } from '../../../../lib/supabaseClient'
import { fetchOwnTimeOffRequests } from '../../../../lib/staffTimeOff'
import { useAuthUser } from '../../../context/AuthUserContext'

const WEEKDAYS = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
]

const LEAVE_REASON_OPTIONS = ['Annual leave', 'Medical leave', 'Personal', 'Other']

// The staff_time_off_requests table has a single free-text `reason` column, so the
// category picked in the "Reason" dropdown and the optional note are combined into
// one string rather than adding a new column.
const combineReason = (category, note) => `${category}${note.trim() ? ` — ${note.trim()}` : ''}`

const statusMeta = {
  pending: { label: 'Pending', dot: 'bg-amber-500', badge: 'bg-amber-100 text-amber-700' },
  approved: { label: 'Approved', dot: 'bg-green-500', badge: 'bg-green-100 text-green-700' },
  rejected: { label: 'Rejected', dot: 'bg-red-500', badge: 'bg-red-100 text-red-700' },
}

// This app's business locations are all in Singapore (see the address examples throughout
// the booking flow), so the public holiday calendar used to exclude non-working days from
// the leave balance is fetched for SG specifically.
const HOLIDAY_COUNTRY_CODE = 'SG'
const ANNUAL_LEAVE_DAYS = 18

const todayIso = () => new Date().toISOString().slice(0, 10)

const describeRequest = (request) => {
  if (request.request_type === 'weekly_day_off') {
    const label = WEEKDAYS.find(day => day.value === request.day_of_week)?.label || 'Unknown day'
    return `Every ${label}, from ${request.start_date}`
  }
  return `${formatLeaveRange(request.start_date, request.end_date)}${request.reason ? ` · ${request.reason}` : ''}`
}

function formatLeaveRange(startIso, endIso) {
  const start = new Date(`${startIso}T00:00:00Z`)
  const end = new Date(`${endIso}T00:00:00Z`)
  const startMonth = start.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })
  const endMonth = end.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })
  if (startIso === endIso) return `${start.getUTCDate()} ${startMonth}`
  if (startMonth === endMonth) return `${start.getUTCDate()} – ${end.getUTCDate()} ${endMonth}`
  return `${start.getUTCDate()} ${startMonth} – ${end.getUTCDate()} ${endMonth}`
}

function formatSubmitted(createdAt) {
  if (!createdAt) return '—'
  return new Date(createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function StaffTimeOff() {
  const { user } = useAuthUser()
  const [profile, setProfile] = useState(null)
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [requestType, setRequestType] = useState('weekly_day_off')
  const [dayOfWeek, setDayOfWeek] = useState('5')
  const [startDate, setStartDate] = useState(todayIso())
  const [endDate, setEndDate] = useState('')
  const [leaveReasonCategory, setLeaveReasonCategory] = useState(LEAVE_REASON_OPTIONS[0])
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [notification, setNotification] = useState(null)
  const [publicHolidays, setPublicHolidays] = useState(new Set())

  useEffect(() => {
    let requestChannel = null
    let cancelled = false

    const loadRequests = async (userId) => {
      const rows = await fetchOwnTimeOffRequests(supabase, userId)
      if (!cancelled) setRequests(rows)
    }

    const load = async () => {
      if (!user) return
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
  }, [user])

  useEffect(() => {
    const year = new Date().getFullYear()
    fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/${HOLIDAY_COUNTRY_CODE}`)
      .then(response => (response.ok ? response.json() : []))
      .then(data => setPublicHolidays(new Set((data || []).map(holiday => holiday.date))))
      .catch(() => setPublicHolidays(new Set()))
  }, [])

  const leaveBalance = useMemo(() => {
    const currentYear = new Date().getFullYear()
    let daysUsed = 0
    requests.forEach(request => {
      if (request.request_type !== 'leave' || request.status !== 'approved') return
      if (!request.start_date || !request.end_date) return
      const cursor = new Date(`${request.start_date}T00:00:00Z`)
      const end = new Date(`${request.end_date}T00:00:00Z`)
      while (cursor <= end) {
        const iso = cursor.toISOString().slice(0, 10)
        if (iso.startsWith(String(currentYear)) && !publicHolidays.has(iso)) daysUsed += 1
        cursor.setUTCDate(cursor.getUTCDate() + 1)
      }
    })
    return {
      used: daysUsed,
      remaining: Math.max(0, ANNUAL_LEAVE_DAYS - daysUsed),
      pending: requests.filter(request => request.status === 'pending').length,
    }
  }, [requests, publicHolidays])

  const resetForm = () => {
    setDayOfWeek('5')
    setStartDate(todayIso())
    setEndDate('')
    setLeaveReasonCategory(LEAVE_REASON_OPTIONS[0])
    setNote('')
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
    }

    setSubmitting(true)

    const reason = requestType === 'weekly_day_off' ? (note.trim() || null) : combineReason(leaveReasonCategory, note)

    const payload = {
      staff_profile_id: profile.id,
      host_admin_id: profile.host_admin_id,
      requested_by: user?.id,
      request_type: requestType,
      day_of_week: requestType === 'weekly_day_off' ? Number(dayOfWeek) : null,
      start_date: startDate,
      end_date: requestType === 'leave' ? endDate : null,
      reason,
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
        message: `${profile.staff_name} requested ${summary}${reason ? `: ${reason}` : ''}.`,
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
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Staff / Time off</p>
        <h1 className="mt-1 text-4xl font-bold text-gray-900">Time off</h1>
        <p className="text-gray-500 text-sm mt-2 mb-6">Request a standing weekly day off, or a one-off leave period.</p>

        {notification && (
          <div className="mb-5 rounded-lg border border-accent-200 bg-accent-100 px-4 py-3 text-sm text-accent-800">{notification}</div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 mb-6">
          <StatCard icon={CalendarDays} value={leaveBalance.used} label="Days used this year" border="border-l-accent" iconBg="bg-accent-100" iconColor="text-accent-600" />
          <StatCard icon={Sun} value={leaveBalance.remaining} label="Days remaining" border="border-l-green-500" iconBg="bg-green-100" iconColor="text-green-600" />
          <StatCard icon={Clock} value={leaveBalance.pending} label="Pending request" border="border-l-orange-500" iconBg="bg-orange-100" iconColor="text-orange-600" />
        </div>

        <div className="bg-white rounded-xl shadow-sm border p-6 mb-8">
          <div className="flex w-full rounded-xl bg-gray-100 p-1 mb-5">
            <button
              type="button"
              onClick={() => setRequestType('weekly_day_off')}
              className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition ${requestType === 'weekly_day_off' ? 'bg-white text-accent-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Weekly Day Off
            </button>
            <button
              type="button"
              onClick={() => setRequestType('leave')}
              className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition ${requestType === 'leave' ? 'bg-white text-accent-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
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
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
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
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Note (optional)</label>
                  <textarea
                    value={note}
                    onChange={event => setNote(event.target.value)}
                    rows={2}
                    placeholder="Add context for your manager..."
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
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
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">End date</label>
                    <input
                      type="date"
                      value={endDate}
                      min={startDate || todayIso()}
                      onChange={event => setEndDate(event.target.value)}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
                  <select
                    value={leaveReasonCategory}
                    onChange={event => setLeaveReasonCategory(event.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
                  >
                    {LEAVE_REASON_OPTIONS.map(option => <option key={option} value={option}>{option}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Note (optional)</label>
                  <textarea
                    value={note}
                    onChange={event => setNote(event.target.value)}
                    rows={3}
                    placeholder="Add context for your manager..."
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
                  />
                </div>
              </>
            )}

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-accent hover:bg-accent-600 px-4 py-2.5 text-sm font-semibold text-white transition disabled:opacity-60"
            >
              <Send className="w-4 h-4" /> {submitting ? 'Submitting...' : 'Submit request'}
            </button>
          </form>
        </div>

        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="p-5 border-b">
            <h2 className="text-lg font-bold text-gray-900">My requests</h2>
          </div>
          <div className="hidden grid-cols-[1fr_1.6fr_1fr_1fr] gap-4 border-b border-gray-100 bg-gray-50 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 md:grid">
            <span>Type</span>
            <span>Details</span>
            <span>Submitted</span>
            <span>Status</span>
          </div>
          {loading ? (
            <p className="p-5 text-sm text-gray-400">Loading...</p>
          ) : requests.length === 0 ? (
            <p className="p-5 text-sm text-gray-400">You haven&apos;t submitted any time-off requests yet.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {requests.map(request => {
                const meta = statusMeta[request.status] || { label: request.status, dot: 'bg-gray-400' }
                return (
                  <div key={request.id} className="grid gap-1 px-5 py-4 md:grid-cols-[1fr_1.6fr_1fr_1fr] md:items-center md:gap-4">
                    <p className="text-sm font-semibold text-gray-900">
                      {request.request_type === 'weekly_day_off' ? 'Weekly Day Off' : 'One-off Leave'}
                    </p>
                    <div>
                      <p className="text-sm text-gray-600">{describeRequest(request)}</p>
                      {request.status === 'rejected' && request.rejection_reason && (
                        <p className="mt-0.5 text-xs text-red-500">Reason: {request.rejection_reason}</p>
                      )}
                    </div>
                    <p className="text-sm text-gray-500">{formatSubmitted(request.created_at)}</p>
                    <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
                      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                      {meta.label}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}

function StatCard({ icon: Icon, value, label, border, iconBg, iconColor }) {
  return (
    <div className={`rounded-xl border border-gray-100 border-l-4 bg-white p-5 ${border}`}>
      <div className="flex items-center gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${iconBg} ${iconColor}`}>
          <Icon className="h-5 w-5" />
        </span>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
      </div>
      <p className="mt-2 text-sm text-gray-500">{label}</p>
    </div>
  )
}
