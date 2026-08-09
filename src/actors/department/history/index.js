import Layout from '../../../components/Layout'
import BookingMessagesPanel from '../../../components/BookingMessagesPanel'
import { useEffect, useRef, useState } from 'react'
import { AlertCircle, AlertTriangle, Bell, Briefcase, Calendar, CheckCircle2, ChevronDown, Clock, FileText, Filter, Flag, History, Home, Layers, MapPin, MessageCircle, RefreshCw, Search, Sparkles, Truck, User, XCircle } from 'lucide-react'
import { supabase } from '../../../../lib/supabaseClient'
import { useAuthUser } from '../../../context/AuthUserContext'

const bookingStatusColor = {
  pending: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  in_progress: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-gray-100 text-gray-600',
}

const statusIcon = {
  pending: Clock,
  approved: CheckCircle2,
  rejected: XCircle,
  in_progress: RefreshCw,
  completed: CheckCircle2,
  cancelled: XCircle,
}

const bookingStatusLabel = (status) => String(status || '').replace('_', ' ').replace(/^\w/, c => c.toUpperCase())

const urgencyMeta = {
  low: { label: 'Low', dot: 'bg-gray-400', pill: 'bg-gray-100 text-gray-600' },
  normal: { label: 'Normal', dot: 'bg-blue-500', pill: 'bg-blue-100 text-blue-700' },
  high: { label: 'High', dot: 'bg-orange-500', pill: 'bg-orange-100 text-orange-700' },
  urgent: { label: 'Urgent', dot: 'bg-red-500', pill: 'bg-red-100 text-red-700' },
}

const SERVICE_TYPE_ICONS = {
  'Home Cleaning': Home,
  'Office Cleaning': Briefcase,
  'Deep Cleaning': Sparkles,
  'Move-Out Cleaning': Truck,
  'Carpet Cleaning': Layers,
}

const serviceTypeIcon = (type) => SERVICE_TYPE_ICONS[type] || Sparkles

const STATUS_FILTERS = ['All', 'pending', 'approved', 'in_progress', 'completed', 'rejected', 'cancelled']

function formatDateTime(dateStr, timeStr) {
  if (!dateStr) return null
  const date = new Date(`${dateStr}T${timeStr || '00:00'}`)
  return `${date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}, ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
}

function formatCreated(iso) {
  if (!iso) return '—'
  const date = new Date(iso)
  return `${date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}, ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
}

export default function DepartmentHistory() {
  const { user } = useAuthUser()
  const [historyBookings, setHistoryBookings] = useState([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [notification, setNotification] = useState('')
  const [messagesBooking, setMessagesBooking] = useState(null)
  const [issueBookingId, setIssueBookingId] = useState(null)
  const [issueText, setIssueText] = useState('')
  const [issueSubmitting, setIssueSubmitting] = useState(false)
  const [statusFilter, setStatusFilter] = useState('All')
  const [filterOpen, setFilterOpen] = useState(false)
  const [historySearch, setHistorySearch] = useState('')
  const filterRef = useRef(null)

  const showNotification = (message) => {
    setNotification(message)
    setTimeout(() => setNotification(null), 3000)
  }

  const loadHistory = async () => {
    if (!user) return
    setHistoryLoading(true)
    const { data } = await supabase
      .from('bookings')
      .select('id,service_type,location,scheduled_date,scheduled_time,status,created_at,urgency,issue_status,issue_description,issue_reported_at,department_confirmed_at,assigned_staff_id,staff_profiles(staff_name,user_id),task_proofs(file_url,file_name,created_at)')
      .eq('created_by', user?.id)
      .eq('source', 'department')
      .order('created_at', { ascending: false })
      .limit(50)
    setHistoryBookings(data || [])
    setHistoryLoading(false)
  }

  useEffect(() => {
    loadHistory()
  }, [user])

  useEffect(() => {
    if (!user) return
    const channel = supabase
      .channel(`department-bookings-${user.id}-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings', filter: `created_by=eq.${user.id}` }, () => loadHistory())
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [user])

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (filterRef.current && !filterRef.current.contains(event.target)) setFilterOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleReportIssue = async (booking) => {
    if (!issueText.trim()) {
      showNotification('Describe the issue before submitting.')
      return
    }
    setIssueSubmitting(true)
    const now = new Date().toISOString()
    const { error } = await supabase
      .from('bookings')
      .update({
        status: 'in_progress',
        issue_status: 'open',
        issue_description: issueText.trim(),
        issue_reported_at: now,
        issue_reported_by: user.id,
        updated_at: now,
      })
      .eq('id', booking.id)
    setIssueSubmitting(false)

    if (error) {
      showNotification(error.message)
      return
    }

    if (booking.staff_profiles?.user_id) {
      await supabase.from('notifications').insert({
        user_id: booking.staff_profiles.user_id,
        title: 'Issue reported on completed task',
        message: `${booking.service_type} was reopened: ${issueText.trim()}`,
      })
    }

    await supabase.from('audit_logs').insert({ user_id: user.id, action: 'report_booking_issue', details: `Booking ${booking.id}` })
    setIssueBookingId(null)
    setIssueText('')
    showNotification('Issue reported — task reopened for rework.')
    await loadHistory()
  }

  const handleConfirmCompletion = async (booking) => {
    const { error } = await supabase
      .from('bookings')
      .update({ department_confirmed_at: new Date().toISOString(), department_confirmed_by: user.id })
      .eq('id', booking.id)

    if (error) {
      showNotification(error.message)
      return
    }

    await supabase.from('audit_logs').insert({ user_id: user.id, action: 'confirm_booking_completion', details: `Booking ${booking.id}` })
    showNotification('Completion confirmed.')
    await loadHistory()
  }

  const matchesHistorySearch = (booking, term) => {
    if (!term.trim()) return true
    const haystack = [booking.service_type, booking.location].filter(Boolean).join(' ').toLowerCase()
    return haystack.includes(term.trim().toLowerCase())
  }

  const visibleBookings = historyBookings
    .filter(booking => statusFilter === 'All' || booking.status === statusFilter)
    .filter(booking => matchesHistorySearch(booking, historySearch))

  return (
    <Layout role="departmentStaff">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#003333] text-white">
              <History className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide">
                <span className="text-[#005252]">Department</span>
                <span className="text-gray-400"> / History</span>
              </p>
              <h1 className="text-2xl font-bold text-gray-900">Task history</h1>
              <p className="text-gray-500 mt-1">A record of tasks you&apos;ve created and assigned, sorted by most recent.</p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
          <div className="relative w-56">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={historySearch}
              onChange={e => setHistorySearch(e.target.value)}
              placeholder="Search by title or location..."
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#005252]"
            />
          </div>
          <div className="relative" ref={filterRef}>
            <button
              type="button"
              onClick={() => setFilterOpen(open => !open)}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3.5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#005252]"
            >
              <Filter className="w-4 h-4" /> {statusFilter === 'All' ? 'Filter' : bookingStatusLabel(statusFilter)}
              <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${filterOpen ? 'rotate-180' : ''}`} />
            </button>
            {filterOpen && (
              <div className="absolute right-0 z-10 mt-1 w-44 rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
                {STATUS_FILTERS.map(option => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => { setStatusFilter(option); setFilterOpen(false) }}
                    className={`w-full rounded-md px-3 py-2 text-left text-sm hover:bg-[#E6F2F2] ${statusFilter === option ? 'font-semibold text-[#005252]' : 'text-gray-700'}`}
                  >
                    {option === 'All' ? 'All' : bookingStatusLabel(option)}
                  </button>
                ))}
              </div>
            )}
          </div>
          </div>
        </div>

        {notification && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-[#BFE0E0] bg-[#E6F2F2] p-3 text-[#003333]">
            <Bell className="w-4 h-4" />{notification}
          </div>
        )}

        <div className="space-y-4">
          {visibleBookings.map(booking => {
            const ServiceIcon = serviceTypeIcon(booking.service_type)
            const StatusIcon = statusIcon[booking.status] || Clock
            const urgency = urgencyMeta[booking.urgency] || urgencyMeta.normal
            const scheduled = formatDateTime(booking.scheduled_date, booking.scheduled_time)

            return (
              <div key={booking.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#E6F2F2] text-[#005252]">
                      <ServiceIcon className="w-5 h-5" />
                    </span>
                    <div className="min-w-0">
                      <h3 className="font-bold text-gray-900">{booking.service_type}</h3>
                      <p className="mt-1 flex items-start gap-1 text-sm text-gray-500">
                        <MapPin className="w-4 h-4 mt-0.5 shrink-0" />
                        <span>{booking.location}</span>
                      </p>
                    </div>
                  </div>
                  <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${bookingStatusColor[booking.status] || 'bg-gray-100 text-gray-600'}`}>
                    <StatusIcon className="w-3.5 h-3.5" /> {bookingStatusLabel(booking.status)}
                  </span>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-4 border-t border-gray-100 pt-4">
                  <div className="flex flex-wrap items-center gap-6">
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-gray-400 shrink-0" />
                      <div>
                        <p className="text-xs text-gray-400">Assigned staff</p>
                        <p className="text-sm font-medium text-gray-700">{booking.staff_profiles?.staff_name || 'Unassigned'}</p>
                      </div>
                    </div>
                    {scheduled && (
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-gray-400 shrink-0" />
                        <div>
                          <p className="text-xs text-gray-400">Scheduled</p>
                          <p className="text-sm font-medium text-gray-700">{scheduled}</p>
                        </div>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-gray-400 shrink-0" />
                      <div>
                        <p className="text-xs text-gray-400">Created</p>
                        <p className="text-sm font-medium text-gray-700">{formatCreated(booking.created_at)}</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${urgency.pill}`}>
                      {booking.urgency === 'urgent' ? <AlertCircle className="w-3.5 h-3.5" /> : <span className={`h-1.5 w-1.5 rounded-full ${urgency.dot}`} />}
                      {urgency.label}
                    </span>
                    {booking.assigned_staff_id && booking.staff_profiles?.user_id && (
                      <button
                        type="button"
                        onClick={() => setMessagesBooking({ id: booking.id, serviceType: booking.service_type, staffUserId: booking.staff_profiles.user_id })}
                        className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
                      >
                        <MessageCircle className="w-3.5 h-3.5" /> Messages
                      </button>
                    )}
                  </div>
                </div>

                {booking.status === 'completed' && (
                  <div className="mt-3 border-t border-gray-100 pt-3">
                    <div className="mb-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1.5">Proof of work</p>
                      {booking.task_proofs?.[0]?.file_url ? (
                        <a
                          href={booking.task_proofs[0].file_url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center justify-between gap-2 rounded-lg border border-[#BFE0E0] bg-[#E6F2F2] px-3 py-2 text-sm font-semibold text-[#005252] hover:bg-[#d5eaea] transition"
                        >
                          <span className="flex items-center gap-2 min-w-0">
                            <FileText className="h-4 w-4 shrink-0" />
                            <span className="truncate">{booking.task_proofs[0].file_name || 'View proof'}</span>
                          </span>
                          <span className="shrink-0 text-xs">Open →</span>
                        </a>
                      ) : (
                        <div className="rounded-lg border border-dashed border-gray-200 px-3 py-2 text-sm text-gray-400">
                          No proof uploaded
                        </div>
                      )}
                    </div>
                    {booking.issue_status === 'open' ? (
                      <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                        <span>
                          <strong>Issue reported</strong> — awaiting resolution: {booking.issue_description}
                          {booking.issue_reported_at && <span className="block text-xs text-amber-600 mt-0.5">Reported {new Date(booking.issue_reported_at).toLocaleString()}</span>}
                        </span>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        {issueBookingId === booking.id ? (
                          <div className="w-full space-y-2">
                            <textarea
                              value={issueText}
                              onChange={e => setIssueText(e.target.value)}
                              rows={2}
                              placeholder="Describe what wasn't done properly or what still needs work..."
                              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#005252]"
                            />
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => handleReportIssue(booking)}
                                disabled={issueSubmitting}
                                className="inline-flex items-center gap-1.5 rounded-full bg-red-600 hover:bg-red-700 px-3.5 py-1.5 text-xs font-semibold text-white transition disabled:opacity-60"
                              >
                                <Flag className="w-3.5 h-3.5" /> {issueSubmitting ? 'Submitting...' : 'Submit issue'}
                              </button>
                              <button
                                type="button"
                                onClick={() => { setIssueBookingId(null); setIssueText('') }}
                                className="rounded-full border border-gray-200 px-3.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => { setIssueBookingId(booking.id); setIssueText('') }}
                            className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-3.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
                          >
                            <Flag className="w-3.5 h-3.5" /> Report an issue
                          </button>
                        )}

                        {booking.department_confirmed_at ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-green-200 bg-green-50 px-3.5 py-1.5 text-xs font-semibold text-green-700">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Confirmed on {new Date(booking.department_confirmed_at).toLocaleDateString()}
                          </span>
                        ) : (
                          issueBookingId !== booking.id && (
                            <button
                              type="button"
                              onClick={() => handleConfirmCompletion(booking)}
                              className="inline-flex items-center gap-1.5 rounded-full border border-green-200 px-3.5 py-1.5 text-xs font-semibold text-green-700 hover:bg-green-50"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" /> Confirm completion
                            </button>
                          )
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
          {!historyLoading && visibleBookings.length === 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center text-gray-400">
              {historyBookings.length === 0 ? "You haven't created any tasks yet." : 'No tasks match this filter.'}
            </div>
          )}
          {historyLoading && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center text-gray-400">Loading...</div>
          )}
        </div>
      </div>

      {messagesBooking && (
        <BookingMessagesPanel
          bookingId={messagesBooking.id}
          currentUserId={user.id}
          role="departmentStaff"
          otherPartyLabel="Assigned staff"
          notifyUserId={messagesBooking.staffUserId}
          notifyContext={messagesBooking.serviceType}
          onClose={() => setMessagesBooking(null)}
        />
      )}
    </Layout>
  )
}
