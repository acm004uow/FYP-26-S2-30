import { useEffect, useState } from 'react'
import { CalendarClock } from 'lucide-react'
import { supabase } from '../../../../lib/supabaseClient'

const requestStatusMeta = {
  pending: { label: 'Pending', badge: 'bg-yellow-100 text-yellow-700' },
  approved: { label: 'Approved', badge: 'bg-green-100 text-green-700' },
  rejected: { label: 'Rejected', badge: 'bg-red-100 text-red-700' },
}

const WEEKDAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const describeRequest = (request) => {
  if (request.request_type === 'weekly_day_off') {
    return `Every ${WEEKDAY_LABELS[request.day_of_week] || 'Unknown day'}, from ${request.start_date}`
  }
  return `${request.start_date} – ${request.end_date}`
}

export default function TimeOffRequestsPanel() {
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [actionId, setActionId] = useState(null)
  const [rejectingId, setRejectingId] = useState(null)
  const [rejectReason, setRejectReason] = useState('')

  const resolveHostAdminId = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profile } = await supabase
      .from('profiles')
      .select('role,host_admin_id')
      .eq('id', user?.id)
      .single()

    return profile?.role === 'system_admin' ? user.id : profile?.host_admin_id || null
  }

  const loadRequests = async () => {
    setLoading(true)
    const hostAdminId = await resolveHostAdminId()
    if (!hostAdminId) {
      setRequests([])
      setLoading(false)
      return
    }

    const { data, error } = await supabase
      .from('staff_time_off_requests')
      .select('id,staff_profile_id,request_type,day_of_week,start_date,end_date,reason,status,rejection_reason,created_at,requested_by(id,full_name,email,role),staff_profiles(id,staff_name)')
      .eq('host_admin_id', hostAdminId)
      .order('created_at', { ascending: false })

    if (error) {
      setMessage(error.message)
      setRequests([])
    } else {
      setRequests(data || [])
    }
    setLoading(false)
  }

  useEffect(() => {
    loadRequests()
  }, [])

  const handleAction = async (requestId, action, rejectionReason) => {
    setActionId(requestId)
    const { data: { user } } = await supabase.auth.getUser()

    const { data: reviewed, error } = await supabase
      .from('staff_time_off_requests')
      .update({
        status: action,
        reviewed_by: user?.id,
        rejection_reason: action === 'rejected' ? (rejectionReason || null) : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', requestId)
      .eq('status', 'pending')
      .select('id,requested_by,request_type,day_of_week,start_date,end_date')
      .maybeSingle()

    if (!error && reviewed?.requested_by) {
      const summary = describeRequest(reviewed)
      await supabase.from('notifications').insert({
        user_id: reviewed.requested_by,
        title: `Time-off request ${action}`,
        message: `Your time-off request (${summary}) has been ${action}${action === 'rejected' && rejectionReason ? `: ${rejectionReason}` : '.'}`,
      })
    }

    if (!error && reviewed) {
      await supabase.from('audit_logs').insert({
        user_id: user?.id,
        action: action === 'approved' ? 'approve_time_off_request' : 'reject_time_off_request',
        details: `Time-off request ${requestId} ${action}`,
      })
    }

    setActionId(null)
    setRejectingId(null)
    setRejectReason('')
    setMessage(error ? error.message : reviewed ? `Time-off request ${action}.` : 'This request is no longer pending.')
    await loadRequests()
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6 rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
          <CalendarClock className="h-5 w-5 text-indigo-500" /> Time-Off Requests
        </h2>
        <p className="mt-1 text-sm text-gray-500">Review weekly day-off and one-off leave requests from staff and managers.</p>
      </div>

      {message && <div className="mb-4 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">{message}</div>}

      <div className="rounded-xl border border-gray-100 bg-white shadow-sm divide-y divide-gray-100">
        {requests.map(request => {
          const isManager = !request.staff_profiles
          const name = request.staff_profiles?.staff_name || request.requested_by?.full_name || request.requested_by?.email || 'Unknown'
          return (
            <div key={request.id} className="px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-semibold text-gray-900">{name}</p>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${isManager ? 'bg-purple-50 text-purple-700' : 'bg-blue-50 text-blue-700'}`}>
                      {isManager ? 'Manager' : 'Staff'}
                    </span>
                    <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700">
                      {request.request_type === 'weekly_day_off' ? 'Weekly Day Off' : 'Leave'}
                    </span>
                    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${requestStatusMeta[request.status]?.badge || 'bg-gray-100 text-gray-600'}`}>
                      {requestStatusMeta[request.status]?.label || request.status}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-gray-700">{describeRequest(request)}</p>
                  <p className="text-xs text-gray-400 mt-1">Submitted {new Date(request.created_at).toLocaleString()}</p>
                  {request.reason && <p className="mt-2 text-xs text-gray-500">Reason: {request.reason}</p>}
                  {request.status === 'rejected' && request.rejection_reason && (
                    <p className="mt-1 text-xs text-red-500">Rejected: {request.rejection_reason}</p>
                  )}
                </div>
              </div>

              {request.status === 'pending' && (
                rejectingId === request.id ? (
                  <div className="mt-3 space-y-2">
                    <textarea
                      value={rejectReason}
                      onChange={e => setRejectReason(e.target.value)}
                      rows={2}
                      placeholder="Reason for rejecting (optional)..."
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleAction(request.id, 'rejected', rejectReason)}
                        disabled={actionId === request.id}
                        className="px-3 py-1.5 bg-red-500 text-white rounded-lg text-sm disabled:opacity-50"
                      >
                        Confirm Reject
                      </button>
                      <button
                        type="button"
                        onClick={() => { setRejectingId(null); setRejectReason('') }}
                        className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => handleAction(request.id, 'approved')}
                      disabled={actionId === request.id}
                      className="rounded-lg bg-green-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-600 disabled:opacity-60"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => setRejectingId(request.id)}
                      disabled={actionId === request.id}
                      className="rounded-lg bg-red-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-600 disabled:opacity-60"
                    >
                      Reject
                    </button>
                  </div>
                )
              )}
            </div>
          )
        })}
        {!loading && requests.length === 0 && (
          <div className="px-5 py-12 text-center text-sm text-gray-400">No time-off requests yet.</div>
        )}
      </div>
    </div>
  )
}
