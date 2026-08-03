import Layout from '../../../components/Layout'
import AddressFields from '../../../components/AddressFields'
import TimeInput from '../../../components/TimeInput'
import { useEffect, useState } from 'react'
import { Bell, ListChecks, Sparkles, UserCheck } from 'lucide-react'
import { supabase } from '../../../../lib/supabaseClient'
import { generateRecommendations } from '../../../../lib/recommendationEngine'
import { fetchApprovedTimeOffClient, getExcludedStaffIdsForDate, isStaffOffOnDate } from '../../../../lib/staffTimeOff'
import { SERVICE_TYPES, loadServiceTypes } from '../../../../lib/serviceTypes'
import { useAuthUser } from '../../../context/AuthUserContext'

const emptyForm = {
  serviceType: SERVICE_TYPES[0],
  location: '',
  description: '',
  scheduledDate: '',
  scheduledTime: '',
  estimatedHours: 2,
  urgency: 'normal',
}

const urgencyOptions = ['low', 'normal', 'high', 'urgent']

export default function DepartmentTasks() {
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

  useEffect(() => {
    loadDashboard()
  }, [user])

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
      urgency: form.urgency,
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
  }

  return (
    <Layout role="departmentStaff">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="flex items-start gap-3 mb-6">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent text-white">
            <ListChecks className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{departmentName ? `${departmentName} Department` : 'Department'} / Task</p>
            <h1 className="text-2xl font-bold text-gray-900">Create a task</h1>
            <p className="text-gray-500 mt-1">Create a task and assign it to available staff — pick someone yourself, or let AI recommend the best match.</p>
          </div>
        </div>

        {notification && <div className="mb-4 p-3 bg-green-50 text-green-700 rounded-lg flex items-center gap-2"><Bell className="w-4 h-4" />{notification}</div>}

        <form onSubmit={handleCreateTask} className="bg-white rounded-xl shadow-sm border p-5 space-y-4">
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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700">Estimated Hours</label>
              <input type="number" min="1" step="0.5" value={form.estimatedHours} onChange={e => setForm({ ...form, estimatedHours: Number(e.target.value) })} className="mt-1 w-full border rounded-lg p-2 text-sm" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Urgency</label>
              <select value={form.urgency} onChange={e => setForm({ ...form, urgency: e.target.value })} className="mt-1 w-full border rounded-lg p-2 text-sm">
                {urgencyOptions.map(option => <option key={option} value={option}>{option.charAt(0).toUpperCase() + option.slice(1)}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700">Description (optional)</label>
            <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="mt-1 w-full border rounded-lg p-2 text-sm" rows={2} />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-accent" /> Assign Staff
            </label>
            <select
              value={selectedStaffId}
              onChange={e => setSelectedStaffId(e.target.value)}
              className="mt-1 w-full border rounded-lg p-2 text-sm"
            >
              <option value="">— Unassigned (assign later) —</option>
              {staffRows.map(staff => {
                const rec = recommendations.find(item => item.staff_id === staff.id)
                return (
                  <option key={staff.id} value={staff.id} disabled={!staff.canAssign}>
                    {staff.name} ({staff.status}) - {staff.tasks} active tasks{rec ? ` — ${rec.reason}` : ''}
                  </option>
                )
              })}
            </select>
            {selectedStaffId && recommendations[0]?.staff_id === selectedStaffId ? (
              <p className="mt-1 text-xs text-accent-600 flex items-center gap-1"><Sparkles className="w-3 h-3" /> AI-recommended top match</p>
            ) : !form.location ? (
              <p className="mt-1 text-xs text-gray-400">Enter a location above to get an AI-recommended match, or pick someone manually.</p>
            ) : null}
            {staffRows.length === 0 && (
              <p className="mt-1 text-xs text-gray-400">No active staff found.</p>
            )}
          </div>

          <button type="submit" disabled={creating} className="w-auto bg-accent hover:bg-accent-600 text-white py-2 rounded-lg flex items-center justify-center gap-2 transition disabled:opacity-60">
            <UserCheck className="w-4 h-4" /> {creating ? 'Creating...' : 'Create & Assign Task'}
          </button>
        </form>
      </div>
    </Layout>
  )
}
