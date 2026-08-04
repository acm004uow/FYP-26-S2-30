import { useEffect, useState } from 'react'
import { CheckCircle, XCircle, Bell, MapPin, UserCheck, Calendar, Sparkles, RefreshCw, Plus, X, Repeat, Home, Building2, Droplets, Truck, Layers, Search, Filter, ChevronDown, Trash2, Eye } from 'lucide-react'
import { supabase } from '../../../../lib/supabaseClient'
import { assignStaffToBooking } from '../../../../lib/assignBooking'
import { generateRecommendations } from '../../../../lib/recommendationEngine'
import { fetchApprovedTimeOffClient, getExcludedStaffIdsForDate, isStaffOffOnDate } from '../../../../lib/staffTimeOff'
import { SERVICE_TYPES, loadServiceTypes } from '../../../../lib/serviceTypes'
import AddressFields from '../../../components/AddressFields'
import TimeInput from '../../../components/TimeInput'

const BOOKINGS_PAGE_SIZE = 8

const TIME_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'today', label: 'Today' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'overdue', label: 'Overdue' },
]

const SOURCE_FILTERS = [
  { value: 'all', label: 'All Sources' },
  { value: 'manager', label: 'Manager Created' },
  { value: 'customer', label: 'Customer Booked' },
  { value: 'department', label: 'Department Requests' },
  { value: 'ai', label: 'AI Recommended' },
]

const SERVICE_ICONS = {
  'Home Cleaning': Home,
  'Office Cleaning': Building2,
  'Deep Cleaning': Droplets,
  'Move-Out Cleaning': Truck,
  'Carpet Cleaning': Layers,
}

const serviceIcon = (type) => SERVICE_ICONS[type] || Home

const sourceMeta = {
  manager: { label: 'Manager Created', badge: 'bg-purple-100 text-purple-700' },
  department: { label: 'Department Request', badge: 'bg-orange-100 text-orange-700' },
  customer: { label: 'Customer Booked', badge: 'bg-blue-50 text-blue-600' },
}

const getSourceMeta = (source) => sourceMeta[source || 'customer'] || sourceMeta.customer

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

const emptyNewBooking = {
  customerEmail: '', guestName: '', serviceType: SERVICE_TYPES[0], location: '',
  description: '', notes: '', scheduledDate: '', scheduledTime: '', estimatedHours: 2,
}

const statusColor = {
  pending: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
}

const BOOKING_STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'rejected', label: 'Rejected' },
]

const dateToneColor = {
  overdue: 'bg-red-50 text-red-700',
  today: 'bg-orange-50 text-orange-700',
  tomorrow: 'bg-blue-50 text-blue-700',
  upcoming: 'bg-gray-100 text-gray-600',
  none: 'bg-gray-100 text-gray-400',
}

const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const formatDaysOfWeek = (days) => (days || []).slice().sort((a, b) => a - b).map(d => DAY_ABBR[d]).join(', ')

const formatTime = (time) => {
  if (!time) return null
  const [h, m] = time.split(':').map(Number)
  if (Number.isNaN(h)) return time
  const period = h >= 12 ? 'PM' : 'AM'
  const hour12 = h % 12 || 12
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`
}

const getScheduleBadge = (booking) => {
  if (!booking.scheduled_date) return { label: 'No date set', tone: 'none' }
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const scheduled = new Date(`${booking.scheduled_date}T00:00:00`)
  const diffDays = Math.round((scheduled - today) / 86400000)
  const time = formatTime(booking.scheduled_time)

  let dayLabel
  let tone
  if (diffDays < 0) {
    dayLabel = scheduled.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
    tone = 'overdue'
  } else if (diffDays === 0) {
    dayLabel = 'Today'
    tone = 'today'
  } else if (diffDays === 1) {
    dayLabel = 'Tomorrow'
    tone = 'tomorrow'
  } else {
    dayLabel = scheduled.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
    tone = 'upcoming'
  }
  return { label: time ? `${dayLabel} · ${time}` : dayLabel, tone }
}

export default function BookingsReviewPanel() {
  const [bookings, setBookings] = useState([])
  const [staffRows, setStaffRows] = useState([])
  const [notification, setNotification] = useState(null)
  const [assigningBookingId, setAssigningBookingId] = useState(null)
  const [selectedStaffId, setSelectedStaffId] = useState({})
  const [reassigningId, setReassigningId] = useState(null)
  // Two-step confirm before a real, permanent delete — id of the rejected booking currently
  // showing its "Confirm Delete / Cancel" prompt.
  const [deletingId, setDeletingId] = useState(null)
  const [rerunningId, setRerunningId] = useState(null)
  const [timeFilter, setTimeFilter] = useState('all')
  const [sourceFilter, setSourceFilter] = useState('all')
  const [showNewBooking, setShowNewBooking] = useState(false)
  const [newBookingForm, setNewBookingForm] = useState(emptyNewBooking)
  const [creatingBooking, setCreatingBooking] = useState(false)
  const [generatingTask, setGeneratingTask] = useState(false)
  const [generateError, setGenerateError] = useState('')
  const [newBookingCoordinates, setNewBookingCoordinates] = useState(null)
  const [recommendationPool, setRecommendationPool] = useState([])
  const [recommendationParams, setRecommendationParams] = useState({})
  const [serviceTypes, setServiceTypes] = useState(SERVICE_TYPES)
  const [newBookingRecommendations, setNewBookingRecommendations] = useState([])
  const [selectedNewBookingStaffId, setSelectedNewBookingStaffId] = useState('')
  const [hostAdminId, setHostAdminId] = useState(null)
  const [recurringBookings, setRecurringBookings] = useState([])
  const [recurringActionId, setRecurringActionId] = useState(null)
  const [recurringRejecting, setRecurringRejecting] = useState(null)
  const [recurringRejectReason, setRecurringRejectReason] = useState('')
  const [approvedTimeOff, setApprovedTimeOff] = useState([])
  const [bookingSearch, setBookingSearch] = useState('')
  const [bookingStatusFilter, setBookingStatusFilter] = useState('all')
  const [bookingServiceTypeFilter, setBookingServiceTypeFilter] = useState('all')
  const [bookingFiltersOpen, setBookingFiltersOpen] = useState(false)
  const [detailBookingId, setDetailBookingId] = useState(null)
  const [currentPage, setCurrentPage] = useState(1)

  const loadRecurringBookings = async (hostAdminIdParam) => {
    if (!hostAdminIdParam) {
      setRecurringBookings([])
      return
    }
    const { data } = await supabase
      .from('recurring_bookings')
      .select('id,customer_id,service_type,location,description,days_of_week,scheduled_time,estimated_hours,start_date,end_date,status,created_at,customer:profiles!recurring_bookings_customer_id_fkey(full_name,email,phone)')
      .eq('host_admin_id', hostAdminIdParam)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
    setRecurringBookings(data || [])
  }

  const loadApprovedTimeOff = async (hostAdminIdParam) => {
    if (!hostAdminIdParam) {
      setApprovedTimeOff([])
      return
    }
    const rows = await fetchApprovedTimeOffClient(supabase, hostAdminIdParam)
    setApprovedTimeOff(rows)
  }

  const loadBookings = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: managerProfile } = await supabase
      .from('profiles')
      .select('host_admin_id')
      .eq('id', user?.id)
      .single()

    const hostAdminIdResolved = managerProfile?.host_admin_id
    setHostAdminId(hostAdminIdResolved || null)
    if (!hostAdminIdResolved) {
      setBookings([])
      setStaffRows([])
      return null
    }

    const [{ data: bookingRows }, { data: staff }] = await Promise.all([
      supabase
        .from('bookings')
        .select('id,customer_id,service_type,location,latitude,longitude,description,notes,scheduled_date,scheduled_time,status,created_at,assigned_staff_id,recommendation_reason,source,guest_name,guest_contact,department_id,customer:profiles!bookings_customer_id_fkey(full_name,email,phone),staff_profiles(staff_name),departments(name)')
        .eq('host_admin_id', hostAdminIdResolved)
        .in('status', ['pending', 'approved', 'rejected'])
        .order('created_at', { ascending: false }),
      supabase
        .from('staff_profiles')
        .select('id,user_id,staff_name,availability,current_workload,performance_rating,status,is_suspended')
        .eq('host_admin_id', hostAdminIdResolved)
        .eq('status', 'active')
        .order('staff_name'),
    ])

    setBookings(bookingRows || [])
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
    await loadApprovedTimeOff(hostAdminIdResolved)
    return hostAdminIdResolved
  }

  useEffect(() => {
    let bookingsChannel = null
    let recurringChannel = null
    let timeOffChannel = null
    let cancelled = false

    loadBookings().then(resolvedHostAdminId => {
      if (cancelled || !resolvedHostAdminId) return
      loadRecurringBookings(resolvedHostAdminId)
      bookingsChannel = supabase
        .channel(`bookings-review-${resolvedHostAdminId}-${Date.now()}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'bookings', filter: `host_admin_id=eq.${resolvedHostAdminId}` },
          () => { if (!cancelled) loadBookings() }
        )
        .subscribe()
      recurringChannel = supabase
        .channel(`recurring-bookings-review-${resolvedHostAdminId}-${Date.now()}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'recurring_bookings', filter: `host_admin_id=eq.${resolvedHostAdminId}` },
          () => { if (!cancelled) loadRecurringBookings(resolvedHostAdminId) }
        )
        .subscribe()
      timeOffChannel = supabase
        .channel(`bookings-review-time-off-${resolvedHostAdminId}-${Date.now()}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'staff_time_off_requests', filter: `host_admin_id=eq.${resolvedHostAdminId}` },
          () => { if (!cancelled) loadApprovedTimeOff(resolvedHostAdminId) }
        )
        .subscribe()
    })

    return () => {
      cancelled = true
      if (bookingsChannel) supabase.removeChannel(bookingsChannel)
      if (recurringChannel) supabase.removeChannel(recurringChannel)
      if (timeOffChannel) supabase.removeChannel(timeOffChannel)
    }
  }, [])

  useEffect(() => {
    if (!showNewBooking || !newBookingForm.location) {
      setNewBookingRecommendations([])
      return
    }
    const excludedStaffIds = newBookingForm.scheduledDate
      ? getExcludedStaffIdsForDate(newBookingForm.scheduledDate, approvedTimeOff)
      : new Set()
    const recommendations = generateRecommendations(
      recommendationPool,
      {
        location: newBookingForm.location,
        latitude: newBookingCoordinates?.latitude ?? null,
        longitude: newBookingCoordinates?.longitude ?? null,
        estimated_hours: newBookingForm.estimatedHours,
        requested_text: `${newBookingForm.description || ''} ${newBookingForm.notes || ''}`,
      },
      recommendationParams,
      excludedStaffIds
    )
    setNewBookingRecommendations(recommendations)
  }, [showNewBooking, newBookingForm.location, newBookingCoordinates, newBookingForm.estimatedHours, newBookingForm.description, newBookingForm.notes, newBookingForm.scheduledDate, recommendationPool, recommendationParams, approvedTimeOff])

  useEffect(() => {
    if (!newBookingRecommendations.length) return
    setSelectedNewBookingStaffId(prev => (prev && recommendationPool.some(staff => staff.id === prev) ? prev : newBookingRecommendations[0].staff_id))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newBookingRecommendations])

  useEffect(() => {
    setCurrentPage(1)
  }, [bookingSearch, bookingStatusFilter, bookingServiceTypeFilter, timeFilter, sourceFilter])

  const showNotification = (message) => {
    setNotification(message)
    setTimeout(() => setNotification(null), 3000)
  }

  const getActiveManager = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: managerProfile } = await supabase
      .from('profiles')
      .select('role,status')
      .eq('id', user?.id)
      .single()

    if (!['manager', 'system_admin'].includes(managerProfile?.role) || managerProfile?.status !== 'active') {
      showNotification('Only an active manager or owner can approve, reject, or assign bookings.')
      return null
    }
    return user
  }

  const handleReview = async (id, decision) => {
    const status = decision === 'Approved' ? 'approved' : 'rejected'
    const user = await getActiveManager()
    if (!user) return

    const { data: reviewedBooking, error } = await supabase
      .from('bookings')
      .update({ status, reviewed_by: user.id, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('status', 'pending')
      .select('id,customer_id,service_type,assigned_staff_id')
      .maybeSingle()

    if (!error && reviewedBooking?.customer_id) {
      await supabase.from('notifications').insert({
        user_id: reviewedBooking.customer_id,
        title: `Booking ${status}`,
        message: `${reviewedBooking.service_type} was ${status} by the manager.`,
      })
    }

    if (!error && reviewedBooking && status === 'approved' && reviewedBooking.assigned_staff_id) {
      const staff = staffRows.find(item => item.id === reviewedBooking.assigned_staff_id)
      if (staff) {
        await supabase
          .from('staff_profiles')
          .update({ current_workload: Number(staff.tasks || 0) + 1, updated_at: new Date().toISOString() })
          .eq('id', staff.id)

        if (staff.userId) {
          await supabase.from('notifications').insert({
            user_id: staff.userId,
            title: 'New booking assignment',
            message: `${reviewedBooking.service_type} has been assigned to you.`,
          })
        }
      }
    }

    if (!error && reviewedBooking) {
      await supabase.from('audit_logs').insert({ user_id: user?.id, action: 'review_booking', details: `Booking ${id} ${status}` })
    }
    showNotification(error
      ? error.message
      : reviewedBooking
        ? `Booking ${id.slice(0, 8)} ${decision}. Customer notified.`
        : 'This booking is no longer pending.')
    await loadBookings()
  }

  // Permanent delete, only ever for rejected bookings (also enforced server-side via the
  // .eq('status','rejected') guard below) — pending/approved/scheduled bookings have no delete
  // path, since Reject already covers stepping those down safely.
  const handleDeleteBooking = async (id) => {
    const user = await getActiveManager()
    if (!user) return

    const { error } = await supabase
      .from('bookings')
      .delete()
      .eq('id', id)
      .eq('status', 'rejected')

    if (!error) {
      await supabase.from('audit_logs').insert({ user_id: user.id, action: 'delete_booking', details: `Booking ${id} deleted` })
    }
    setDeletingId(null)
    showNotification(error ? error.message : `Booking ${id.slice(0, 8)} deleted.`)
    await loadBookings()
  }

  const handleReviewRecurring = async (id, decision, rejectionReason) => {
    const status = decision === 'Approved' ? 'active' : 'rejected'
    const user = await getActiveManager()
    if (!user) return

    setRecurringActionId(id)
    const { data: reviewed, error } = await supabase
      .from('recurring_bookings')
      .update({
        status,
        reviewed_by: user.id,
        rejection_reason: status === 'rejected' ? (rejectionReason || null) : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('status', 'pending')
      .select('id,customer_id,service_type')
      .maybeSingle()

    if (!error && reviewed?.customer_id) {
      await supabase.from('notifications').insert({
        user_id: reviewed.customer_id,
        title: status === 'active' ? 'Recurring booking approved' : 'Recurring booking declined',
        message: status === 'active'
          ? `Your recurring ${reviewed.service_type} booking was approved. Visits will appear on the schedule week by week.`
          : `Your recurring ${reviewed.service_type} booking request was declined.${rejectionReason ? ` Reason: ${rejectionReason}` : ''}`,
      })
    }

    if (!error && reviewed) {
      await supabase.from('audit_logs').insert({
        user_id: user.id,
        action: status === 'active' ? 'approve_recurring_booking' : 'reject_recurring_booking',
        details: `Recurring booking ${id} ${status}`,
      })
    }

    setRecurringActionId(null)
    setRecurringRejecting(null)
    setRecurringRejectReason('')
    showNotification(error
      ? error.message
      : reviewed
        ? `Recurring booking ${status === 'active' ? 'approved' : 'rejected'}.`
        : 'This request is no longer pending.')
    await loadRecurringBookings(hostAdminId)
  }

  const performAssignment = async (booking, staffId, action) => {
    const staff = staffRows.find(item => item.id === staffId)
    if (!staff || booking.status === 'rejected') return
    if (!staff.canAssign) {
      showNotification(`${staff.name} is not available for assignment.`)
      return
    }
    if (isStaffOffOnDate(staff.id, booking.scheduled_date, approvedTimeOff)) {
      showNotification(`${staff.name} has approved time off on ${booking.scheduled_date} and cannot be assigned.`)
      return
    }
    if (booking.assigned_staff_id === staff.id) {
      showNotification(`${staff.name} is already assigned to ${booking.service_type}.`)
      return
    }

    const user = await getActiveManager()
    if (!user) return

    setAssigningBookingId(booking.id)
    const previousStaff = booking.assigned_staff_id
      ? staffRows.find(item => item.id === booking.assigned_staff_id)
      : null

    const result = await assignStaffToBooking({
      booking,
      staff,
      managerUserId: user.id,
      previousStaff,
      action,
    })

    setAssigningBookingId(null)
    showNotification(result.message)
    await loadBookings()
  }

  const handleManualAssign = async (booking) => {
    const staffId = selectedStaffId[booking.id]
    if (!staffId) return
    await performAssignment(booking, staffId, 'assign_booking_manual')
    setSelectedStaffId(prev => ({ ...prev, [booking.id]: '' }))
    setReassigningId(null)
  }

  const handleRerunMatch = async (booking) => {
    setRerunningId(booking.id)
    const { data: { user } } = await supabase.auth.getUser()
    const { data: managerProfile } = await supabase
      .from('profiles')
      .select('host_admin_id')
      .eq('id', user?.id)
      .single()
    const hostAdminId = managerProfile?.host_admin_id

    const [{ data: freshStaff }, { data: systemParams }] = await Promise.all([
      supabase
        .from('staff_profiles')
        .select('id,staff_name,availability,performance_rating,current_workload,assigned_region,latitude,longitude,weekly_working_hours,max_weekly_hours,is_suspended,status')
        .eq('host_admin_id', hostAdminId)
        .eq('is_suspended', false)
        .eq('status', 'active'),
      supabase.from('system_parameters').select('*').eq('id', 1).single(),
    ])

    const recommendations = generateRecommendations(
      freshStaff || [],
      {
        location: booking.location,
        latitude: booking.latitude,
        longitude: booking.longitude,
        estimated_hours: booking.estimated_hours,
        requested_text: `${booking.description || ''} ${booking.notes || ''}`,
      },
      systemParams || {},
      getExcludedStaffIdsForDate(booking.scheduled_date, approvedTimeOff)
    )
    const topMatch = recommendations[0]

    if (topMatch) {
      await supabase.from('bookings').update({
        assigned_staff_id: topMatch.staff_id,
        recommendation_reason: topMatch.reason,
        updated_at: new Date().toISOString(),
      }).eq('id', booking.id)
      showNotification(`AI match refreshed: ${topMatch.staff_name}.`)
    } else {
      showNotification('No suitable staff match found.')
    }

    setRerunningId(null)
    await loadBookings()
  }

  const openNewTaskModal = async () => {
    setShowNewBooking(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { data: managerProfile } = await supabase
      .from('profiles')
      .select('host_admin_id')
      .eq('id', user?.id)
      .single()
    const hostAdminId = managerProfile?.host_admin_id
    if (!hostAdminId) return

    const [{ data: pool }, { data: params }, types] = await Promise.all([
      supabase
        .from('staff_profiles')
        .select('id,staff_name,availability,performance_rating,current_workload,assigned_region,latitude,longitude,weekly_working_hours,max_weekly_hours,is_suspended,status')
        .eq('host_admin_id', hostAdminId)
        .eq('is_suspended', false)
        .eq('status', 'active'),
      supabase.from('system_parameters').select('*').eq('id', 1).single(),
      loadServiceTypes(supabase, hostAdminId),
    ])
    setRecommendationPool(pool || [])
    setRecommendationParams(params || {})
    setServiceTypes(types)
    setNewBookingForm(prev => ({ ...prev, serviceType: types.includes(prev.serviceType) ? prev.serviceType : types[0] }))
  }

  const closeNewBookingModal = () => {
    setShowNewBooking(false)
    setNewBookingForm(emptyNewBooking)
    setNewBookingCoordinates(null)
    setGenerateError('')
    setRecommendationPool([])
    setRecommendationParams({})
    setNewBookingRecommendations([])
    setSelectedNewBookingStaffId('')
  }

  const handleGenerateDescription = async () => {
    setGenerateError('')
    if (!newBookingForm.guestName || !newBookingForm.location) {
      setGenerateError('Please enter a customer name and location first, so the AI has something to work with.')
      return
    }

    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) {
      setGenerateError('Your session has expired. Please log in again.')
      return
    }

    setGeneratingTask(true)
    let response
    let result
    try {
      response = await fetch('/api/agent/generate-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          customerName: newBookingForm.guestName,
          customerEmail: newBookingForm.customerEmail,
          serviceType: newBookingForm.serviceType,
          location: newBookingForm.location,
          scheduledDate: newBookingForm.scheduledDate,
          scheduledTime: newBookingForm.scheduledTime,
          estimatedHours: newBookingForm.estimatedHours,
        }),
      })
      result = await response.json()
    } catch {
      setGeneratingTask(false)
      setGenerateError('Could not reach the server. Check your connection and try again.')
      return
    }
    setGeneratingTask(false)

    if (!response.ok) {
      setGenerateError(result.error || 'Could not generate a description.')
      return
    }

    setNewBookingForm(prev => ({ ...prev, description: result.description, notes: result.notes }))
  }

  const handleCreateBooking = async (event) => {
    event.preventDefault()
    if (!newBookingForm.guestName || !newBookingForm.location) {
      showNotification('Please enter a customer name and location.')
      return
    }

    const user = await getActiveManager()
    if (!user) return

    const { data: managerProfile } = await supabase
      .from('profiles')
      .select('host_admin_id')
      .eq('id', user.id)
      .single()
    const hostAdminId = managerProfile?.host_admin_id
    if (!hostAdminId) {
      showNotification('Could not resolve your company.')
      return
    }

    let customerId = null
    if (newBookingForm.customerEmail) {
      const { data: matchedCustomer } = await supabase
        .from('profiles')
        .select('id')
        .eq('role', 'customer')
        .eq('email', newBookingForm.customerEmail.trim().toLowerCase())
        .maybeSingle()
      customerId = matchedCustomer?.id || null
    }

    const assignedStaffId = selectedNewBookingStaffId || null

    setCreatingBooking(true)
    const { data: createdBooking, error } = await supabase.from('bookings').insert({
      host_admin_id: hostAdminId,
      customer_id: customerId,
      guest_name: newBookingForm.guestName,
      guest_contact: newBookingForm.customerEmail || null,
      service_type: newBookingForm.serviceType,
      location: newBookingForm.location,
      latitude: newBookingCoordinates?.latitude ?? null,
      longitude: newBookingCoordinates?.longitude ?? null,
      description: newBookingForm.description,
      notes: newBookingForm.notes,
      scheduled_date: newBookingForm.scheduledDate || null,
      scheduled_time: newBookingForm.scheduledTime || null,
      estimated_hours: newBookingForm.estimatedHours || 2,
      assigned_staff_id: assignedStaffId,
      recommendation_reason: newBookingRecommendations.find(rec => rec.staff_id === assignedStaffId)?.reason || null,
      // Manager/owner-created tasks are self-authorized — no separate approval step needed.
      status: 'approved',
      reviewed_by: user.id,
      source: 'manager',
      created_by: user.id,
    }).select('id').single()
    setCreatingBooking(false)

    if (error) {
      showNotification(error.message)
      return
    }

    if (assignedStaffId) {
      const staff = staffRows.find(item => item.id === assignedStaffId)
      if (staff) {
        await supabase
          .from('staff_profiles')
          .update({ current_workload: Number(staff.tasks || 0) + 1, updated_at: new Date().toISOString() })
          .eq('id', staff.id)

        if (staff.userId) {
          await supabase.from('notifications').insert({
            user_id: staff.userId,
            title: 'New task assignment',
            message: `${newBookingForm.serviceType} has been assigned to you.`,
          })
        }
      }
    }

    await supabase.from('audit_logs').insert({ user_id: user.id, action: 'manager_create_booking', details: `${newBookingForm.serviceType} (${createdBooking?.id || ''})` })
    showNotification('Task created and approved.')
    closeNewBookingModal()
    await loadBookings()
  }

  const statusLabel = (status) => status.replace('_', ' ').replace(/^\w/, c => c.toUpperCase())

  const isAiRecommended = (booking) => booking.status === 'pending' && !!booking.assigned_staff_id

  const matchesSourceFilter = (booking, filter) => {
    if (filter === 'all') return true
    if (filter === 'ai') return isAiRecommended(booking)
    return (booking.source || 'customer') === filter
  }

  const matchesTimeFilter = (booking, filter) => {
    if (filter === 'all') return true
    if (filter === 'pending') return booking.status === 'pending'
    const tone = getScheduleBadge(booking).tone
    if (filter === 'today') return tone === 'today'
    if (filter === 'upcoming') return tone === 'upcoming' || tone === 'tomorrow'
    if (filter === 'overdue') return tone === 'overdue'
    return true
  }

  const matchesBookingSearch = (booking, term) => {
    if (!term.trim()) return true
    const haystack = [
      booking.service_type,
      booking.location,
      booking.description,
      booking.guest_name,
      booking.customer?.full_name,
      booking.customer?.email,
      booking.staff_profiles?.staff_name,
    ].filter(Boolean).join(' ').toLowerCase()
    return haystack.includes(term.trim().toLowerCase())
  }

  const visibleBookings = bookings.filter(booking =>
    matchesSourceFilter(booking, sourceFilter)
    && matchesTimeFilter(booking, timeFilter)
    && (bookingStatusFilter === 'all' || booking.status === bookingStatusFilter)
    && (bookingServiceTypeFilter === 'all' || booking.service_type === bookingServiceTypeFilter)
    && matchesBookingSearch(booking, bookingSearch)
  )
  const bookingServiceTypes = Array.from(new Set(bookings.map(b => b.service_type).filter(Boolean))).sort()
  const timeFilterCounts = Object.fromEntries(TIME_FILTERS.map(tab => [tab.value, bookings.filter(b => matchesTimeFilter(b, tab.value)).length]))
  const sourceFilterCounts = Object.fromEntries(SOURCE_FILTERS.map(tab => [tab.value, bookings.filter(b => matchesSourceFilter(b, tab.value)).length]))
  const totalPages = Math.max(1, Math.ceil(visibleBookings.length / BOOKINGS_PAGE_SIZE))
  const safePage = Math.min(currentPage, totalPages)
  const pageBookings = visibleBookings.slice((safePage - 1) * BOOKINGS_PAGE_SIZE, safePage * BOOKINGS_PAGE_SIZE)

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent text-white">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Bookings for Review</h1>
            <p className="text-gray-500 mt-1">AI recommends the best-matched staff for each booking. Approve to confirm, or override the pick below.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={openNewTaskModal}
          className="flex items-center gap-1.5 rounded-lg bg-accent hover:bg-accent-600 px-4 py-2 text-sm font-semibold text-white transition"
        >
          <Plus className="w-4 h-4" /> New Task
        </button>
      </div>
      <div className="mt-4 mb-6 flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={bookingSearch}
            onChange={e => setBookingSearch(e.target.value)}
            placeholder="Search bookings..."
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent-200"
          />
        </div>
        <div className="inline-flex flex-wrap overflow-hidden rounded-lg border border-gray-200">
          {BOOKING_STATUS_FILTERS.map(option => (
            <button
              key={option.value}
              type="button"
              onClick={() => setBookingStatusFilter(option.value)}
              className={`px-3.5 py-2 text-sm font-medium transition ${bookingStatusFilter === option.value ? 'bg-accent text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="relative sm:ml-auto">
          <button
            type="button"
            onClick={() => setBookingFiltersOpen(open => !open)}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
          >
            <Filter className="w-4 h-4" /> Filters <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
          </button>
          {bookingFiltersOpen && (
            <div className="absolute right-0 mt-1 w-52 bg-white border rounded-lg shadow-lg z-10 overflow-hidden">
              <p className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">When</p>
              {TIME_FILTERS.map(tab => (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => { setTimeFilter(tab.value); setBookingFiltersOpen(false) }}
                  className={`flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-gray-50 ${timeFilter === tab.value ? 'text-accent-600 font-medium' : 'text-gray-700'}`}
                >
                  {tab.label} <span className="text-xs text-gray-400">{timeFilterCounts[tab.value]}</span>
                </button>
              ))}
              <p className="border-t px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Source</p>
              {SOURCE_FILTERS.map(tab => (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => { setSourceFilter(tab.value); setBookingFiltersOpen(false) }}
                  className={`flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-gray-50 ${sourceFilter === tab.value ? 'text-accent-600 font-medium' : 'text-gray-700'}`}
                >
                  {tab.label} <span className="text-xs text-gray-400">{sourceFilterCounts[tab.value]}</span>
                </button>
              ))}
              <p className="border-t px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Service Type</p>
              <button
                type="button"
                onClick={() => { setBookingServiceTypeFilter('all'); setBookingFiltersOpen(false) }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${bookingServiceTypeFilter === 'all' ? 'text-accent-600 font-medium' : 'text-gray-700'}`}
              >
                Any service type
              </button>
              {bookingServiceTypes.map(type => (
                <button
                  key={type}
                  type="button"
                  onClick={() => { setBookingServiceTypeFilter(type); setBookingFiltersOpen(false) }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${bookingServiceTypeFilter === type ? 'text-accent-600 font-medium' : 'text-gray-700'}`}
                >
                  {type}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {notification && <div className="mb-4 p-3 bg-green-50 text-green-700 rounded-lg flex items-center gap-2"><Bell className="w-4 h-4" />{notification}</div>}

      {recurringBookings.length > 0 && (
        <div className="mb-6 bg-white rounded-xl shadow-sm border border-purple-100 overflow-hidden">
          <div className="p-4 border-b bg-purple-50 flex items-center gap-2">
            <Repeat className="w-4 h-4 text-purple-600" />
            <h2 className="font-semibold text-purple-900">Recurring Booking Requests ({recurringBookings.length})</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {recurringBookings.map(recurring => (
              <div key={recurring.id} className="p-4">
                <div className="min-w-0">
                  <h3 className="font-semibold text-gray-900">{recurring.service_type}</h3>
                  <p className="text-sm text-gray-500 flex items-center gap-1 mt-1"><MapPin className="w-4 h-4" />{recurring.location}</p>
                  <p className="text-xs text-gray-400 mt-2">
                    Requested by {recurring.customer?.full_name || recurring.customer?.email || 'Customer'}{recurring.customer?.phone ? ` · ${recurring.customer.phone}` : ''} on {new Date(recurring.created_at).toLocaleDateString()}
                  </p>
                  <p className="text-sm text-gray-600 mt-2 flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    {recurring.start_date} to {recurring.end_date} · {formatDaysOfWeek(recurring.days_of_week)}{recurring.scheduled_time ? ` · ${formatTime(recurring.scheduled_time)}` : ''}
                  </p>
                  {recurring.description && (
                    <p className="text-sm text-gray-600 mt-2"><span className="font-medium text-gray-700">Description:</span> {recurring.description}</p>
                  )}
                </div>
                {recurringRejecting === recurring.id ? (
                  <div className="mt-3 space-y-2">
                    <textarea
                      value={recurringRejectReason}
                      onChange={e => setRecurringRejectReason(e.target.value)}
                      rows={2}
                      placeholder="Reason for rejecting (optional)..."
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleReviewRecurring(recurring.id, 'Rejected', recurringRejectReason)}
                        disabled={recurringActionId === recurring.id}
                        className="px-3 py-1.5 bg-red-500 text-white rounded-lg text-sm disabled:opacity-50"
                      >
                        Confirm Reject
                      </button>
                      <button
                        type="button"
                        onClick={() => { setRecurringRejecting(null); setRecurringRejectReason('') }}
                        className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleReviewRecurring(recurring.id, 'Approved')}
                      disabled={recurringActionId === recurring.id}
                      className="flex items-center gap-1 px-3 py-1.5 bg-green-500 text-white rounded-lg text-sm disabled:opacity-50"
                    >
                      <CheckCircle className="w-4 h-4" /> Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => setRecurringRejecting(recurring.id)}
                      disabled={recurringActionId === recurring.id}
                      className="flex items-center gap-1 px-3 py-1.5 bg-gray-200 text-gray-700 rounded-lg text-sm disabled:opacity-50"
                    >
                      <XCircle className="w-4 h-4" /> Reject
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full table-fixed text-sm">
              <colgroup>
                <col className="w-[20%]" />
                <col className="w-[15%]" />
                <col className="w-[15%]" />
                <col className="w-[16%]" />
                <col className="w-[13%]" />
                <col className="w-[11%]" />
                <col className="w-[10%]" />
              </colgroup>
              <thead>
                <tr className="border-b bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <th className="px-3 py-2.5">Service</th>
                  <th className="px-3 py-2.5">Customer</th>
                  <th className="px-3 py-2.5">Location</th>
                  <th className="px-3 py-2.5">Assignee</th>
                  <th className="px-3 py-2.5">Date</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pageBookings.map(booking => {
                  const scheduleBadge = getScheduleBadge(booking)
                  const ServiceIcon = serviceIcon(booking.service_type)
                  const customerLabel = booking.source === 'manager'
                    ? `${booking.guest_name || 'Walk-in'}`
                    : booking.source === 'department'
                      ? (booking.departments?.name ? `${booking.departments.name} dept.` : 'Department')
                      : (booking.customer?.full_name || booking.customer?.email || 'Customer')
                  return (
                    <tr
                      key={booking.id}
                      className="transition hover:bg-gray-50"
                    >
                      <td className="px-3 py-2.5">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent-100 text-accent-600">
                            <ServiceIcon className="h-3.5 w-3.5" />
                          </span>
                          <span className="truncate font-semibold text-gray-900">{booking.service_type}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-gray-600"><span className="block truncate">{customerLabel}</span></td>
                      <td className="px-3 py-2.5 text-gray-600"><span className="block truncate">{booking.location}</span></td>
                      <td className="px-3 py-2.5">
                        {booking.staff_profiles?.staff_name ? (
                          <div className="flex min-w-0 items-center gap-2">
                            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${avatarColor(booking.staff_profiles.staff_name)}`}>
                              {booking.staff_profiles.staff_name.split(' ').map(part => part[0]).join('').slice(0, 2)}
                            </span>
                            <span className="truncate text-gray-700">{booking.staff_profiles.staff_name}</span>
                          </div>
                        ) : (
                          <span className="text-gray-400">Unassigned</span>
                        )}
                      </td>
                      <td className={`px-3 py-2.5 truncate ${dateToneColor[scheduleBadge.tone].split(' ').filter(c => c.startsWith('text-')).join(' ') || 'text-gray-600'}`}>
                        {scheduleBadge.label}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-flex text-xs px-2 py-1 rounded-full font-medium ${statusColor[booking.status] || 'bg-gray-100 text-gray-600'}`}>
                          {assigningBookingId === booking.id ? 'Assigning...' : statusLabel(booking.status)}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => setDetailBookingId(booking.id)}
                          aria-label="View booking"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition hover:bg-gray-50"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {visibleBookings.length === 0 && (
            <div className="p-8 text-center text-gray-400">
              {bookings.length === 0 ? 'No bookings found.' : 'No bookings match these filters.'}
            </div>
          )}
          {visibleBookings.length > 0 && (
            <div className="flex items-center justify-between border-t px-4 py-3">
              <span className="text-xs text-gray-500">Page {safePage} of {totalPages}</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={safePage <= 1}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Prev
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={safePage >= totalPages}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {detailBookingId && (() => {
        const booking = bookings.find(b => b.id === detailBookingId)
        if (!booking) return null
        const scheduleBadge = getScheduleBadge(booking)
        const closeDrawer = () => { setDetailBookingId(null); setReassigningId(null); setDeletingId(null) }
        return (
          <>
            <div className="fixed inset-0 z-40 bg-gray-900/40" onClick={closeDrawer} />
            <div className="fixed right-0 top-0 bottom-0 z-50 flex w-full max-w-[420px] flex-col bg-white shadow-lg">
              <div className="flex items-center justify-between border-b p-5">
                <h4 className="font-semibold text-gray-900">Booking detail</h4>
                <button type="button" onClick={closeDrawer} aria-label="Close" className="text-gray-400 hover:text-gray-600">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-5 space-y-5">
                <div>
                  <span className={`inline-flex text-xs px-2 py-1 rounded-full font-medium ${statusColor[booking.status] || 'bg-gray-100 text-gray-600'}`}>
                    {assigningBookingId === booking.id ? 'Assigning...' : statusLabel(booking.status)}
                  </span>
                  <h3 className="mt-2 font-semibold text-gray-900">{booking.service_type}</h3>
                  <p className="text-sm text-gray-500 flex items-center gap-1 mt-1"><MapPin className="w-4 h-4" />{booking.location}</p>
                </div>
                <div className="border-t border-gray-100" />
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-[11px] uppercase text-gray-400">Customer</p>
                    <p className="font-semibold text-gray-900">
                      {booking.source === 'manager'
                        ? `${booking.guest_name || 'Walk-in'}`
                        : booking.source === 'department'
                          ? (booking.departments?.name ? `${booking.departments.name} dept.` : 'Department')
                          : (booking.customer?.full_name || booking.customer?.email || 'Customer')}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase text-gray-400">Assignee</p>
                    <p className="font-semibold text-gray-900">{booking.staff_profiles?.staff_name || 'Unassigned'}</p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase text-gray-400">Date</p>
                    <p className="font-semibold text-gray-900">{scheduleBadge.label}</p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase text-gray-400">Source</p>
                    <p className="font-semibold text-gray-900">{getSourceMeta(booking.source).label}</p>
                  </div>
                </div>
                <div className="border-t border-gray-100" />
                {booking.status === 'pending' && booking.staff_profiles?.staff_name && (
                  <div className="flex items-start justify-between gap-2 rounded-lg border border-accent-200 bg-accent-100 px-3 py-2">
                    <p className="text-sm text-accent-800 flex items-start gap-1">
                      <Sparkles className="w-4 h-4 mt-0.5 shrink-0" />
                      <span>
                        AI Recommended: <span className="font-medium">{booking.staff_profiles.staff_name}</span>
                        {booking.recommendation_reason && <span className="block text-xs text-accent-600 font-normal">{booking.recommendation_reason}</span>}
                      </span>
                    </p>
                    <button
                      type="button"
                      onClick={() => handleRerunMatch(booking)}
                      disabled={rerunningId === booking.id}
                      title="Re-run AI match using the latest notes and staff availability"
                      className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-accent-600 hover:bg-accent-200 disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${rerunningId === booking.id ? 'animate-spin' : ''}`} />
                    </button>
                  </div>
                )}
                {booking.description && (
                  <div>
                    <p className="text-[11px] uppercase text-gray-400 mb-1">Description</p>
                    <p className="text-sm text-gray-600">{booking.description}</p>
                  </div>
                )}
                {booking.notes && (
                  <div>
                    <p className="text-[11px] uppercase text-gray-400 mb-1">Notes</p>
                    <p className="text-sm text-gray-600">{booking.notes}</p>
                  </div>
                )}

                {booking.status !== 'rejected' && (
                  <button
                    type="button"
                    onClick={() => setReassigningId(prev => prev === booking.id ? null : booking.id)}
                    className="flex items-center gap-1 rounded-lg px-3 py-2 -mx-3 text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                  >
                    <UserCheck className="w-4 h-4" />
                    {reassigningId === booking.id ? 'Cancel' : booking.status === 'pending' ? 'Choose different staff' : 'Reassign staff'}
                  </button>
                )}
                {reassigningId === booking.id && (
                  <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                    {booking.status === 'pending' && (
                      <p className="text-xs text-gray-500 mb-2">Assigning will also approve this booking.</p>
                    )}
                    <div className="flex flex-col gap-2">
                      <select
                        value={selectedStaffId[booking.id] || ''}
                        onChange={(event) => setSelectedStaffId(prev => ({ ...prev, [booking.id]: event.target.value }))}
                        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
                      >
                        <option value="">Choose staff...</option>
                        {staffRows.map(staff => {
                          const offOnDate = isStaffOffOnDate(staff.id, booking.scheduled_date, approvedTimeOff)
                          const assignable = staff.canAssign && !offOnDate
                          return (
                            <option key={staff.id} value={staff.id} disabled={!assignable}>
                              {staff.name}{assignable ? '' : offOnDate ? ' (Off that day)' : ` (${staff.status})`}
                            </option>
                          )
                        })}
                      </select>
                      <button
                        type="button"
                        onClick={() => handleManualAssign(booking)}
                        disabled={!selectedStaffId[booking.id] || assigningBookingId === booking.id}
                        className="flex items-center justify-center gap-1 px-4 py-2 bg-accent hover:bg-accent-600 text-white rounded-lg text-sm font-semibold transition disabled:opacity-50"
                      >
                        <UserCheck className="w-4 h-4" /> {booking.status === 'pending' ? 'Assign & Approve' : 'Confirm'}
                      </button>
                    </div>
                  </div>
                )}

                {booking.status === 'rejected' && (
                  <div className="flex items-center justify-end gap-2">
                    {deletingId === booking.id ? (
                      <>
                        <span className="text-sm text-gray-500">Delete permanently?</span>
                        <button
                          onClick={() => handleDeleteBooking(booking.id)}
                          className="flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700"
                        >
                          <Trash2 className="w-4 h-4" /> Confirm Delete
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingId(null)}
                          className="rounded-lg px-3 py-2 text-sm font-medium text-gray-500 hover:bg-gray-100"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setDeletingId(booking.id)}
                        title="Delete"
                        aria-label="Delete booking"
                        className="flex items-center justify-center gap-1.5 rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" /> Delete booking
                      </button>
                    )}
                  </div>
                )}
              </div>
              {booking.status === 'pending' && (
                <div className="flex gap-2 border-t p-5">
                  <button
                    onClick={() => handleReview(booking.id, 'Approved')}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-green-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-green-600"
                  >
                    <CheckCircle className="w-4 h-4" /> Approve
                  </button>
                  <button
                    onClick={() => handleReview(booking.id, 'Rejected')}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-600"
                  >
                    <XCircle className="w-4 h-4" /> Reject
                  </button>
                </div>
              )}
            </div>
          </>
        )
      })()}

      {showNewBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form onSubmit={handleCreateBooking} className="w-full max-w-lg rounded-xl bg-white p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">New Task</h3>
              <button type="button" onClick={closeNewBookingModal} aria-label="Close"><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <p className="text-sm text-gray-500 mt-1">For walk-in or phone bookings. This still goes through the normal approve &amp; assign flow.</p>

            <div className="space-y-3 mt-4">
              <div>
                <label className="text-sm font-medium text-gray-700">Customer Name</label>
                <input value={newBookingForm.guestName} onChange={e => setNewBookingForm({ ...newBookingForm, guestName: e.target.value })} className="mt-1 w-full border rounded-lg p-2 text-sm" placeholder="Full name" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Customer Email (optional)</label>
                <input type="email" value={newBookingForm.customerEmail} onChange={e => setNewBookingForm({ ...newBookingForm, customerEmail: e.target.value })} className="mt-1 w-full border rounded-lg p-2 text-sm" placeholder="Links to an existing customer account, if any" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Service Type</label>
                <select value={newBookingForm.serviceType} onChange={e => setNewBookingForm({ ...newBookingForm, serviceType: e.target.value })} className="mt-1 w-full border rounded-lg p-2 text-sm">
                  {serviceTypes.map(type => <option key={type} value={type}>{type}</option>)}
                </select>
              </div>
              <AddressFields
                onLocationChange={location => setNewBookingForm(prev => ({ ...prev, location }))}
                onCoordinatesChange={setNewBookingCoordinates}
                compact
              />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700">Scheduled Date</label>
                  <input type="date" value={newBookingForm.scheduledDate} onChange={e => setNewBookingForm({ ...newBookingForm, scheduledDate: e.target.value })} className="mt-1 w-full border rounded-lg p-2 text-sm" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Scheduled Time</label>
                  <TimeInput className="mt-1" value={newBookingForm.scheduledTime} onChange={value => setNewBookingForm({ ...newBookingForm, scheduledTime: value })} />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Estimated Hours</label>
                <input type="number" min="1" step="0.5" value={newBookingForm.estimatedHours} onChange={e => setNewBookingForm({ ...newBookingForm, estimatedHours: Number(e.target.value) })} className="mt-1 w-full border rounded-lg p-2 text-sm" />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-500" /> Assign Staff
                </label>
                {newBookingForm.location ? (
                  newBookingRecommendations.length > 0 ? (
                    <>
                      <select
                        value={selectedNewBookingStaffId}
                        onChange={e => setSelectedNewBookingStaffId(e.target.value)}
                        className="mt-1 w-full border rounded-lg p-2 text-sm"
                      >
                        <option value="">— Unassigned (assign later) —</option>
                        {newBookingRecommendations.map(rec => (
                          <option key={rec.staff_id} value={rec.staff_id}>{rec.staff_name} — {rec.reason}</option>
                        ))}
                      </select>
                      {selectedNewBookingStaffId && newBookingRecommendations[0]?.staff_id === selectedNewBookingStaffId && (
                        <p className="mt-1 text-xs text-indigo-600 flex items-center gap-1"><Sparkles className="w-3 h-3" /> AI-recommended top match</p>
                      )}
                    </>
                  ) : (
                    <p className="mt-1 text-xs text-gray-400">No strong staff match found yet — the task will be created unassigned.</p>
                  )
                ) : (
                  <p className="mt-1 text-xs text-gray-400">Enter a location to see AI-recommended staff.</p>
                )}
              </div>

              {generateError && <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-600">{generateError}</div>}

              <div>
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-700">Description</label>
                  <button
                    type="button"
                    onClick={handleGenerateDescription}
                    disabled={generatingTask}
                    className="flex items-center gap-1 rounded-full bg-purple-50 px-2.5 py-1 text-xs font-medium text-purple-600 hover:bg-purple-100 disabled:opacity-60"
                  >
                    <Sparkles className="w-3 h-3" /> {generatingTask ? 'Generating...' : 'Generate with AI'}
                  </button>
                </div>
                <textarea value={newBookingForm.description} onChange={e => setNewBookingForm({ ...newBookingForm, description: e.target.value })} className="mt-1 w-full border rounded-lg p-2 text-sm" rows={2} />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Notes</label>
                <textarea value={newBookingForm.notes} onChange={e => setNewBookingForm({ ...newBookingForm, notes: e.target.value })} className="mt-1 w-full border rounded-lg p-2 text-sm" rows={2} />
              </div>
              <button type="submit" disabled={creatingBooking} className="w-full bg-accent hover:bg-accent-600 text-white py-2 rounded-lg font-semibold flex items-center justify-center gap-2 transition disabled:opacity-60">
                <Plus className="w-4 h-4" /> {creatingBooking ? 'Creating...' : 'Create Task'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
