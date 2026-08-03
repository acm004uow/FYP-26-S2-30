import Layout from './Layout'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Briefcase, Calendar, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Clock, ListChecks, MoreVertical, Send, ShieldCheck, Sun, X } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { fetchOwnTimeOffRequests, fetchTimeOffRequesterProfile } from '../../lib/staffTimeOff'
import { useAuthUser } from '../context/AuthUserContext'
import { roleTheme } from '../config/roleTheme'

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
  pending: { label: 'Pending', dot: 'bg-amber-500' },
  approved: { label: 'Approved', dot: 'bg-green-500' },
  rejected: { label: 'Rejected', dot: 'bg-red-500' },
}

// This app's business locations are all in Singapore (see the address examples throughout
// the booking flow), so the public holiday calendar used to exclude non-working days from
// the leave balance is fetched for SG specifically.
const HOLIDAY_COUNTRY_CODE = 'SG'
const ANNUAL_LEAVE_DAYS = 18

const todayIso = () => new Date().toISOString().slice(0, 10)

const REQUESTS_PAGE_SIZE = 5

const requestTypeMeta = {
  weekly_day_off: { label: 'Weekly Day Off', subtitle: 'Recurring', icon: Calendar },
  leave: { label: 'One-off Leave', subtitle: 'One-off', icon: Briefcase },
}

function formatDateDisplay(iso) {
  if (!iso) return '—'
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

function formatSubmittedParts(createdAt) {
  if (!createdAt) return null
  const date = new Date(createdAt)
  return {
    datePart: date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
    timePart: date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }),
  }
}

function getRequestDetailLines(request) {
  if (request.request_type === 'weekly_day_off') {
    const label = WEEKDAYS.find(day => day.value === request.day_of_week)?.label || 'Unknown day'
    return { primary: `Every ${label}`, secondary: `from ${formatDateDisplay(request.start_date)}` }
  }
  return { primary: formatLeaveRange(request.start_date, request.end_date), secondary: request.reason || '' }
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

// Reused across every role's "Time off" page (staff-member/manager/department). `profileSource`
// controls where the requester's host_admin_id/display name and staff_profile_id come from:
// staff_member owns a staff_profiles row, manager/department_staff don't (see
// lib/staffTimeOff.js#fetchTimeOffRequesterProfile). `notifierSuffix` disambiguates the owner
// notification when the requester's role isn't obvious from their profile name alone.
export default function TimeOffPage({ role, profileSource, breadcrumbLabel, notifierSuffix = '' }) {
  const theme = roleTheme[role] || roleTheme.manager
  const { user } = useAuthUser()
  const [profile, setProfile] = useState(null)
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [requestType, setRequestType] = useState('weekly_day_off')
  const [selectedDays, setSelectedDays] = useState([5])
  const [dayOfWeekOpen, setDayOfWeekOpen] = useState(false)
  const dayOfWeekRef = useRef(null)
  const [startDate, setStartDate] = useState(todayIso())
  const [endDate, setEndDate] = useState('')
  const [leaveReasonCategory, setLeaveReasonCategory] = useState(LEAVE_REASON_OPTIONS[0])
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [notification, setNotification] = useState(null)
  const [publicHolidays, setPublicHolidays] = useState(new Set())
  const [requestsPage, setRequestsPage] = useState(1)
  const [showAllRequests, setShowAllRequests] = useState(false)
  const [openMenuId, setOpenMenuId] = useState(null)

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dayOfWeekRef.current && !dayOfWeekRef.current.contains(event.target)) {
        setDayOfWeekOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (!openMenuId) return
    const handleClickOutside = (event) => {
      if (!event.target.closest('[data-request-menu]')) setOpenMenuId(null)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [openMenuId])

  const toggleDay = (value) => {
    setSelectedDays(prev =>
      prev.includes(value) ? prev.filter(day => day !== value) : [...prev, value].sort((a, b) => a - b)
    )
  }

  useEffect(() => {
    let requestChannel = null
    let cancelled = false

    const loadRequests = async (userId) => {
      const rows = await fetchOwnTimeOffRequests(supabase, userId)
      if (!cancelled) setRequests(rows)
    }

    const load = async () => {
      if (!user) return
      const requesterProfile = await fetchTimeOffRequesterProfile(supabase, user.id, profileSource)

      if (cancelled) return
      setProfile(requesterProfile)
      if (!requesterProfile) {
        setLoading(false)
        return
      }

      await loadRequests(user.id)
      setLoading(false)

      requestChannel = supabase
        .channel(`time-off-${user.id}-${Date.now()}`)
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
  }, [user, profileSource])

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

  const requestsTotalPages = Math.max(1, Math.ceil(requests.length / REQUESTS_PAGE_SIZE))

  useEffect(() => {
    if (requestsPage > requestsTotalPages) setRequestsPage(requestsTotalPages)
  }, [requestsTotalPages, requestsPage])

  const visibleRequests = showAllRequests
    ? requests
    : requests.slice((requestsPage - 1) * REQUESTS_PAGE_SIZE, requestsPage * REQUESTS_PAGE_SIZE)

  const handleCancelRequest = async (requestId) => {
    setOpenMenuId(null)
    const { error: deleteError } = await supabase.from('staff_time_off_requests').delete().eq('id', requestId)
    if (deleteError) {
      setError(deleteError.message)
      return
    }
    setRequests(prev => prev.filter(request => request.id !== requestId))
  }

  const resetForm = () => {
    setSelectedDays([5])
    setStartDate(todayIso())
    setEndDate('')
    setLeaveReasonCategory(LEAVE_REASON_OPTIONS[0])
    setNote('')
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    if (!profile) return

    let payloads
    let summary
    let reason

    if (requestType === 'weekly_day_off') {
      if (selectedDays.length === 0) {
        setError('Select at least one day of the week.')
        return
      }

      reason = note.trim() || null
      const dayLabels = WEEKDAYS.filter(day => selectedDays.includes(day.value)).map(day => day.label)
      summary = `every ${dayLabels.join(', ')}`
      payloads = selectedDays.map(day => ({
        staff_profile_id: profile.staffProfileId,
        host_admin_id: profile.hostAdminId,
        requested_by: user?.id,
        request_type: 'weekly_day_off',
        day_of_week: day,
        start_date: todayIso(),
        end_date: null,
        reason,
        status: 'pending',
      }))
    } else {
      if (!startDate || !endDate) {
        setError('Choose a start and end date.')
        return
      }
      if (endDate < startDate) {
        setError('End date must be on or after the start date.')
        return
      }

      reason = combineReason(leaveReasonCategory, note)
      summary = `leave from ${startDate} to ${endDate}`
      payloads = [{
        staff_profile_id: profile.staffProfileId,
        host_admin_id: profile.hostAdminId,
        requested_by: user?.id,
        request_type: 'leave',
        day_of_week: null,
        start_date: startDate,
        end_date: endDate,
        reason,
        status: 'pending',
      }]
    }

    setSubmitting(true)

    const { error: insertError } = await supabase.from('staff_time_off_requests').insert(payloads)

    if (insertError) {
      setError(insertError.message)
      setSubmitting(false)
      return
    }

    // host_admin_id always resolves to the owner's own profile id (the owner's host_admin_id
    // points to itself), so this notifies the owner directly with no extra lookup needed.
    if (profile.hostAdminId) {
      await supabase.from('notifications').insert({
        user_id: profile.hostAdminId,
        title: 'New time-off request',
        message: `${profile.name}${notifierSuffix} requested ${summary}${reason ? `: ${reason}` : ''}.`,
      })
    }

    await supabase.from('audit_logs').insert({
      user_id: user?.id,
      action: 'create_time_off_request',
      details: `${profile.name} requested ${summary}`,
    })

    setSubmitting(false)
    setNotification('Time-off request submitted.')
    setTimeout(() => setNotification(null), 4000)
    resetForm()
  }

  return (
    <Layout role={role}>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{breadcrumbLabel} / Time off</p>
        <h1 className="mt-1 text-4xl font-bold text-gray-900">Time off</h1>
        <p className="text-gray-500 text-sm mt-2 mb-6">Request a standing weekly day off, or a one-off leave period. The owner will review and approve or reject each request.</p>

        {notification && (
          <div className={`mb-5 rounded-lg border px-4 py-3 text-sm ${theme.notif}`}>{notification}</div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 mb-6">
          <StatCard icon={CalendarDays} value={leaveBalance.used} label="Days used this year" border={theme.statBorder} iconBg={theme.statIcon} />
          <StatCard icon={Sun} value={leaveBalance.remaining} label="Days remaining" border="border-l-green-500" iconBg="bg-green-100 text-green-600" />
          <StatCard icon={Clock} value={leaveBalance.pending} label="Pending request" border="border-l-orange-500" iconBg="bg-orange-100 text-orange-600" />
        </div>

        <div className="bg-white rounded-xl shadow-sm border p-6 mb-6">
          <div className="flex w-full gap-2 rounded-xl bg-gray-100 p-1 mb-5">
            <button
              type="button"
              onClick={() => setRequestType('weekly_day_off')}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg border-b-2 px-4 py-2.5 text-sm font-semibold transition ${requestType === 'weekly_day_off' ? theme.activeTab : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
              <Calendar className="h-4 w-4" />
              Weekly Day Off
            </button>
            <button
              type="button"
              onClick={() => setRequestType('leave')}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg border-b-2 px-4 py-2.5 text-sm font-semibold transition ${requestType === 'leave' ? theme.activeTab : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
              <Briefcase className="h-4 w-4" />
              One-off Leave
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {requestType === 'weekly_day_off' ? (
              <>
                <div>
                  <div className="mb-1 flex items-baseline gap-2">
                    <label className="text-sm font-medium text-gray-700">Day of the week</label>
                    <span className="text-xs text-gray-400">Select one or more days</span>
                  </div>

                  <div className="relative" ref={dayOfWeekRef}>
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => setDayOfWeekOpen(open => !open)}
                      onKeyDown={event => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          setDayOfWeekOpen(open => !open)
                        }
                      }}
                      className={`flex min-h-[42px] w-full cursor-pointer flex-wrap items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 ${theme.ring}`}
                    >
                      {selectedDays.length === 0 ? (
                        <span className="text-gray-400">Select day(s)</span>
                      ) : (
                        WEEKDAYS.filter(day => selectedDays.includes(day.value)).map(day => (
                          <span
                            key={day.value}
                            className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-medium ${theme.chip}`}
                          >
                            {day.label}
                            <button
                              type="button"
                              onClick={event => {
                                event.stopPropagation()
                                toggleDay(day.value)
                              }}
                              className="rounded-full p-0.5 hover:bg-black/5"
                              aria-label={`Remove ${day.label}`}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        ))
                      )}

                      <ChevronDown className={`ml-auto h-4 w-4 shrink-0 text-gray-400 transition-transform ${dayOfWeekOpen ? 'rotate-180' : ''}`} />
                    </div>

                    {dayOfWeekOpen && (
                      <div className="absolute z-10 mt-1 w-full rounded-lg border border-gray-200 bg-white p-1.5 shadow-lg">
                        {WEEKDAYS.map(day => (
                          <label
                            key={day.value}
                            className="flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-gray-700 hover:bg-gray-50"
                          >
                            <input
                              type="checkbox"
                              checked={selectedDays.includes(day.value)}
                              onChange={() => toggleDay(day.value)}
                              className={`h-4 w-4 rounded border-gray-300 ${theme.checkbox}`}
                            />
                            {day.label}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Note (optional)</label>
                  <div className="relative">
                    <textarea
                      value={note}
                      onChange={event => setNote(event.target.value.slice(0, 250))}
                      rows={3}
                      maxLength={250}
                      placeholder="e.g. Medical appointment, personal reason, etc."
                      className={`w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 ${theme.ring}`}
                    />
                    <span className="pointer-events-none absolute bottom-2 right-3 text-xs text-gray-400">{note.length} / 250</span>
                  </div>
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
                      className={`w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 ${theme.ring}`}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">End date</label>
                    <input
                      type="date"
                      value={endDate}
                      min={startDate || todayIso()}
                      onChange={event => setEndDate(event.target.value)}
                      className={`w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 ${theme.ring}`}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
                  <select
                    value={leaveReasonCategory}
                    onChange={event => setLeaveReasonCategory(event.target.value)}
                    className={`w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 ${theme.ring}`}
                  >
                    {LEAVE_REASON_OPTIONS.map(option => <option key={option} value={option}>{option}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Note (optional)</label>
                  <div className="relative">
                    <textarea
                      value={note}
                      onChange={event => setNote(event.target.value.slice(0, 250))}
                      rows={3}
                      maxLength={250}
                      placeholder="e.g. Medical appointment, personal reason, etc."
                      className={`w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 ${theme.ring}`}
                    />
                    <span className="pointer-events-none absolute bottom-2 right-3 text-xs text-gray-400">{note.length} / 250</span>
                  </div>
                </div>
              </>
            )}

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className={`inline-flex w-auto items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold text-white transition disabled:opacity-60 ${theme.solid}`}
            >
              <Send className="w-4 h-4" /> {submitting ? 'Submitting...' : 'Submit request'}
            </button>

            <p className="flex items-center justify-center gap-1.5 text-xs text-gray-500">
              <ShieldCheck className={`h-3.5 w-3.5 ${theme.text600}`} />
              Your request will be sent for approval.
            </p>
          </form>
        </div>

        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="flex items-center justify-between gap-3 p-5 border-b">
            <div className="flex items-center gap-3">
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${theme.badgeSoft}`}>
                <CalendarDays className="h-5 w-5" />
              </span>
              <h2 className="text-lg font-bold text-gray-900">My requests</h2>
            </div>

            {requests.length > REQUESTS_PAGE_SIZE && (
              <button
                type="button"
                onClick={() => setShowAllRequests(show => !show)}
                className={`inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm font-medium ${theme.link}`}
              >
                {showAllRequests ? 'Show less' : 'View all'}
                <ChevronRight className={`h-4 w-4 transition-transform ${showAllRequests ? 'rotate-90' : ''}`} />
              </button>
            )}
          </div>

          <div className={`hidden grid-cols-[1fr_1.6fr_1fr_1fr_2rem] gap-4 border-b border-gray-100 px-5 py-3 text-xs font-semibold uppercase tracking-wide md:grid ${theme.headerRow}`}>
            <span>Type</span>
            <span>Details</span>
            <span>Submitted</span>
            <span>Status</span>
            <span />
          </div>
          {loading ? (
            <p className="p-5 text-sm text-gray-400">Loading...</p>
          ) : requests.length === 0 ? (
            <p className="p-5 text-sm text-gray-400">You haven&apos;t submitted any time-off requests yet.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {visibleRequests.map(request => {
                const meta = statusMeta[request.status] || { label: request.status, dot: 'bg-gray-400' }
                const typeMeta = requestTypeMeta[request.request_type] || requestTypeMeta.leave
                const TypeIcon = typeMeta.icon
                const detailLines = getRequestDetailLines(request)
                const submittedParts = formatSubmittedParts(request.created_at)

                return (
                  <div key={request.id} className="grid gap-2 px-5 py-4 md:grid-cols-[1fr_1.6fr_1fr_1fr_2rem] md:items-center md:gap-4">
                    <div className="flex items-center gap-3">
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${theme.badgeSoft}`}>
                        <TypeIcon className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{typeMeta.label}</p>
                        <p className="text-xs text-gray-400">{typeMeta.subtitle}</p>
                      </div>
                    </div>

                    <div>
                      <p className="text-sm font-semibold text-gray-900">{detailLines.primary}</p>
                      {detailLines.secondary && <p className="text-sm text-gray-500">{detailLines.secondary}</p>}
                      {request.status === 'rejected' && request.rejection_reason && (
                        <p className="mt-0.5 text-xs text-red-500">Reason: {request.rejection_reason}</p>
                      )}
                    </div>

                    {submittedParts ? (
                      <div className="space-y-0.5 text-sm text-gray-500">
                        <p className="flex items-center gap-1.5">
                          <CalendarDays className={`h-3.5 w-3.5 ${theme.text600}`} />
                          {submittedParts.datePart}
                        </p>
                        <p className="flex items-center gap-1.5">
                          <Clock className={`h-3.5 w-3.5 ${theme.text600}`} />
                          {submittedParts.timePart}
                        </p>
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400">—</p>
                    )}

                    <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
                      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                      {meta.label}
                    </span>

                    {request.status === 'pending' ? (
                      <div className="relative justify-self-end" data-request-menu>
                        <button
                          type="button"
                          onClick={() => setOpenMenuId(openMenuId === request.id ? null : request.id)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                          aria-label="Request actions"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </button>

                        {openMenuId === request.id && (
                          <div className="absolute right-0 z-10 mt-1 w-40 rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
                            <button
                              type="button"
                              onClick={() => handleCancelRequest(request.id)}
                              className="w-full rounded-md px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                            >
                              Cancel request
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="hidden md:block" />
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {!loading && requests.length > 0 && (
            <div className={`flex items-center justify-between gap-3 border-t border-gray-100 px-5 py-3 ${theme.totalBar}`}>
              <div className="flex items-center gap-2 text-sm">
                <span className={`flex h-6 w-6 items-center justify-center rounded-full ${theme.totalIcon}`}>
                  <ListChecks className="h-3.5 w-3.5" />
                </span>
                {requests.length} total request{requests.length === 1 ? '' : 's'}
              </div>

              {!showAllRequests && requestsTotalPages > 1 && (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setRequestsPage(page => Math.max(1, page - 1))}
                    disabled={requestsPage === 1}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>

                  {Array.from({ length: requestsTotalPages }, (_, index) => index + 1).map(pageNumber => (
                    <button
                      key={pageNumber}
                      type="button"
                      onClick={() => setRequestsPage(pageNumber)}
                      className={`flex h-8 w-8 items-center justify-center rounded-lg border text-sm font-medium ${pageNumber === requestsPage ? theme.page : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'}`}
                    >
                      {pageNumber}
                    </button>
                  ))}

                  <button
                    type="button"
                    onClick={() => setRequestsPage(page => Math.min(requestsTotalPages, page + 1))}
                    disabled={requestsPage === requestsTotalPages}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}

function StatCard({ icon: Icon, value, label, border, iconBg }) {
  return (
    <div className={`rounded-xl border border-gray-100 border-l-4 bg-white p-5 ${border}`}>
      <div className="flex items-center gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${iconBg}`}>
          <Icon className="h-5 w-5" />
        </span>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
      </div>
      <p className="mt-2 text-sm text-gray-500">{label}</p>
    </div>
  )
}
