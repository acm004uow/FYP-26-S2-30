import Layout from '../../../components/Layout'
import AddressFields from '../../../components/AddressFields'
import TimeInput from '../../../components/TimeInput'
import AttendanceScanner from '../../../components/AttendanceScanner'
import { useEffect, useState } from 'react'
import { Briefcase, Bell, Calendar, ChevronDown, Clock, Filter, GripVertical, History, ListChecks, MapPin, QrCode, Search, Sparkles, Star, UserCheck } from 'lucide-react'
import { supabase } from '../../../../lib/supabaseClient'
import { generateRecommendations } from '../../../../lib/recommendationEngine'
import { fetchApprovedTimeOffClient, getExcludedStaffIdsForDate, isStaffOffOnDate } from '../../../../lib/staffTimeOff'
import { SERVICE_TYPES, loadServiceTypes } from '../../../../lib/serviceTypes'
import { formatDuration } from '../../../../lib/attendance'
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

const emptyForm = {
  serviceType: SERVICE_TYPES[0],
  location: '',
  description: '',
  scheduledDate: '',
  scheduledTime: '',
  estimatedHours: 2,
}

const staffStatusColor = {
  Available: 'bg-green-100 text-green-700',
  Busy: 'bg-blue-100 text-blue-700',
  'Time Off': 'bg-amber-100 text-amber-700',
  'On Leave': 'bg-gray-100 text-gray-600',
}

const STAFF_STATUS_FILTERS = ['All', 'Available', 'Busy', 'Time Off', 'On Leave']

// Deterministic per-name color so the same staff member always gets the same avatar color.
const AVATAR_PALETTE = [
  'bg-purple-500 text-white',
  'bg-green-500 text-white',
  'bg-teal-500 text-white',
  'bg-orange-500 text-white',
  'bg-indigo-500 text-white',
  'bg-pink-500 text-white',
  'bg-blue-500 text-white',
]

function avatarColor(name) {
  let hash = 0
  for (let i = 0; i < (name || '').length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length]
}

export default function DepartmentDashboard() {
  const { user } = useAuthUser()
  const [hostAdminId, setHostAdminId] = useState(null)
  const [departmentId, setDepartmentId] = useState(null)
  const [departmentName, setDepartmentName] = useState('')
  const [staffRows, setStaffRows] = useState([])
  const [recommendationPool, setRecommendationPool] = useState([])
  const [recommendationParams, setRecommendationParams] = useState({})
  const [serviceTypes, setServiceTypes] = useState(SERVICE_TYPES)
  const [approvedTimeOff, setApprovedTimeOff] = useState([])
  const [form, setForm] = useState(emptyForm)
  const [coordinates, setCoordinates] = useState(null)
  const [recommendations, setRecommendations] = useState([])
  const [selectedStaffId, setSelectedStaffId] = useState('')
  const [notification, setNotification] = useState('')
  const [creating, setCreating] = useState(false)
  const [staffSearch, setStaffSearch] = useState('')
  const [staffStatusFilter, setStaffStatusFilter] = useState('All')
  const [staffFiltersOpen, setStaffFiltersOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('create')
  const [todayAttendance, setTodayAttendance] = useState(null)
  const [showScanner, setShowScanner] = useState(false)
  const [scannerMessage, setScannerMessage] = useState('')
  const [historyBookings, setHistoryBookings] = useState([])
  const [historyLoading, setHistoryLoading] = useState(true)

  const showNotification = (message) => {
    setNotification(message)
    setTimeout(() => setNotification(null), 3000)
  }

  const loadDashboard = async () => {
    if (!user) return
    const { data: myProfile } = await supabase
      .from('profiles')
      .select('host_admin_id,department_id')
      .eq('id', user?.id)
      .single()

    const resolvedHostAdminId = myProfile?.host_admin_id
    const resolvedDepartmentId = myProfile?.department_id
    setHostAdminId(resolvedHostAdminId || null)
    setDepartmentId(resolvedDepartmentId || null)
    if (!resolvedHostAdminId) return

    const [{ data: department }, { data: staff }, { data: pool }, { data: params }, types, timeOff] = await Promise.all([
      resolvedDepartmentId
        ? supabase.from('departments').select('name').eq('id', resolvedDepartmentId).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from('staff_profiles')
        .select('id,user_id,staff_name,skills,availability,current_workload,performance_rating,status,is_suspended')
        .eq('host_admin_id', resolvedHostAdminId)
        .eq('status', 'active')
        .order('staff_name'),
      supabase
        .from('staff_profiles')
        .select('id,staff_name,skills,availability,performance_rating,current_workload,assigned_region,latitude,longitude,weekly_working_hours,max_weekly_hours,is_suspended,status')
        .eq('host_admin_id', resolvedHostAdminId)
        .eq('is_suspended', false)
        .eq('status', 'active'),
      supabase.from('system_parameters').select('*').eq('id', 1).single(),
      loadServiceTypes(supabase, resolvedHostAdminId),
      fetchApprovedTimeOffClient(supabase, resolvedHostAdminId),
    ])

    setDepartmentName(department?.name || '')
    setStaffRows((staff || []).map(row => ({
      id: row.id,
      userId: row.user_id,
      name: row.staff_name,
      role: row.skills?.[0] || 'Staff Member',
      status: row.is_suspended
        ? 'On Leave'
        : row.availability === 'available' ? 'Available' : row.availability === 'time_off' ? 'Time Off' : 'Busy',
      canAssign: !row.is_suspended && row.status === 'active' && row.availability === 'available',
      tasks: row.current_workload || 0,
      rating: row.performance_rating || 0,
    })))
    setRecommendationPool(pool || [])
    setRecommendationParams(params || {})
    setServiceTypes(types)
    setApprovedTimeOff(timeOff)
    setForm(prev => ({ ...prev, serviceType: types.includes(prev.serviceType) ? prev.serviceType : types[0] }))
  }

  const loadAttendanceToday = async () => {
    if (!user) return
    const todayIso = new Date().toISOString().slice(0, 10)
    const { data } = await supabase
      .from('attendance_records')
      .select('clocked_in_at,clocked_out_at')
      .eq('profile_id', user?.id)
      .eq('work_date', todayIso)
      .maybeSingle()
    setTodayAttendance(data || null)
  }

  const loadHistory = async () => {
    if (!user) return
    setHistoryLoading(true)
    const { data } = await supabase
      .from('bookings')
      .select('id,service_type,location,scheduled_date,scheduled_time,status,created_at,staff_profiles(staff_name)')
      .eq('created_by', user?.id)
      .eq('source', 'department')
      .order('created_at', { ascending: false })
      .limit(50)
    setHistoryBookings(data || [])
    setHistoryLoading(false)
  }

  useEffect(() => {
    loadDashboard()
    loadAttendanceToday()
    loadHistory()
  }, [user])

  const handleScanResult = ({ status, message }) => {
    setShowScanner(false)
    if (status === 'clocked_in') setScannerMessage('Clocked in successfully.')
    else if (status === 'clocked_out') setScannerMessage('Clocked out successfully.')
    else if (status === 'already_completed') setScannerMessage("You've already completed attendance for today.")
    else setScannerMessage(message || 'Check-in failed.')
    loadAttendanceToday()
  }

  useEffect(() => {
    if (!form.location) {
      setRecommendations([])
      return
    }
    const excludedStaffIds = form.scheduledDate
      ? getExcludedStaffIdsForDate(form.scheduledDate, approvedTimeOff)
      : new Set()
    const recs = generateRecommendations(
      recommendationPool,
      {
        location: form.location,
        latitude: coordinates?.latitude ?? null,
        longitude: coordinates?.longitude ?? null,
        estimated_hours: form.estimatedHours,
        requested_text: form.description || '',
      },
      recommendationParams,
      excludedStaffIds
    )
    setRecommendations(recs)
  }, [form.location, coordinates, form.estimatedHours, form.description, form.scheduledDate, recommendationPool, recommendationParams, approvedTimeOff])

  useEffect(() => {
    if (!recommendations.length) return
    setSelectedStaffId(prev => (prev && recommendationPool.some(staff => staff.id === prev) ? prev : recommendations[0].staff_id))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recommendations])

  const getActiveDepartmentStaff = async () => {
    if (!user) return null
    const { data: myProfile } = await supabase
      .from('profiles')
      .select('role,status')
      .eq('id', user?.id)
      .single()

    if (myProfile?.role !== 'department_staff' || myProfile?.status !== 'active') {
      showNotification('Only an active department staff account can create and assign tasks.')
      return null
    }
    return user
  }

  const selectStaffManually = (staff) => {
    if (!staff.canAssign) return
    setSelectedStaffId(staff.id)
  }

  const handleCreateTask = async (event) => {
    event.preventDefault()
    if (!form.location.trim()) {
      showNotification('Please enter a location.')
      return
    }

    const user = await getActiveDepartmentStaff()
    if (!user) return

    const staff = staffRows.find(item => item.id === selectedStaffId) || null
    if (staff && isStaffOffOnDate(staff.id, form.scheduledDate, approvedTimeOff)) {
      showNotification(`${staff.name} has approved time off on ${form.scheduledDate} and cannot be assigned.`)
      return
    }

    setCreating(true)
    const matchedRecommendation = recommendations.find(rec => rec.staff_id === selectedStaffId)
    const { data: createdBooking, error } = await supabase.from('bookings').insert({
      host_admin_id: hostAdminId,
      service_type: form.serviceType,
      location: form.location,
      latitude: coordinates?.latitude ?? null,
      longitude: coordinates?.longitude ?? null,
      description: form.description,
      scheduled_date: form.scheduledDate || null,
      scheduled_time: form.scheduledTime || null,
      estimated_hours: form.estimatedHours || 2,
      assigned_staff_id: staff?.id || null,
      recommendation_reason: matchedRecommendation?.reason || (staff ? 'Manually assigned by department staff' : null),
      status: 'approved',
      reviewed_by: user.id,
      source: 'department',
      department_id: departmentId,
      created_by: user.id,
      creation_method: staff ? (recommendations[0]?.staff_id === staff.id ? 'ai' : 'manual') : null,
    }).select('id').single()
    setCreating(false)

    if (error) {
      showNotification(error.message)
      return
    }

    if (staff) {
      await supabase
        .from('staff_profiles')
        .update({ current_workload: Number(staff.tasks || 0) + 1, updated_at: new Date().toISOString() })
        .eq('id', staff.id)

      if (staff.userId) {
        await supabase.from('notifications').insert({
          user_id: staff.userId,
          title: 'New task assignment',
          message: `${form.serviceType} has been assigned to you.`,
        })
      }
    }

    await supabase.from('audit_logs').insert({ user_id: user.id, action: 'department_create_task', details: `${form.serviceType} (${createdBooking?.id || ''})` })
    showNotification(staff ? `Task created and assigned to ${staff.name}.` : 'Task created, unassigned.')
    setForm(emptyForm)
    setCoordinates(null)
    setSelectedStaffId('')
    await loadDashboard()
    await loadHistory()
  }

  const visibleStaffRows = staffRows.filter(staff => {
    if (staffSearch.trim() && !staff.name.toLowerCase().includes(staffSearch.trim().toLowerCase())) return false
    if (staffStatusFilter !== 'All' && staff.status !== staffStatusFilter) return false
    return true
  })

  return (
    <Layout role="departmentStaff">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-start gap-3 mb-6">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent text-white">
            <Briefcase className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{departmentName ? `${departmentName} Department` : 'Department Dashboard'}</h1>
            <p className="text-gray-500 mt-1">Create a task and assign it to available staff — pick someone yourself, or let AI recommend the best match.</p>
          </div>
        </div>

        {notification && <div className="mb-4 p-3 bg-green-50 text-green-700 rounded-lg flex items-center gap-2"><Bell className="w-4 h-4" />{notification}</div>}

        <div className="mb-6 rounded-xl border bg-white shadow-sm p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-gray-800">
              {todayAttendance?.clocked_in_at && todayAttendance?.clocked_out_at
                ? `Completed — worked ${formatDuration(new Date(todayAttendance.clocked_out_at) - new Date(todayAttendance.clocked_in_at))} today.`
                : todayAttendance?.clocked_in_at
                  ? `Checked in since ${new Date(todayAttendance.clocked_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`
                  : "You haven't checked in today."}
            </p>
            {scannerMessage && <p className="text-xs text-accent-600 mt-1">{scannerMessage}</p>}
          </div>
          {!(todayAttendance?.clocked_in_at && todayAttendance?.clocked_out_at) && (
            <button
              onClick={() => { setScannerMessage(''); setShowScanner(true) }}
              className="flex items-center justify-center gap-2 rounded-lg bg-accent hover:bg-accent-600 px-4 py-2 text-sm font-semibold text-white transition"
            >
              <QrCode className="w-4 h-4" /> {todayAttendance?.clocked_in_at ? 'Clock Out' : 'Clock In'}
            </button>
          )}
        </div>

        {showScanner && <AttendanceScanner onClose={() => setShowScanner(false)} onResult={handleScanResult} />}

        <div className="mb-6 inline-flex rounded-lg bg-gray-100 p-1">
          <button
            type="button"
            onClick={() => setActiveTab('create')}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md transition ${activeTab === 'create' ? 'bg-white text-accent-600 shadow-sm' : 'text-gray-500'}`}
          >
            <ListChecks className="w-4 h-4" /> Create Task
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md transition ${activeTab === 'history' ? 'bg-white text-accent-600 shadow-sm' : 'text-gray-500'}`}
          >
            <History className="w-4 h-4" /> History
          </button>
        </div>

        {activeTab === 'create' ? (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-6">
          <form onSubmit={handleCreateTask} className="bg-white rounded-xl shadow-sm border p-5 space-y-4 h-fit">
            <h2 className="font-semibold text-gray-900">New Task</h2>

            <div>
              <label className="text-sm font-medium text-gray-700">Service Type</label>
              <select value={form.serviceType} onChange={e => setForm({ ...form, serviceType: e.target.value })} className="mt-1 w-full border rounded-lg p-2 text-sm">
                {serviceTypes.map(type => <option key={type} value={type}>{type}</option>)}
              </select>
            </div>

            <AddressFields
              onLocationChange={location => setForm(prev => ({ ...prev, location }))}
              onCoordinatesChange={setCoordinates}
              compact
            />

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-gray-700">Scheduled Date</label>
                <input type="date" value={form.scheduledDate} onChange={e => setForm({ ...form, scheduledDate: e.target.value })} className="mt-1 w-full border rounded-lg p-2 text-sm" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Scheduled Time</label>
                <TimeInput className="mt-1" value={form.scheduledTime} onChange={value => setForm({ ...form, scheduledTime: value })} />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700">Estimated Hours</label>
              <input type="number" min="1" step="0.5" value={form.estimatedHours} onChange={e => setForm({ ...form, estimatedHours: Number(e.target.value) })} className="mt-1 w-full border rounded-lg p-2 text-sm" />
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700">Description (optional)</label>
              <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="mt-1 w-full border rounded-lg p-2 text-sm" rows={2} />
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-accent" /> Assign Staff
              </label>
              {form.location ? (
                recommendations.length > 0 ? (
                  <>
                    <select
                      value={selectedStaffId}
                      onChange={e => setSelectedStaffId(e.target.value)}
                      className="mt-1 w-full border rounded-lg p-2 text-sm"
                    >
                      <option value="">— Unassigned (assign later) —</option>
                      {recommendations.map(rec => (
                        <option key={rec.staff_id} value={rec.staff_id}>{rec.staff_name} — {rec.reason}</option>
                      ))}
                    </select>
                    {selectedStaffId && recommendations[0]?.staff_id === selectedStaffId && (
                      <p className="mt-1 text-xs text-accent-600 flex items-center gap-1"><Sparkles className="w-3 h-3" /> AI-recommended top match</p>
                    )}
                  </>
                ) : (
                  <p className="mt-1 text-xs text-gray-400">No strong staff match found yet — pick someone from Available Staff, or leave unassigned.</p>
                )
              ) : (
                <p className="mt-1 text-xs text-gray-400">Enter a location to see AI-recommended staff.</p>
              )}
            </div>

            <button type="submit" disabled={creating} className="w-full bg-accent hover:bg-accent-600 text-white py-2 rounded-lg flex items-center justify-center gap-2 transition disabled:opacity-60">
              <UserCheck className="w-4 h-4" /> {creating ? 'Creating...' : 'Create & Assign Task'}
            </button>
          </form>

          <div className="bg-white rounded-xl shadow-sm border h-fit overflow-hidden">
            <div className="p-5 border-b">
              <h2 className="font-semibold text-gray-900">Available Staff</h2>
              <p className="text-sm text-gray-500 mt-1">Select a staff member to assign them to the task on the left.</p>
              <div className="mt-3 flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    value={staffSearch}
                    onChange={e => setStaffSearch(e.target.value)}
                    placeholder="Search staff..."
                    className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent-200"
                  />
                </div>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setStaffFiltersOpen(open => !open)}
                    className="flex items-center gap-1 px-3 py-2 border rounded-lg text-sm text-gray-700 hover:bg-gray-50"
                  >
                    <Filter className="w-4 h-4" /> <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                  </button>
                  {staffFiltersOpen && (
                    <div className="absolute right-0 mt-1 w-36 bg-white border rounded-lg shadow-lg z-10 overflow-hidden">
                      {STAFF_STATUS_FILTERS.map(option => (
                        <button
                          key={option}
                          type="button"
                          onClick={() => { setStaffStatusFilter(option); setStaffFiltersOpen(false) }}
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${staffStatusFilter === option ? 'text-accent-600 font-medium' : 'text-gray-700'}`}
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="divide-y divide-gray-50 max-h-[70vh] overflow-y-auto">
              {visibleStaffRows.map(staff => (
                <button
                  type="button"
                  key={staff.id}
                  onClick={() => selectStaffManually(staff)}
                  disabled={!staff.canAssign}
                  className={`w-full text-left p-4 transition ${staff.canAssign ? 'hover:bg-gray-50' : 'cursor-not-allowed opacity-70'} ${selectedStaffId === staff.id ? 'bg-accent-100' : ''}`}
                  title={staff.canAssign ? 'Assign this staff member to the task' : 'Only available active staff can be assigned'}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold text-sm flex-shrink-0 ${avatarColor(staff.name)}`}>
                      {staff.name.split(' ').map(part => part[0]).join('').slice(0, 2)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-800 truncate">{staff.name}</p>
                      <p className="text-xs text-gray-500 truncate">{staff.role} - {staff.tasks} active tasks</p>
                    </div>
                    {selectedStaffId === staff.id && <GripVertical className="h-4 w-4 text-accent-400" />}
                    <div className="flex flex-col items-end gap-1">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${staffStatusColor[staff.status]}`}>{staff.status}</span>
                      <span className="text-xs text-yellow-500 flex items-center gap-0.5"><Star className="w-3 h-3 fill-yellow-400" />{staff.rating}</span>
                    </div>
                  </div>
                </button>
              ))}
              {visibleStaffRows.length === 0 && (
                <div className="p-8 text-center text-gray-400">
                  {staffRows.length === 0 ? 'No active staff found.' : 'No staff match this search or filter.'}
                </div>
              )}
            </div>
          </div>
        </div>
        ) : (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="p-5 border-b">
            <h2 className="font-semibold text-gray-900">Task History</h2>
            <p className="text-sm text-gray-500 mt-1">Tasks you&apos;ve created and assigned, most recent first.</p>
          </div>
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
                  <span className={`text-xs px-2 py-1 rounded-full font-medium flex-shrink-0 ${bookingStatusColor[booking.status] || 'bg-gray-100 text-gray-600'}`}>
                    {bookingStatusLabel(booking.status)}
                  </span>
                </div>
              </div>
            ))}
            {!historyLoading && historyBookings.length === 0 && (
              <div className="p-8 text-center text-gray-400">You haven&apos;t created any tasks yet.</div>
            )}
            {historyLoading && <div className="p-8 text-center text-gray-400">Loading...</div>}
          </div>
        </div>
        )}
      </div>
    </Layout>
  )
}
