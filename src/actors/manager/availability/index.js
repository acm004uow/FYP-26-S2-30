import Layout from '../../../components/Layout'
import { useEffect, useMemo, useState } from 'react'
import { Activity, Bell, Briefcase, CheckCircle, Clock, MapPin, RefreshCw, Search, Star, Users, XCircle } from 'lucide-react'
import { supabase } from '../../../../lib/supabaseClient'

const availabilityMeta = {
  available: { label: 'Available', dot: 'bg-green-500', badge: 'bg-green-100 text-green-700' },
  unavailable: { label: 'Unavailable', dot: 'bg-red-500', badge: 'bg-red-100 text-red-700' },
  time_off: { label: 'Time Off', dot: 'bg-gray-400', badge: 'bg-gray-100 text-gray-700' },
}

const filterLabels = {
  all: 'all staff',
  available: 'available staff',
  unavailable: 'unavailable staff',
  suspended: 'suspended staff',
}

const requestStatusMeta = {
  pending: { label: 'Pending', badge: 'bg-yellow-100 text-yellow-700' },
  approved: { label: 'Approved', badge: 'bg-green-100 text-green-700' },
  rejected: { label: 'Rejected', badge: 'bg-red-100 text-red-700' },
}

const formatAvailability = (value) => availabilityMeta[value] || availabilityMeta.unavailable

export default function ManagerAvailability() {
  const [staffRows, setStaffRows] = useState([])
  const [availabilityRequests, setAvailabilityRequests] = useState([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(true)
  const [requestsLoading, setRequestsLoading] = useState(true)
  const [requestActionId, setRequestActionId] = useState(null)

  const loadAvailability = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('staff_profiles')
      .select('id,staff_name,email,skills,assigned_region,availability,current_workload,weekly_working_hours,max_weekly_hours,performance_rating,status,is_suspended,updated_at')
      .order('staff_name')

    if (error) {
      setNotice(error.message)
    } else {
      setStaffRows(data || [])
    }
    setLoading(false)
  }

  const loadAvailabilityRequests = async () => {
    setRequestsLoading(true)
    const { data, error } = await supabase
      .from('availability_requests')
      .select('id,staff_profile_id,current_availability,requested_availability,status,manager_id,comment,created_at,updated_at,requested_by(full_name,email),staff_profiles(id,staff_name)')
      .order('created_at', { ascending: false })

    if (error) {
      setNotice(error.message)
      setAvailabilityRequests([])
    } else {
      setAvailabilityRequests(data || [])
    }
    setRequestsLoading(false)
  }

  useEffect(() => {
    let cancelled = false

    loadAvailability()
    loadAvailabilityRequests()

    const availabilityChannel = supabase
      .channel(`manager-availability-page-${Date.now()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'staff_profiles' },
        (payload) => {
          if (cancelled) return
          const row = payload.new || payload.old
          if (payload.eventType === 'UPDATE' && payload.old?.availability !== payload.new?.availability) {
            const meta = formatAvailability(payload.new.availability)
            setNotice(`${payload.new.staff_name || 'A staff member'} is now ${meta.label}.`)
          }
          setStaffRows(prev => {
            if (payload.eventType === 'DELETE') return prev.filter(item => item.id !== payload.old.id)
            const exists = prev.some(item => item.id === row.id)
            if (exists) return prev.map(item => item.id === row.id ? row : item)
            return [...prev, row].sort((a, b) => String(a.staff_name).localeCompare(String(b.staff_name)))
          })
        }
      )
      .subscribe()

    const requestChannel = supabase
      .channel(`manager-availability-requests-${Date.now()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'availability_requests' },
        (payload) => {
          if (cancelled) return
          loadAvailabilityRequests()
          if (payload.eventType === 'INSERT') {
            setNotice('New availability change request received.')
          }
        }
      )
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(availabilityChannel)
      supabase.removeChannel(requestChannel)
    }
  }, [])

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase()
    const statusFilteredRows = staffRows.filter(row => {
      const suspended = row.is_suspended || row.status !== 'active'
      if (statusFilter === 'available') return row.availability === 'available' && !suspended
      if (statusFilter === 'unavailable') return row.availability === 'unavailable' && !suspended
      if (statusFilter === 'suspended') return suspended
      return true
    })

    if (!term) return statusFilteredRows
    return statusFilteredRows.filter(row => [
      row.staff_name,
      row.email,
      row.assigned_region,
      ...(row.skills || []),
      formatAvailability(row.availability).label,
    ].some(value => String(value || '').toLowerCase().includes(term)))
  }, [search, staffRows, statusFilter])

  const summary = useMemo(() => ({
    total: staffRows.length,
    available: staffRows.filter(row => row.availability === 'available' && !row.is_suspended).length,
    unavailable: staffRows.filter(row => row.availability === 'unavailable' && !row.is_suspended).length,
    suspended: staffRows.filter(row => row.is_suspended || row.status !== 'active').length,
  }), [staffRows])

  const handleAvailabilityAction = async (requestId, action) => {
    setRequestActionId(requestId)
    const { data: { user } } = await supabase.auth.getUser()
    const request = availabilityRequests.find(req => req.id === requestId)
    if (!request) {
      setRequestActionId(null)
      return
    }

    const updates = {
      status: action,
      manager_id: user?.id,
      updated_at: new Date().toISOString(),
    }

    const { error: updateError } = await supabase
      .from('availability_requests')
      .update(updates)
      .eq('id', requestId)

    if (updateError) {
      setNotice(updateError.message)
      setRequestActionId(null)
      return
    }

    if (action === 'approved') {
      await supabase
        .from('staff_profiles')
        .update({ availability: request.requested_availability, updated_at: new Date().toISOString() })
        .eq('id', request.staff_profile_id)
    }

    if (request.requested_by) {
      await supabase.from('notifications').insert({
        user_id: request.requested_by,
        title: `Availability request ${action}`,
        message: `Your availability change request to ${availabilityMeta[request.requested_availability]?.label || request.requested_availability} has been ${action}.`,
      })
    }

    setNotice(`Availability request ${action}.`)
    setRequestActionId(null)
    await loadAvailability()
    await loadAvailabilityRequests()
  }

  const handleStatusFilterChange = (nextFilter) => {
    setStatusFilter(nextFilter)
    setSearch('')
  }

  return (
    <Layout role="manager">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Staff Availability</h1>
            <p className="text-gray-500 text-sm mt-1">Monitor real-time workforce availability and workload.</p>
          </div>
          <button
            onClick={loadAvailability}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {notice && (
          <div className="mb-5 flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">
            <Bell className="h-4 w-4" />
            {notice}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 mb-6">
          <SummaryCard icon={Users} label="Total Staff" value={summary.total} active={statusFilter === 'all'} onClick={() => handleStatusFilterChange('all')} />
          <SummaryCard icon={Activity} label="Available" value={summary.available} tone="green" active={statusFilter === 'available'} onClick={() => handleStatusFilterChange('available')} />
          <SummaryCard icon={Clock} label="Unavailable" value={summary.unavailable} tone="red" active={statusFilter === 'unavailable'} onClick={() => handleStatusFilterChange('unavailable')} />
          <SummaryCard icon={Briefcase} label="Suspended" value={summary.suspended} tone="gray" active={statusFilter === 'suspended'} onClick={() => handleStatusFilterChange('suspended')} />
        </div>

        <div className="mb-8 rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Availability Change Requests</h2>
              <p className="text-sm text-gray-500">Review staff availability change requests and approve or reject them.</p>
            </div>
            <div className="rounded-full bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700">{availabilityRequests.length} requests</div>
          </div>

          <div className="mt-5 overflow-hidden rounded-3xl border border-gray-100">
            <div className="hidden grid-cols-[1.6fr_1fr_1fr_0.8fr] gap-4 border-b border-gray-100 bg-gray-50 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 md:grid">
              <span>Staff</span>
              <span>Current</span>
              <span>Requested</span>
              <span>Status</span>
            </div>
            <div className="divide-y divide-gray-100">
              {availabilityRequests.map((request) => (
                <div key={request.id} className="grid gap-4 px-5 py-4 md:grid-cols-[1.6fr_1fr_1fr_0.8fr] md:items-center">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-gray-900">{request.staff_profiles?.staff_name || 'Unknown staff'}</p>
                    <p className="truncate text-xs text-gray-500">Requested by {request.requested_by?.full_name || request.requested_by?.email || 'Staff'}</p>
                    <p className="text-xs text-gray-400 mt-1">{new Date(request.created_at).toLocaleString()}</p>
                    <p className="mt-2 text-xs text-gray-500">Reason: {request.comment || 'No reason provided'}</p>
                  </div>
                  <div className="text-sm text-gray-700">{formatAvailability(request.current_availability).label}</div>
                  <div className="text-sm text-gray-700">{formatAvailability(request.requested_availability).label}</div>
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${requestStatusMeta[request.status]?.badge || 'bg-gray-100 text-gray-600'}`}>
                      {requestStatusMeta[request.status]?.label || request.status}
                    </span>
                    {request.status === 'pending' && (
                      <div className="ml-auto flex gap-2">
                        <button
                          onClick={() => handleAvailabilityAction(request.id, 'approved')}
                          disabled={requestActionId === request.id}
                          className="rounded-lg bg-green-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-600 disabled:opacity-60"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => handleAvailabilityAction(request.id, 'rejected')}
                          disabled={requestActionId === request.id}
                          className="rounded-lg bg-red-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-600 disabled:opacity-60"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {availabilityRequests.length === 0 && (
                <div className="px-5 py-8 text-center text-sm text-gray-400">No availability requests at this time.</div>
              )}
            </div>
          </div>
        </div>

        <p className="mb-3 text-sm font-medium text-gray-600">
          Showing {filteredRows.length} {filterLabels[statusFilter]}
        </p>

        <div className="relative mb-6">
          <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Search by name, skill, region, email, or availability..."
            className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-12 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
          <div className="hidden grid-cols-[1.4fr_1fr_1fr_0.8fr_0.8fr] gap-4 border-b border-gray-100 bg-gray-50 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 md:grid">
            <span>Staff</span>
            <span>Availability</span>
            <span>Region / Skills</span>
            <span>Workload</span>
            <span>Rating</span>
          </div>
          <div className="divide-y divide-gray-100">
            {filteredRows.map(row => {
              const meta = formatAvailability(row.availability)
              const suspended = row.is_suspended || row.status !== 'active'
              return (
                <div key={row.id} className="grid gap-4 px-5 py-4 md:grid-cols-[1.4fr_1fr_1fr_0.8fr_0.8fr] md:items-center">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-gray-900">{row.staff_name}</p>
                    <p className="truncate text-xs text-gray-500">{row.email || 'No email recorded'}</p>
                  </div>
                  <div>
                    <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${suspended ? availabilityMeta.time_off.badge : meta.badge}`}>
                      <span className={`h-2 w-2 rounded-full ${suspended ? availabilityMeta.time_off.dot : meta.dot}`} />
                      {suspended ? 'Suspended' : meta.label}
                    </span>
                  </div>
                  <div className="min-w-0 text-sm text-gray-600">
                    <p className="flex items-center gap-1 truncate"><MapPin className="h-3.5 w-3.5" />{row.assigned_region || 'No region'}</p>
                    <p className="truncate text-xs text-gray-400">{(row.skills || []).join(', ') || 'No skills recorded'}</p>
                  </div>
                  <p className="text-sm text-gray-700">{row.current_workload || 0} active</p>
                  <p className="flex items-center gap-1 text-sm text-gray-700"><Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />{Number(row.performance_rating || 0).toFixed(1)}</p>
                </div>
              )
            })}
            {filteredRows.length === 0 && (
              <div className="px-5 py-12 text-center text-sm text-gray-400">
                No staff availability records found.
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  )
}

function SummaryCard({ icon: Icon, label, value, tone = 'blue', active = false, onClick }) {
  const tones = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    red: 'bg-red-50 text-red-600',
    gray: 'bg-gray-100 text-gray-600',
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`w-full cursor-pointer rounded-xl border bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${active ? 'border-blue-500 ring-2 ring-blue-100' : 'border-gray-100'}`}
    >
      <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-lg ${tones[tone]}`}>
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-sm text-gray-500">{label}</p>
    </button>
  )
}
