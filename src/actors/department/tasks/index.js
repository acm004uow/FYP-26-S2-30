import Layout from '../../../components/Layout'
import AddressFields from '../../../components/AddressFields'
import TimeInput from '../../../components/TimeInput'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { Bell, Briefcase, ChevronDown, ChevronRight, ClipboardList, Clock, Home, Layers, Lightbulb, Sparkles, Trash2, Truck, UserCheck } from 'lucide-react'
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

const urgencyMeta = {
  low: { label: 'Low', dot: 'bg-gray-400' },
  normal: { label: 'Normal', dot: 'bg-green-500' },
  high: { label: 'High', dot: 'bg-orange-500' },
  urgent: { label: 'Urgent', dot: 'bg-red-500' },
}

const SERVICE_TYPE_ICONS = {
  'Home Cleaning': Home,
  'Office Cleaning': Briefcase,
  'Deep Cleaning': Sparkles,
  'Move-Out Cleaning': Truck,
  'Carpet Cleaning': Layers,
}

const serviceTypeIcon = (type) => SERVICE_TYPE_ICONS[type] || ClipboardList

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
  const [urgencyOpen, setUrgencyOpen] = useState(false)
  const [formResetKey, setFormResetKey] = useState(0)
  const urgencyRef = useRef(null)

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
    const handleClickOutside = (event) => {
      if (urgencyRef.current && !urgencyRef.current.contains(event.target)) setUrgencyOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

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

  const handleClearAll = () => {
    setForm(prev => ({ ...emptyForm, serviceType: serviceTypes.includes(emptyForm.serviceType) ? emptyForm.serviceType : serviceTypes[0] }))
    setCoordinates(null)
    setSelectedStaffId('')
    setFormResetKey(key => key + 1)
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
    handleClearAll()
    await loadDashboard()
  }

  const SelectedServiceIcon = serviceTypeIcon(form.serviceType)

  return (
    <Layout role="departmentStaff">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <nav className="mb-4 flex items-center gap-1.5 text-sm text-gray-400">
          <Link href="/department" className="flex items-center hover:text-gray-600">
            <Home className="w-4 h-4" />
          </Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <Link href="/department" className="hover:text-gray-600">Task</Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <span className="font-medium text-gray-900">New Task</span>
        </nav>

        {notification && <div className="mb-4 flex items-center gap-2 rounded-lg border border-[#BFE0E0] bg-[#E6F2F2] p-3 text-[#003333]"><Bell className="w-4 h-4" />{notification}</div>}

        <form onSubmit={handleCreateTask} className="bg-white rounded-2xl shadow-sm border p-6 space-y-5">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#E6F2F2] text-[#005252]">
              <ClipboardList className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">New Task</h1>
              <p className="text-sm text-gray-500 mt-0.5">
                {departmentName ? `${departmentName} — ` : ''}Provide task details and assign to the right staff.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700">Service Type <span className="text-red-500">*</span></label>
              <div className="relative mt-1">
                <SelectedServiceIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <select
                  required
                  value={form.serviceType}
                  onChange={e => setForm({ ...form, serviceType: e.target.value })}
                  className="w-full rounded-lg border border-gray-200 p-2 pl-9 text-sm focus:outline-none focus:ring-2 focus:ring-[#005252]"
                >
                  {serviceTypes.map(type => <option key={type} value={type}>{type}</option>)}
                </select>
              </div>
            </div>
            <div className="flex items-start gap-2 rounded-lg border border-[#BFE0E0] bg-[#E6F2F2] p-3 text-sm text-[#003333] self-end">
              <Lightbulb className="w-4 h-4 mt-0.5 shrink-0" />
              <span>Tip: The more details you provide, the better AI can match the right staff.</span>
            </div>
          </div>

          <AddressFields
            key={formResetKey}
            onLocationChange={location => setForm(prev => ({ ...prev, location }))}
            onCoordinatesChange={setCoordinates}
            compact
          />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700">Scheduled Date <span className="text-red-500">*</span></label>
              <input required type="date" value={form.scheduledDate} onChange={e => setForm({ ...form, scheduledDate: e.target.value })} className="mt-1 w-full rounded-lg border border-gray-200 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#005252]" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Scheduled Time</label>
              <TimeInput className="mt-1" value={form.scheduledTime} onChange={value => setForm({ ...form, scheduledTime: value })} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700">Estimated Hours <span className="text-red-500">*</span></label>
              <div className="relative mt-1">
                <Clock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  required
                  type="number"
                  min="1"
                  step="0.5"
                  value={form.estimatedHours}
                  onChange={e => setForm({ ...form, estimatedHours: Number(e.target.value) })}
                  className="w-full rounded-lg border border-gray-200 p-2 pl-9 pr-14 text-sm focus:outline-none focus:ring-2 focus:ring-[#005252]"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">hours</span>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Urgency <span className="text-red-500">*</span></label>
              <div className="relative mt-1" ref={urgencyRef}>
                <button
                  type="button"
                  onClick={() => setUrgencyOpen(open => !open)}
                  className="flex w-full items-center justify-between gap-2 rounded-lg border border-gray-200 p-2 text-sm text-left focus:outline-none focus:ring-2 focus:ring-[#005252]"
                >
                  <span className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${urgencyMeta[form.urgency].dot}`} />
                    {urgencyMeta[form.urgency].label}
                  </span>
                  <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${urgencyOpen ? 'rotate-180' : ''}`} />
                </button>
                {urgencyOpen && (
                  <div className="absolute z-10 mt-1 w-full rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
                    {urgencyOptions.map(option => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => { setForm(prev => ({ ...prev, urgency: option })); setUrgencyOpen(false) }}
                        className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm text-gray-700 hover:bg-[#E6F2F2]"
                      >
                        <span className={`h-2 w-2 rounded-full ${urgencyMeta[option].dot}`} />
                        {urgencyMeta[option].label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700">Description (optional)</label>
            <div className="relative mt-1">
              <textarea
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value.slice(0, 500) })}
                maxLength={500}
                rows={3}
                placeholder="Add any special instructions or notes for this task..."
                className="w-full rounded-lg border border-gray-200 p-2 pr-14 text-sm focus:outline-none focus:ring-2 focus:ring-[#005252]"
              />
              <span className="pointer-events-none absolute bottom-2 right-3 text-xs text-gray-400">{form.description.length}/500</span>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-[#005252]" /> Assign Staff
            </label>
            <select
              value={selectedStaffId}
              onChange={e => setSelectedStaffId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-200 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#005252]"
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
              <p className="mt-1 text-xs text-[#005252] flex items-center gap-1"><Sparkles className="w-3 h-3" /> AI-recommended top match</p>
            ) : !form.location ? (
              <p className="mt-1 text-xs text-gray-400">Enter a location above to get an AI-recommended match, or pick someone manually.</p>
            ) : null}
            {staffRows.length === 0 && (
              <p className="mt-1 text-xs text-gray-400">No active staff found.</p>
            )}
          </div>

          <div className="flex items-center justify-between border-t pt-5">
            <button
              type="button"
              onClick={handleClearAll}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-300"
            >
              <Trash2 className="w-4 h-4" /> Clear All
            </button>
            <button
              type="submit"
              disabled={creating}
              className="inline-flex items-center gap-2 rounded-lg bg-[#003333] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#005252] focus:outline-none focus:ring-2 focus:ring-[#005252] focus:ring-offset-2 disabled:opacity-60"
            >
              <UserCheck className="w-4 h-4" /> {creating ? 'Creating...' : 'Create & Assign Task'} <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </form>
      </div>
    </Layout>
  )
}
