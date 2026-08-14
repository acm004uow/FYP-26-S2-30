import Layout from '../../../components/Layout'
import AddressFields from '../../../components/AddressFields'
import TimeInput from '../../../components/TimeInput'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { Bell, Briefcase, ChevronDown, ChevronRight, ChevronUp, ClipboardList, Clock, Filter, Home, Layers, Lightbulb, Search, Sparkles, Trash2, Truck, User, UserCheck, Wand2 } from 'lucide-react'
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

const STAFF_STATUS_FILTERS = ['All', 'Available', 'Busy', 'Time Off', 'On Leave']

const staffStatusMeta = {
  Available: { dot: 'bg-green-500', text: 'text-green-600' },
  Busy: { dot: 'bg-orange-500', text: 'text-orange-600' },
  'Time Off': { dot: 'bg-purple-500', text: 'text-purple-600' },
  'On Leave': { dot: 'bg-gray-400', text: 'text-gray-500' },
}

// Deterministic per-name color so the same staff member always gets the same avatar color.
const AVATAR_PALETTE = [
  'bg-purple-100 text-purple-700',
  'bg-green-100 text-green-700',
  'bg-teal-100 text-teal-700',
  'bg-orange-100 text-orange-700',
  'bg-indigo-100 text-indigo-700',
  'bg-pink-100 text-pink-700',
  'bg-blue-100 text-blue-700',
]

function avatarColor(name) {
  let hash = 0
  for (let i = 0; i < (name || '').length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length]
}

function staffInitials(name) {
  return (name || '?').split(' ').map(part => part[0]).join('').slice(0, 2).toUpperCase()
}

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
  const [staffPickerOpen, setStaffPickerOpen] = useState(false)
  const [staffFilterOpen, setStaffFilterOpen] = useState(false)
  const [staffSearch, setStaffSearch] = useState('')
  const [staffStatusFilter, setStaffStatusFilter] = useState('All')
  const [createMode, setCreateMode] = useState('manual')
  const [aiHint, setAiHint] = useState('')
  const [aiParsing, setAiParsing] = useState(false)
  const [aiParseError, setAiParseError] = useState('')
  const urgencyRef = useRef(null)
  const staffPickerRef = useRef(null)

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
        .select('id,user_id,staff_name,availability,current_workload,performance_rating,status,is_suspended')
        .eq('host_admin_id', resolvedHostAdminId)
        .eq('status', 'active')
        .order('staff_name'),
      supabase
        .from('staff_profiles')
        .select('id,staff_name,availability,performance_rating,current_workload,assigned_region,latitude,longitude,weekly_working_hours,max_weekly_hours,is_suspended,status')
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
      if (staffPickerRef.current && !staffPickerRef.current.contains(event.target)) {
        setStaffPickerOpen(false)
        setStaffFilterOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (!staffPickerOpen) {
      setStaffSearch('')
      setStaffStatusFilter('All')
    }
  }, [staffPickerOpen])

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
    setAiHint('')
    setAiParseError('')
    setFormResetKey(key => key + 1)
  }

  // "AI Agent" tab: turns a shorthand note into the same form fields the Manual tab uses, so the
  // existing AI staff recommendation (the useEffect above, keyed off form.location/estimatedHours/
  // etc.) and staff picker keep working unchanged — staff are still recommended, this just fills
  // the fields faster than typing into each one by hand. Department bookings have no customer-name
  // field of their own, so an extracted name is folded into the description instead of dropped.
  const handleParseAi = async () => {
    if (!aiHint.trim()) {
      setAiParseError('Describe the task first.')
      return
    }
    setAiParsing(true)
    setAiParseError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const response = await fetch('/api/agent/parse-task', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ hint: aiHint }),
      })
      const result = await response.json().catch(() => null)
      if (!response.ok) throw new Error(result?.error || 'Could not parse the task.')

      const description = result.customerName
        ? `Customer: ${result.customerName}.${result.description ? ` ${result.description}` : ''}`
        : result.description

      setForm(prev => ({
        ...prev,
        serviceType: serviceTypes.includes(result.serviceType) ? result.serviceType : prev.serviceType,
        location: result.location || prev.location,
        scheduledDate: result.scheduledDate || prev.scheduledDate,
        scheduledTime: result.scheduledTime || prev.scheduledTime,
        estimatedHours: result.estimatedHours || prev.estimatedHours,
        description: description || prev.description,
      }))
      setCoordinates(null)
    } catch (error) {
      setAiParseError(error.message)
    } finally {
      setAiParsing(false)
    }
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
  // Base staffRows.status only reflects each staff member's status right now (suspended /
  // self-toggled availability) — it has no idea which date this task is actually for. Once a date
  // is picked, override both the displayed status and canAssign for anyone with approved leave
  // covering that specific date, so the picker can't be used to assign someone who's confirmed off
  // that day even though they show "Available" today. Mirrors the submit-time guard further up
  // (handleCreateTask), which already blocks this — this just surfaces it before the click instead
  // of after. Same fix as src/actors/manager/bookings/NewTask.js.
  const staffRowsForSelectedDate = staffRows.map(staff => {
    if (!form.scheduledDate) return staff
    const offRequest = isStaffOffOnDate(staff.id, form.scheduledDate, approvedTimeOff)
    return offRequest ? { ...staff, status: 'On Leave', canAssign: false } : staff
  })
  const selectedStaff = staffRowsForSelectedDate.find(staff => staff.id === selectedStaffId) || null
  const visibleStaffRows = staffRowsForSelectedDate.filter(staff => {
    if (staffSearch.trim() && !staff.name.toLowerCase().includes(staffSearch.trim().toLowerCase())) return false
    if (staffStatusFilter !== 'All' && staff.status !== staffStatusFilter) return false
    return true
  })

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
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
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
            <div className="flex items-start gap-2 rounded-lg border border-[#BFE0E0] bg-[#E6F2F2] p-3 text-sm text-[#003333] sm:max-w-xs shrink-0">
              <Lightbulb className="w-4 h-4 mt-0.5 shrink-0" />
              <span>Tip: The more details you provide, the better AI can match the right staff.</span>
            </div>
          </div>

          <div className="flex gap-1 border-b">
            <button
              type="button"
              onClick={() => setCreateMode('manual')}
              className={`px-4 py-2 text-sm font-semibold transition ${createMode === 'manual' ? 'border-b-2 border-[#005252] text-[#005252]' : 'text-gray-400 hover:text-gray-600'}`}
            >
              Manual
            </button>
            <button
              type="button"
              onClick={() => setCreateMode('ai')}
              className={`flex items-center gap-1 px-4 py-2 text-sm font-semibold transition ${createMode === 'ai' ? 'border-b-2 border-[#005252] text-[#005252]' : 'text-gray-400 hover:text-gray-600'}`}
            >
              <Sparkles className="w-3.5 h-3.5" /> AI Agent
            </button>
          </div>

          {createMode === 'ai' && (
            <div className="rounded-lg border border-purple-100 bg-purple-50 p-3">
              <label className="text-sm font-medium text-gray-700">Describe the task</label>
              <textarea
                value={aiHint}
                onChange={e => setAiHint(e.target.value)}
                placeholder="e.g. Cus Name - Saung, Location - postal code and floor, date and time"
                rows={2}
                className="mt-1 w-full rounded-lg border border-gray-200 bg-white p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#005252]"
              />
              {aiParseError && <p className="mt-1 text-xs text-red-500">{aiParseError}</p>}
              <button
                type="button"
                onClick={handleParseAi}
                disabled={aiParsing}
                className="mt-2 flex items-center gap-1.5 rounded-full bg-purple-100 px-3 py-1.5 text-xs font-medium text-purple-700 hover:bg-purple-200 disabled:opacity-60"
              >
                <Wand2 className="w-3.5 h-3.5" /> {aiParsing ? 'Reading...' : 'Fill fields with AI'}
              </button>
              <p className="mt-2 text-xs text-purple-700">Fields below are filled in for you to review — staff are still recommended the same way as Manual.</p>
            </div>
          )}

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

          {createMode === 'manual' ? (
            <AddressFields
              key={formResetKey}
              onLocationChange={location => setForm(prev => ({ ...prev, location }))}
              onCoordinatesChange={setCoordinates}
              compact
            />
          ) : (
            <div>
              <label className="text-sm font-medium text-gray-700">Location <span className="text-red-500">*</span></label>
              <input
                required
                value={form.location}
                onChange={e => setForm(prev => ({ ...prev, location: e.target.value }))}
                placeholder="Postal code and floor/unit"
                className="mt-1 w-full rounded-lg border border-gray-200 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#005252]"
              />
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700">Scheduled Date <span className="text-red-500">*</span></label>
              <input required type="date" value={form.scheduledDate} onChange={e => setForm({ ...form, scheduledDate: e.target.value })} className="mt-1 w-full rounded-lg border border-gray-200 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#005252]" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Scheduled Time</label>
              <TimeInput className="mt-1" value={form.scheduledTime} onChange={value => setForm({ ...form, scheduledTime: value })} />
            </div>
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
            <div className="relative mt-1" ref={staffPickerRef}>
              <button
                type="button"
                onClick={() => setStaffPickerOpen(open => !open)}
                className={`flex w-full items-center justify-between gap-2 rounded-lg border p-2.5 text-sm text-left transition focus:outline-none ${staffPickerOpen ? 'border-[#005252] ring-2 ring-[#005252]/30' : 'border-gray-200'}`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  {selectedStaff ? (
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${avatarColor(selectedStaff.name)}`}>
                      {staffInitials(selectedStaff.name)}
                    </span>
                  ) : (
                    <User className="h-4 w-4 shrink-0 text-gray-400" />
                  )}
                  <span className="truncate font-medium text-gray-900">{selectedStaff ? selectedStaff.name : '— Unassigned (assign later) —'}</span>
                </span>
                {staffPickerOpen ? <ChevronUp className="h-4 w-4 shrink-0 text-gray-400" /> : <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />}
              </button>

              {staffPickerOpen && (
                <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
                  <div className="flex items-center gap-2 border-b border-gray-100 p-3">
                    <div className="relative flex-1">
                      <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <input
                        autoFocus
                        value={staffSearch}
                        onChange={e => setStaffSearch(e.target.value)}
                        placeholder="Search staff by name..."
                        className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#005252]"
                      />
                    </div>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setStaffFilterOpen(open => !open)}
                        className="rounded-lg border border-gray-200 p-2 text-gray-500 hover:bg-gray-50"
                      >
                        <Filter className="h-4 w-4" />
                      </button>
                      {staffFilterOpen && (
                        <div className="absolute right-0 z-10 mt-1 w-36 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
                          {STAFF_STATUS_FILTERS.map(option => (
                            <button
                              key={option}
                              type="button"
                              onClick={() => { setStaffStatusFilter(option); setStaffFilterOpen(false) }}
                              className={`w-full px-3 py-2 text-left text-sm hover:bg-[#E6F2F2] ${staffStatusFilter === option ? 'font-semibold text-[#005252]' : 'text-gray-700'}`}
                            >
                              {option}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="max-h-64 overflow-y-auto">
                    <button
                      type="button"
                      onClick={() => { setSelectedStaffId(''); setStaffPickerOpen(false) }}
                      className="w-full border-b border-gray-50 px-4 py-3 text-left text-sm font-medium text-gray-600 hover:bg-gray-50"
                    >
                      — Unassigned (assign later) —
                    </button>
                    {visibleStaffRows.map(staff => {
                      const rec = recommendations.find(item => item.staff_id === staff.id)
                      const meta = staffStatusMeta[staff.status] || staffStatusMeta['On Leave']
                      return (
                        <button
                          key={staff.id}
                          type="button"
                          disabled={!staff.canAssign}
                          onClick={() => { setSelectedStaffId(staff.id); setStaffPickerOpen(false) }}
                          className={`flex w-full items-center gap-3 border-b border-gray-50 px-4 py-3 text-left last:border-0 ${
                            staff.canAssign ? 'hover:bg-gray-50' : 'cursor-not-allowed opacity-50'
                          } ${selectedStaffId === staff.id ? 'bg-[#E6F2F2]' : ''}`}
                          title={staff.canAssign ? undefined : staff.status === 'On Leave' && form.scheduledDate ? `On approved leave on ${form.scheduledDate}` : 'Only available active staff can be assigned'}
                        >
                          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${avatarColor(staff.name)}`}>
                            {staffInitials(staff.name)}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1.5">
                              <span className="truncate text-sm font-semibold text-gray-900">{staff.name}</span>
                              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${meta.dot}`} />
                              <span className={`shrink-0 text-xs font-medium ${meta.text}`}>{staff.status}</span>
                            </span>
                            {rec && <span className="mt-0.5 block truncate text-xs text-[#005252]">AI match: {rec.reason}</span>}
                          </span>
                          <span className={`shrink-0 text-sm ${staff.canAssign ? 'text-gray-500' : 'text-gray-300'}`}>{staff.tasks} active tasks</span>
                        </button>
                      )
                    })}
                    {visibleStaffRows.length === 0 && (
                      <div className="p-6 text-center text-sm text-gray-400">No staff match this search or filter.</div>
                    )}
                  </div>
                </div>
              )}
            </div>
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
