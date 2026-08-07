import { useEffect, useMemo, useState } from 'react'
import {
  Calendar, CalendarClock, CalendarDays, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight,
  Clock, Filter, Plus, Users, X, XCircle,
} from 'lucide-react'
import { supabase } from '../../../../lib/supabaseClient'

const PAGE_SIZE = 8

const requestStatusMeta = {
  pending: { label: 'Pending', badge: 'bg-amber-100 text-amber-700', icon: Clock },
  approved: { label: 'Approved', badge: 'bg-green-100 text-green-700', icon: CheckCircle2 },
  rejected: { label: 'Rejected', badge: 'bg-red-100 text-red-700', icon: XCircle },
}

const WEEKDAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const AVATAR_PALETTE = [
  { bg: 'bg-purple-100', text: 'text-purple-600' },
  { bg: 'bg-teal-100', text: 'text-teal-600' },
  { bg: 'bg-pink-100', text: 'text-pink-600' },
  { bg: 'bg-orange-100', text: 'text-orange-600' },
  { bg: 'bg-blue-100', text: 'text-blue-600' },
  { bg: 'bg-green-100', text: 'text-green-600' },
]

const initialsOf = (name) => (name || '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()

// Deterministic per-name color so the same person always gets the same avatar, regardless of
// which row they land on (see StaffPanel.js#avatarColor for the same pattern).
const avatarPaletteFor = (name) => {
  let hash = 0
  for (let i = 0; i < (name || '').length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length]
}

const describeRequest = (request) => {
  if (request.request_type === 'weekly_day_off') {
    return `Every ${WEEKDAY_LABELS[request.day_of_week] || 'Unknown day'}  •  From ${request.start_date}`
  }
  return `${request.start_date} – ${request.end_date}`
}

function StatCard({ icon: Icon, iconBg, iconColor, label, value, subLabel }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${iconBg} ${iconColor}`}>
          <Icon className="h-5 w-5" />
        </span>
        <div>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          <p className="text-sm font-semibold text-gray-700">{label}</p>
          {subLabel && <p className="text-xs text-gray-400">{subLabel}</p>}
        </div>
      </div>
    </div>
  )
}

export default function TimeOffRequestsPanel() {
  const [hostAdminId, setHostAdminId] = useState(null)
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [actionId, setActionId] = useState(null)
  const [rejectingId, setRejectingId] = useState(null)
  const [rejectReason, setRejectReason] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [managers, setManagers] = useState([])
  const [staffOptions, setStaffOptions] = useState([])
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ person: '', requestType: 'weekly_day_off', dayOfWeek: '1', startDate: '', endDate: '', reason: '' })
  const [saving, setSaving] = useState(false)

  const resolveHostAdminId = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.id) return null

    const { data: profile } = await supabase
      .from('profiles')
      .select('role,host_admin_id')
      .eq('id', user.id)
      .single()

    return profile?.role === 'system_admin' ? user.id : profile?.host_admin_id || null
  }

  const loadRequests = async () => {
    setLoading(true)
    const resolvedHostAdminId = await resolveHostAdminId()
    setHostAdminId(resolvedHostAdminId)
    if (!resolvedHostAdminId) {
      setRequests([])
      setLoading(false)
      return
    }

    const [{ data, error }, { data: managerRows }, { data: staffRows }] = await Promise.all([
      supabase
        .from('staff_time_off_requests')
        .select('id,staff_profile_id,request_type,day_of_week,start_date,end_date,reason,status,rejection_reason,created_at,requested_by(id,full_name,email,role),staff_profiles(id,staff_name)')
        .eq('host_admin_id', resolvedHostAdminId)
        .order('created_at', { ascending: false }),
      supabase.from('profiles').select('id,full_name').eq('host_admin_id', resolvedHostAdminId).eq('role', 'manager').eq('status', 'active').order('full_name'),
      supabase.from('staff_profiles').select('id,staff_name,user_id').eq('host_admin_id', resolvedHostAdminId).eq('status', 'active').order('staff_name'),
    ])

    if (error) {
      setMessage(error.message)
      setRequests([])
    } else {
      setRequests(data || [])
    }
    setManagers(managerRows || [])
    setStaffOptions(staffRows || [])
    setLoading(false)
  }

  useEffect(() => {
    loadRequests()
  }, [])

  useEffect(() => {
    setPage(1)
  }, [statusFilter])

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

  const handleCreateRequest = async (event) => {
    event.preventDefault()
    if (!form.person) {
      setMessage('Choose a manager or staff member.')
      return
    }
    if (form.requestType === 'leave' && (!form.startDate || !form.endDate)) {
      setMessage('Pick a start and end date for leave.')
      return
    }

    const [personType, personId] = form.person.split(':')
    const staffMember = personType === 'staff' ? staffOptions.find(s => s.id === personId) : null

    const { data: { user } } = await supabase.auth.getUser()
    setSaving(true)
    const { error } = await supabase.from('staff_time_off_requests').insert({
      host_admin_id: hostAdminId,
      staff_profile_id: staffMember?.id || null,
      requested_by: staffMember ? staffMember.user_id : personId,
      request_type: form.requestType,
      day_of_week: form.requestType === 'weekly_day_off' ? Number(form.dayOfWeek) : null,
      start_date: form.requestType === 'weekly_day_off' ? new Date().toISOString().slice(0, 10) : form.startDate,
      end_date: form.requestType === 'leave' ? form.endDate : null,
      reason: form.reason.trim() || null,
      status: 'approved',
      reviewed_by: user?.id,
    })
    setSaving(false)

    if (error) {
      setMessage(error.message)
      return
    }

    await supabase.from('audit_logs').insert({
      user_id: user?.id,
      action: 'create_time_off_request',
      details: `Logged time-off for ${personType === 'staff' ? staffMember?.staff_name : managers.find(m => m.id === personId)?.full_name}`,
    })
    setModal(false)
    setForm({ person: '', requestType: 'weekly_day_off', dayOfWeek: '1', startDate: '', endDate: '', reason: '' })
    setMessage('Time-off request logged and approved.')
    await loadRequests()
  }

  const filtered = useMemo(
    () => requests.filter(request => statusFilter === 'all' ? true : request.status === statusFilter),
    [requests, statusFilter],
  )

  const stats = useMemo(() => ({
    total: requests.length,
    pending: requests.filter(r => r.status === 'pending').length,
    approved: requests.filter(r => r.status === 'approved').length,
    rejected: requests.filter(r => r.status === 'rejected').length,
    oneOff: requests.filter(r => r.request_type === 'leave').length,
  }), [requests])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent-100 text-accent-600">
            <CalendarClock className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Time-Off Requests</h1>
            <p className="text-gray-500 text-sm mt-1">Review weekly day-off and one-off leave requests from staff and managers.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <select
              value={statusFilter}
              onChange={event => setStatusFilter(event.target.value)}
              className="w-44 appearance-none rounded-xl border border-gray-200 bg-white py-2.5 pl-9 pr-9 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-accent-500"
            >
              <option value="all">All Requests</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          </div>
        </div>
      </div>

      {message && <div className="mb-4 rounded-lg border border-accent-200 bg-accent-100 px-4 py-3 text-sm text-accent-800">{message}</div>}

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard icon={Users} iconBg="bg-blue-100" iconColor="text-blue-600" label="Total Requests" value={stats.total} subLabel="This week" />
        <StatCard icon={Clock} iconBg="bg-amber-100" iconColor="text-amber-600" label="Pending" value={stats.pending} subLabel="Awaiting review" />
        <StatCard icon={CheckCircle2} iconBg="bg-green-100" iconColor="text-green-600" label="Approved" value={stats.approved} subLabel="This week" />
        <StatCard icon={XCircle} iconBg="bg-red-100" iconColor="text-red-600" label="Rejected" value={stats.rejected} subLabel="This week" />
        <StatCard icon={CalendarDays} iconBg="bg-purple-100" iconColor="text-purple-600" label="Leave Request" value={stats.oneOff} subLabel="This week" />
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
        <div className="divide-y divide-gray-100">
          {paginated.map((request) => {
            const isManager = !request.staff_profiles
            const name = request.staff_profiles?.staff_name || request.requested_by?.full_name || request.requested_by?.email || 'Unknown'
            const palette = avatarPaletteFor(name)
            const statusMeta = requestStatusMeta[request.status] || requestStatusMeta.pending
            const StatusIcon = statusMeta.icon
            const isRejecting = rejectingId === request.id
            return (
              <div key={request.id} className="px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${palette.bg} ${palette.text}`}>
                      {initialsOf(name)}
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold text-gray-900">{name}</p>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${isManager ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                          {isManager ? 'Manager' : 'Staff'}
                        </span>
                      </div>
                      <p className="mt-1 flex items-center gap-1.5 text-sm text-gray-500">
                        <Calendar className="h-3.5 w-3.5 shrink-0" /> {describeRequest(request)}
                      </p>
                      <p className="mt-1 text-xs text-gray-400">Submitted {new Date(request.created_at).toLocaleString()}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <span className="rounded-full bg-accent-100 px-3 py-1 text-xs font-medium text-accent-700 whitespace-nowrap">
                      {request.request_type === 'weekly_day_off' ? 'Weekly Day Off' : 'Leave'}
                    </span>
                    <span className="hidden h-6 w-px bg-gray-200 sm:block" />
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${statusMeta.badge}`}>
                      <StatusIcon className="h-3.5 w-3.5" /> {statusMeta.label}
                    </span>
                    {request.status === 'pending' && !isRejecting && (
                      <>
                        <button
                          onClick={() => handleAction(request.id, 'approved')}
                          disabled={actionId === request.id}
                          className="inline-flex items-center gap-1 rounded-lg border border-green-200 px-3 py-1.5 text-xs font-medium text-green-600 hover:bg-green-50 disabled:opacity-60"
                        >
                          <Check className="h-3.5 w-3.5" /> Approve
                        </button>
                        <button
                          onClick={() => setRejectingId(request.id)}
                          disabled={actionId === request.id}
                          className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
                        >
                          <X className="h-3.5 w-3.5" /> Reject
                        </button>
                      </>
                    )}
                    <ChevronRight className="hidden h-4 w-4 text-gray-300 sm:block" />
                  </div>
                </div>

                {request.reason && <p className="mt-2 pl-[52px] text-xs text-gray-500">Reason: {request.reason}</p>}
                {request.status === 'rejected' && request.rejection_reason && (
                  <p className="mt-1 pl-[52px] text-xs text-red-500">Rejected: {request.rejection_reason}</p>
                )}

                {isRejecting && (
                  <div className="mt-3 space-y-2 pl-[52px]">
                    <textarea
                      value={rejectReason}
                      onChange={e => setRejectReason(e.target.value)}
                      rows={2}
                      placeholder="Reason for rejecting (optional)..."
                      className="w-full max-w-md rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleAction(request.id, 'rejected', rejectReason)}
                        disabled={actionId === request.id}
                        className="rounded-lg bg-red-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-600 disabled:opacity-50"
                      >
                        Confirm Reject
                      </button>
                      <button
                        type="button"
                        onClick={() => { setRejectingId(null); setRejectReason('') }}
                        className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
          {!loading && filtered.length === 0 && (
            <div className="px-5 py-12 text-center text-sm text-gray-400">
              {requests.length === 0 ? 'No time-off requests yet.' : 'No requests match this filter.'}
            </div>
          )}
        </div>

        {filtered.length > 0 && (
          <div className="flex flex-col items-center justify-between gap-3 border-t border-gray-100 px-5 py-3 sm:flex-row">
            <p className="text-sm text-gray-500">Showing {paginated.length} of {filtered.length} requests</p>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(pageNumber => (
                <button
                  key={pageNumber}
                  onClick={() => setPage(pageNumber)}
                  className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border text-sm font-medium ${pageNumber === currentPage ? 'border-accent-500 bg-accent-100 text-accent-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                >
                  {pageNumber}
                </button>
              ))}
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setModal(false)}>
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl" onClick={event => event.stopPropagation()}>
            <div className="mb-5 flex items-start justify-between gap-4">
              <div className="flex items-start gap-4">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent-100 text-accent-600">
                  <CalendarClock className="h-6 w-6" />
                </span>
                <div>
                  <h3 className="text-xl font-bold text-gray-900">New Request</h3>
                  <p className="mt-0.5 text-sm text-gray-500">Log a time-off request on behalf of a manager or staff member. It&apos;s saved as approved.</p>
                </div>
              </div>
              <button onClick={() => setModal(false)} className="shrink-0 rounded-lg p-1 hover:bg-gray-100">
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>

            <form onSubmit={handleCreateRequest} className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-semibold text-gray-800">Person</label>
                <select
                  value={form.person}
                  onChange={event => setForm(f => ({ ...f, person: event.target.value }))}
                  required
                  className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
                >
                  <option value="">Select a person...</option>
                  {managers.length > 0 && (
                    <optgroup label="Managers">
                      {managers.map(manager => <option key={manager.id} value={`manager:${manager.id}`}>{manager.full_name}</option>)}
                    </optgroup>
                  )}
                  {staffOptions.length > 0 && (
                    <optgroup label="Staff">
                      {staffOptions.map(staff => <option key={staff.id} value={`staff:${staff.id}`}>{staff.staff_name}</option>)}
                    </optgroup>
                  )}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-gray-800">Request Type</label>
                <div className="inline-flex w-full rounded-xl bg-gray-100 p-1">
                  {[{ value: 'weekly_day_off', label: 'Weekly Day Off' }, { value: 'leave', label: 'One-off Leave' }].map(option => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, requestType: option.value }))}
                      className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${form.requestType === option.value ? 'bg-white text-accent-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {form.requestType === 'weekly_day_off' ? (
                <div>
                  <label className="mb-2 block text-sm font-semibold text-gray-800">Day of Week</label>
                  <select
                    value={form.dayOfWeek}
                    onChange={event => setForm(f => ({ ...f, dayOfWeek: event.target.value }))}
                    className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
                  >
                    {WEEKDAY_LABELS.map((label, value) => <option key={label} value={value}>{label}</option>)}
                  </select>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-gray-800">Start Date</label>
                    <input
                      type="date"
                      value={form.startDate}
                      onChange={event => setForm(f => ({ ...f, startDate: event.target.value }))}
                      required
                      className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-gray-800">End Date</label>
                    <input
                      type="date"
                      value={form.endDate}
                      min={form.startDate || undefined}
                      onChange={event => setForm(f => ({ ...f, endDate: event.target.value }))}
                      required
                      className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="mb-2 block text-sm font-semibold text-gray-800">Reason <span className="font-normal text-gray-400">(Optional)</span></label>
                <textarea
                  value={form.reason}
                  onChange={event => setForm(f => ({ ...f, reason: event.target.value }))}
                  rows={3}
                  className="w-full resize-none rounded-lg border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
                />
              </div>

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setModal(false)} className="flex-1 rounded-lg border border-gray-200 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-accent hover:bg-accent-600 py-3 text-sm font-semibold text-white transition disabled:opacity-60">
                  <Plus className="h-4 w-4" /> {saving ? 'Saving...' : 'Create Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
