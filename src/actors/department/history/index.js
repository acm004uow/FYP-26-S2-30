import Layout from '../../../components/Layout'
import BookingMessagesPanel from '../../../components/BookingMessagesPanel'
import { useEffect, useState } from 'react'
import { AlertTriangle, Bell, Calendar, CheckCircle2, Clock, Flag, History, MapPin, MessageCircle, UserCheck } from 'lucide-react'
import { supabase } from '../../../../lib/supabaseClient'
import { useAuthUser } from '../../../context/AuthUserContext'

const bookingStatusColor = {
  pending: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  in_progress: 'bg-blue-100 text-blue-700',
  completed: 'bg-teal-100 text-teal-700',
  cancelled: 'bg-gray-100 text-gray-600',
}

const bookingStatusLabel = (status) => String(status || '').replace('_', ' ').replace(/^\w/, c => c.toUpperCase())

const urgencyColor = {
  low: 'bg-gray-100 text-gray-600',
  normal: 'bg-blue-100 text-blue-700',
  high: 'bg-orange-100 text-orange-700',
  urgent: 'bg-red-100 text-red-700',
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

  const showNotification = (message) => {
    setNotification(message)
    setTimeout(() => setNotification(null), 3000)
  }

  const loadHistory = async () => {
    if (!user) return
    setHistoryLoading(true)
    const { data } = await supabase
      .from('bookings')
      .select('id,service_type,location,scheduled_date,scheduled_time,status,created_at,urgency,issue_status,issue_description,issue_reported_at,department_confirmed_at,assigned_staff_id,staff_profiles(staff_name,user_id)')
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

  return (
    <Layout role="departmentStaff">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-start gap-3 mb-6">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent text-white">
            <History className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Department / History</p>
            <h1 className="text-2xl font-bold text-gray-900">Task history</h1>
            <p className="text-gray-500 mt-1">Tasks you&apos;ve created and assigned, most recent first.</p>
          </div>
        </div>

        {notification && <div className="mb-4 p-3 bg-green-50 text-green-700 rounded-lg flex items-center gap-2"><Bell className="w-4 h-4" />{notification}</div>}

        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="divide-y divide-gray-50">
            {historyBookings.map(booking => (
              <div key={booking.id} className="p-5">
                <div className="flex justify-between items-start gap-4">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-gray-900">{booking.service_type}</h3>
                    <p className="text-sm text-gray-500 flex items-center gap-1 mt-1"><MapPin className="w-4 h-4" />{booking.location}</p>
                    <p className="text-sm text-gray-600 mt-2 flex items-center gap-1">
                      <UserCheck className="w-4 h-4" /> Assigned staff: {booking.staff_profiles?.staff_name || 'Unassigned'}
                    </p>
                    {booking.scheduled_date && (
                      <p className="text-sm text-gray-500 flex items-center gap-1 mt-1">
                        <Calendar className="w-4 h-4" />{booking.scheduled_date} {booking.scheduled_time}
                      </p>
                    )}
                    <p className="text-xs text-gray-400 mt-2 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" /> Created {new Date(booking.created_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex flex-shrink-0 flex-col items-end gap-1.5">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${bookingStatusColor[booking.status] || 'bg-gray-100 text-gray-600'}`}>
                      {bookingStatusLabel(booking.status)}
                    </span>
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${urgencyColor[booking.urgency] || urgencyColor.normal}`}>
                      {(booking.urgency || 'normal').charAt(0).toUpperCase() + (booking.urgency || 'normal').slice(1)}
                    </span>
                    {booking.assigned_staff_id && booking.staff_profiles?.user_id && (
                      <button
                        type="button"
                        onClick={() => setMessagesBooking({ id: booking.id, serviceType: booking.service_type, staffUserId: booking.staff_profiles.user_id })}
                        className="inline-flex items-center gap-1 rounded-full border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
                      >
                        <MessageCircle className="w-3.5 h-3.5" /> Messages
                      </button>
                    )}
                  </div>
                </div>

                {booking.status === 'completed' && (
                  <div className="mt-3 border-t border-gray-100 pt-3">
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
                              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
                            />
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => handleReportIssue(booking)}
                                disabled={issueSubmitting}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 hover:bg-red-700 px-3 py-1.5 text-xs font-semibold text-white transition disabled:opacity-60"
                              >
                                <Flag className="w-3.5 h-3.5" /> {issueSubmitting ? 'Submitting...' : 'Submit issue'}
                              </button>
                              <button
                                type="button"
                                onClick={() => { setIssueBookingId(null); setIssueText('') }}
                                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => { setIssueBookingId(booking.id); setIssueText('') }}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
                          >
                            <Flag className="w-3.5 h-3.5" /> Report an issue
                          </button>
                        )}

                        {booking.department_confirmed_at ? (
                          <span className="inline-flex items-center gap-1.5 rounded-lg bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Confirmed {new Date(booking.department_confirmed_at).toLocaleDateString()}
                          </span>
                        ) : (
                          issueBookingId !== booking.id && (
                            <button
                              type="button"
                              onClick={() => handleConfirmCompletion(booking)}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-green-200 px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-50"
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
            ))}
            {!historyLoading && historyBookings.length === 0 && (
              <div className="p-8 text-center text-gray-400">You haven&apos;t created any tasks yet.</div>
            )}
            {historyLoading && <div className="p-8 text-center text-gray-400">Loading...</div>}
          </div>
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
