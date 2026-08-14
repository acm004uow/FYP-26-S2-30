import { useEffect, useState } from 'react'
import { CheckCircle, XCircle, Bell, MapPin, UserCheck, Calendar, Sparkles, RefreshCw, X, Repeat, Home, Building2, Droplets, Truck, Layers, Search, Filter, ChevronDown, Trash2, Eye, Phone, ArrowRight } from 'lucide-react'
import { supabase } from '../../../../lib/supabaseClient'
import { assignStaffToBooking } from '../../../../lib/assignBooking'
import { generateRecommendations } from '../../../../lib/recommendationEngine'
import { fetchApprovedTimeOffClient, getExcludedStaffIdsForDate, isStaffOffOnDate } from '../../../../lib/staffTimeOff'

const BOOKINGS_PAGE_SIZE = 8

const TIME_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'today', label: 'Today' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'overdue', label: 'Overdue' },
]

// The 'tasks' scope only ever loads manager/department-sourced rows (see loadBookings), so a
// "Customer Booked" tab there would always read 0 — and the 'customer' scope's rows are all
// already customer-sourced, so "Manager Created"/"Department Requests" would too. Each scope only
// gets the tabs that can actually match something.
function getSourceFilters(scope) {
  return scope === 'tasks'
    ? [
      { value: 'all', label: 'All Sources' },
      { value: 'manager', label: 'Manager Created' },
      { value: 'department', label: 'Department Requests' },
      { value: 'ai', label: 'AI Recommended' },
    ]
    : [
      { value: 'all', label: 'All Sources' },
      { value: 'ai', label: 'AI Recommended' },
    ]
}

const SERVICE_ICONS = {
  'Home Cleaning': Home,
  'Office Cleaning': Building2,
  'Deep Cleaning': Droplets,
  'Move-Out Cleaning': Truck,
  'Carpet Cleaning': Layers,
}

const serviceIcon = (type) => SERVICE_ICONS[type] || Home

// Keyword match rather than an exact-name lookup like SERVICE_ICONS above — recurring bookings'
// service_type is free text from the customer form (e.g. "Move in Cleaning", "Move out Cleaning"),
// which doesn't line up with SERVICE_ICONS's canonical keys ("Home Cleaning", "Move-Out Cleaning"),
// so an exact match would leave most recurring cards on the same default look.
const RECURRING_CARD_THEMES = [
  { keywords: ['office'], accent: 'text-orange-600', btn: 'bg-orange-50 text-orange-700 hover:bg-orange-100' },
  { keywords: ['deep'], accent: 'text-blue-500', btn: 'bg-blue-50 text-blue-700 hover:bg-blue-100' },
  { keywords: ['move out', 'move-out', 'moveout'], accent: 'text-purple-600', btn: 'bg-purple-50 text-purple-700 hover:bg-purple-100' },
  { keywords: ['carpet'], accent: 'text-teal-600', btn: 'bg-teal-50 text-teal-700 hover:bg-teal-100' },
  { keywords: ['move in', 'move-in', 'movein', 'home'], accent: 'text-green-600', btn: 'bg-green-50 text-green-700 hover:bg-green-100' },
]
const DEFAULT_RECURRING_THEME = { accent: 'text-gray-600', btn: 'bg-gray-100 text-gray-700 hover:bg-gray-200' }

function getRecurringTheme(serviceType) {
  const lower = String(serviceType || '').toLowerCase()
  return RECURRING_CARD_THEMES.find(theme => theme.keywords.some(keyword => lower.includes(keyword))) || DEFAULT_RECURRING_THEME
}

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

const statusColor = {
  pending: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  in_progress: 'bg-indigo-100 text-indigo-700',
  completed: 'bg-emerald-100 text-emerald-700',
}

const recurringStatusColor = {
  pending: 'bg-yellow-100 text-yellow-700',
  active: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-500',
}
const recurringStatusLabel = { pending: 'Pending', active: 'Active', rejected: 'Rejected', cancelled: 'Cancelled' }

// Tasks never loads pending/rejected rows (see loadBookings) — a manager/department booking only
// becomes a task once approved — so those tabs are dropped there rather than always reading empty.
function getStatusFilters(scope) {
  const all = [
    { value: 'all', label: 'All' },
    { value: 'pending', label: 'Pending' },
    { value: 'approved', label: 'Approved' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'completed', label: 'Completed' },
    { value: 'rejected', label: 'Rejected' },
  ]
  return scope === 'tasks' ? all.filter(option => option.value !== 'pending' && option.value !== 'rejected') : all
}

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

// sourceScope splits the unified `bookings` table into two manager-facing pages: 'customer'
// (the default Bookings page — real customer bookings only) and 'tasks' (manager/department
// tasks created straight from the New Task form, with their Source visible per row).
export default function BookingsReviewPanel({ sourceScope = 'customer' }) {
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
  const [hostAdminId, setHostAdminId] = useState(null)
  const [recurringBookings, setRecurringBookings] = useState([])
  const [recurringActionId, setRecurringActionId] = useState(null)
  const [recurringRejecting, setRecurringRejecting] = useState(null)
  const [recurringRejectReason, setRecurringRejectReason] = useState('')
  // Holds the AI proposal for a recurring booking's first batch of visits, right after it's
  // approved — { serviceType, rows: [{ booking_id, scheduled_date, recommended_staff_name, ... }] }
  // — shown in a drawer so the manager can bulk-approve without leaving this page. Null = closed.
  const [recurringProposal, setRecurringProposal] = useState(null)
  const [approvingProposal, setApprovingProposal] = useState(false)
  const [approvedTimeOff, setApprovedTimeOff] = useState([])
  const [bookingSearch, setBookingSearch] = useState('')
  const [bookingStatusFilter, setBookingStatusFilter] = useState('all')
  const [bookingServiceTypeFilter, setBookingServiceTypeFilter] = useState('all')
  const [bookingFiltersOpen, setBookingFiltersOpen] = useState(false)
  const [bookingDateFrom, setBookingDateFrom] = useState('')
  const [bookingDateTo, setBookingDateTo] = useState('')
  const [detailBookingId, setDetailBookingId] = useState(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [recurringVisitsPage, setRecurringVisitsPage] = useState(1)

  const loadRecurringBookings = async (hostAdminIdParam) => {
    if (!hostAdminIdParam) {
      setRecurringBookings([])
      return
    }
    const { data } = await supabase
      .from('recurring_bookings')
      .select('id,customer_id,service_type,location,description,days_of_week,scheduled_time,estimated_hours,staff_count,start_date,end_date,status,rejection_reason,created_at,customer:profiles!recurring_bookings_customer_id_fkey(full_name,email,phone)')
      .eq('host_admin_id', hostAdminIdParam)
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

    let bookingsQuery = supabase
      .from('bookings')
      .select('id,customer_id,service_type,location,latitude,longitude,description,notes,requested_staff_name,scheduled_date,scheduled_time,status,created_at,assigned_staff_id,recommendation_reason,source,guest_name,guest_contact,department_id,recurring_booking_id,customer:profiles!bookings_customer_id_fkey(full_name,email,phone),staff_profiles(staff_name),departments(name)')
      .eq('host_admin_id', hostAdminIdResolved)
      .order('created_at', { ascending: false })
    bookingsQuery = sourceScope === 'tasks'
      // Tasks is work the manager/department has already decided on — a booking that's still
      // pending (not yet approved) or was rejected outright isn't a task yet, so it's excluded
      // here rather than sharing the 'customer' scope's full review-queue status list below.
      ? bookingsQuery.in('source', ['manager', 'department']).in('status', ['approved', 'in_progress', 'completed'])
      : bookingsQuery.eq('source', 'customer').in('status', ['pending', 'approved', 'in_progress', 'completed', 'rejected'])

    const [{ data: bookingRows }, { data: staff }] = await Promise.all([
      bookingsQuery,
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
      bookingsChannel = supabase
        .channel(`bookings-review-${resolvedHostAdminId}-${Date.now()}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'bookings', filter: `host_admin_id=eq.${resolvedHostAdminId}` },
          () => { if (!cancelled) loadBookings() }
        )
        .subscribe()
      if (sourceScope === 'customer') {
        loadRecurringBookings(resolvedHostAdminId)
        recurringChannel = supabase
          .channel(`recurring-bookings-review-${resolvedHostAdminId}-${Date.now()}`)
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'recurring_bookings', filter: `host_admin_id=eq.${resolvedHostAdminId}` },
            () => { if (!cancelled) loadRecurringBookings(resolvedHostAdminId) }
          )
          .subscribe()
      }
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
    setCurrentPage(1)
    setRecurringVisitsPage(1)
  }, [bookingSearch, bookingStatusFilter, bookingServiceTypeFilter, timeFilter, sourceFilter, bookingDateFrom, bookingDateTo])

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

  // Shared by handleReviewRecurring (right after approval) and the "Build & Review Staff" button
  // on an already-active recurring booking (see the read-only Recurring Bookings list below) — both
  // need the exact same "hit the route, open the drawer if it found visits" behavior. Returns a
  // short human-readable notice so each call site can fold it into its own toast message.
  const triggerRecurringScheduleBuild = async (recurringId, serviceTypeFallback) => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const response = await fetch('/api/manager/build-recurring-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ recurring_booking_id: recurringId }),
      })
      const result = await response.json().catch(() => null)
      if (response.ok && result?.generated && result.proposal?.length) {
        setRecurringProposal({ serviceType: result.service_type || serviceTypeFallback, rows: result.proposal })
        return { ok: true, notice: ' Review its visits on the right.' }
      }
      if (response.ok && result?.generated === false) {
        return { ok: true, notice: ` ${result.message || ''}` }
      }
      return { ok: false, notice: result?.error ? ` ${result.error}` : '' }
    } catch {
      return { ok: false, notice: '' }
    }
  }

  const handleBuildScheduleForActive = async (recurring) => {
    setRecurringActionId(recurring.id)
    const { notice } = await triggerRecurringScheduleBuild(recurring.id, recurring.service_type)
    setRecurringActionId(null)
    if (notice.trim()) showNotification(notice.trim())
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

    // Build this recurring booking's first batch of visits (and their AI recommendations)
    // immediately on approval, instead of leaving the manager to wait for the daily cron to reach
    // this business's cutoff — see app/api/manager/build-recurring-schedule/route.js. The result is
    // shown in a review drawer (see handleApproveAllRecommended below) rather than just a toast, so
    // the manager can act on it right away. Best-effort: a failure here still leaves the recurring
    // booking approved; the cron picks it up on its next run — or the manager can retry via the
    // "Build & Review Staff" button on the Recurring Bookings list (handleBuildScheduleForActive).
    let scheduleNotice = ''
    if (!error && reviewed && status === 'active') {
      const result = await triggerRecurringScheduleBuild(id, reviewed.service_type)
      scheduleNotice = result.notice
    }

    setRecurringActionId(null)
    setRecurringRejecting(null)
    setRecurringRejectReason('')
    showNotification(error
      ? error.message
      : reviewed
        ? `Recurring booking ${status === 'active' ? 'approved' : 'rejected'}.${scheduleNotice}`
        : 'This request is no longer pending.')
    await loadRecurringBookings(hostAdminId)
    if (scheduleNotice) await loadBookings()
  }

  // Bulk-approves every visit in the open recurring proposal drawer that got a fresh staff
  // recommendation, reusing handleReview per booking so the workload increment / staff
  // notification / audit log all stay identical to approving a booking one at a time. Excludes
  // already_assigned rows (visits a previous approval already confirmed — re-running handleReview
  // on those would just no-op against its `.eq('status','pending')` guard) and rows with no
  // recommendation at all (no suitable staff found — approving those would confirm a booking with
  // no one assigned; they still need a manual pick, either from the main table or by reassigning).
  const handleApproveAllRecommended = async () => {
    if (!recurringProposal) return
    const idsToApprove = recurringProposal.rows.filter(row => !row.already_assigned && row.recommended_staff_id).map(row => row.booking_id)
    if (idsToApprove.length === 0) {
      setRecurringProposal(null)
      return
    }
    setApprovingProposal(true)
    for (const bookingId of idsToApprove) {
      await handleReview(bookingId, 'Approved')
    }
    setApprovingProposal(false)
    setRecurringProposal(null)
    showNotification(`Approved ${idsToApprove.length} visit${idsToApprove.length === 1 ? '' : 's'}.`)
  }

  const performAssignment = async (booking, staffId, action) => {
    const staff = staffRows.find(item => item.id === staffId)
    if (!staff || ['rejected', 'completed'].includes(booking.status)) return
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
    && (!bookingDateFrom || (booking.scheduled_date && booking.scheduled_date >= bookingDateFrom))
    && (!bookingDateTo || (booking.scheduled_date && booking.scheduled_date <= bookingDateTo))
    && matchesBookingSearch(booking, bookingSearch)
  )
  const bookingServiceTypes = Array.from(new Set(bookings.map(b => b.service_type).filter(Boolean))).sort()
  const sourceFilters = getSourceFilters(sourceScope)
  const statusFilters = getStatusFilters(sourceScope)
  const timeFilterCounts = Object.fromEntries(TIME_FILTERS.map(tab => [tab.value, bookings.filter(b => matchesTimeFilter(b, tab.value)).length]))
  const sourceFilterCounts = Object.fromEntries(sourceFilters.map(tab => [tab.value, bookings.filter(b => matchesSourceFilter(b, tab.value)).length]))
  // Recurring-generated visits are kept out of the main table entirely — they're a different kind
  // of thing (a slot that already has a parent recurring booking, reviewable in bulk via that
  // booking's "Build & Review Staff" drawer) from a one-off booking a manager reviews individually,
  // and listing them side by side in one flat table made it hard to tell which was which.
  const oneTimeVisible = visibleBookings.filter(booking => !booking.recurring_booking_id)
  const recurringVisible = visibleBookings.filter(booking => booking.recurring_booking_id)

  const totalPages = Math.max(1, Math.ceil(oneTimeVisible.length / BOOKINGS_PAGE_SIZE))
  const safePage = Math.min(currentPage, totalPages)
  const pageBookings = oneTimeVisible.slice((safePage - 1) * BOOKINGS_PAGE_SIZE, safePage * BOOKINGS_PAGE_SIZE)

  const recurringTotalPages = Math.max(1, Math.ceil(recurringVisible.length / BOOKINGS_PAGE_SIZE))
  const recurringSafePage = Math.min(recurringVisitsPage, recurringTotalPages)
  const recurringPageBookings = recurringVisible.slice((recurringSafePage - 1) * BOOKINGS_PAGE_SIZE, recurringSafePage * BOOKINGS_PAGE_SIZE)
  const pendingRecurring = recurringBookings.filter(r => r.status === 'pending')
  const activeOrPastRecurring = recurringBookings.filter(r => r.status !== 'pending')

  // recurring_bookings.status only ever tracks the *definition's* own approval (pending/active/
  // rejected/cancelled) — it stays "active" forever once approved, even after every visit has been
  // completed. The card badge should instead reflect where the actual generated visits are at,
  // using the same status vocabulary/colors as the Bookings table. Built from `bookings` (already
  // loaded, no extra query) rather than recurringVisible, since that's filtered by the page's
  // search/status/date filters and would give a misleading count.
  const recurringVisitCounts = new Map()
  for (const booking of bookings) {
    if (!booking.recurring_booking_id) continue
    const counts = recurringVisitCounts.get(booking.recurring_booking_id) || {}
    counts[booking.status] = (counts[booking.status] || 0) + 1
    recurringVisitCounts.set(booking.recurring_booking_id, counts)
  }

  const getRecurringDisplayStatus = (recurring) => {
    if (recurring.status !== 'active') {
      return { key: recurring.status, label: recurringStatusLabel[recurring.status] || statusLabel(recurring.status), color: recurringStatusColor[recurring.status] || 'bg-gray-100 text-gray-500' }
    }
    const counts = recurringVisitCounts.get(recurring.id)
    const total = counts ? Object.values(counts).reduce((sum, n) => sum + n, 0) : 0
    if (total === 0) return { key: 'active', label: 'Active', color: recurringStatusColor.active }
    if (counts.pending > 0) return { key: 'pending', label: statusLabel('pending'), color: statusColor.pending }
    if (counts.in_progress > 0) return { key: 'in_progress', label: statusLabel('in_progress'), color: statusColor.in_progress }
    if (counts.completed === total) return { key: 'completed', label: statusLabel('completed'), color: statusColor.completed }
    return { key: 'approved', label: statusLabel('approved'), color: statusColor.approved }
  }

  // The two visit tables below already respect the page's Status/Service/Search filters (via
  // visibleBookings) — the recurring booking cards need the same treatment, keyed off the derived
  // display status above rather than recurring_bookings.status, otherwise a card stays visible
  // (e.g. showing "Approved") while the manager has the Pending tab selected, which looks like the
  // filter silently isn't working. Time and Source filters are skipped here: both are about a
  // single visit's date/AI-match state, which doesn't have a sensible one-to-one mapping onto a
  // recurring booking spanning many visits over a date range.
  const recurringCardsVisible = activeOrPastRecurring.filter(recurring =>
    (bookingStatusFilter === 'all' || getRecurringDisplayStatus(recurring).key === bookingStatusFilter)
    && (bookingServiceTypeFilter === 'all' || recurring.service_type === bookingServiceTypeFilter)
    && matchesBookingSearch(recurring, bookingSearch)
  )
  const pageTitle = sourceScope === 'tasks' ? 'Tasks' : 'Bookings for Review'
  const pageSubtitle = sourceScope === 'tasks'
    ? 'Tasks created directly by managers and departments, outside customer bookings. AI recommends the best-matched staff — approve to confirm, or override the pick below.'
    : 'AI recommends the best-matched staff for each booking. Approve to confirm, or override the pick below.'

  // Shared row markup for both the One-time Bookings and Recurring Visits tables (see visibleBookings
  // split above) — same columns, same actions, just a different source list and page.
  const renderBookingRow = (booking, { showServiceIcon = true } = {}) => {
    const scheduleBadge = getScheduleBadge(booking)
    const ServiceIcon = serviceIcon(booking.service_type)
    const customerLabel = booking.source === 'manager'
      ? `${booking.guest_name || 'Walk-in'}`
      : booking.source === 'department'
        ? (booking.departments?.name ? `${booking.departments.name} dept.` : 'Department')
        : (booking.customer?.full_name || booking.customer?.email || 'Customer')
    return (
      <tr key={booking.id} className="transition hover:bg-gray-50">
        <td className="px-3 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            {showServiceIcon && (
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent-100 text-accent-600">
                <ServiceIcon className="h-3.5 w-3.5" />
              </span>
            )}
            <span className="truncate font-semibold text-gray-900">{booking.service_type}</span>
          </div>
        </td>
        <td className="px-3 py-2.5 text-gray-600"><span className="block truncate">{customerLabel}</span></td>
        <td className="px-3 py-2.5 text-gray-600"><span className="block truncate">{booking.location}</span></td>
        {sourceScope === 'tasks' && (
          <td className="px-3 py-2.5">
            <span className={`inline-flex text-xs px-2 py-1 rounded-full font-medium ${getSourceMeta(booking.source).badge}`}>
              {getSourceMeta(booking.source).label}
            </span>
          </td>
        )}
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
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div>
            <h1 className="text-2xl font-bold">{pageTitle}</h1>
            <p className="text-gray-500 mt-1">{pageSubtitle}</p>
          </div>
        </div>
      </div>
      <div className="mt-4 mb-6 flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={bookingSearch}
            onChange={e => setBookingSearch(e.target.value)}
            placeholder="Search bookings..."
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#003152]"
          />
        </div>
        <div className="inline-flex flex-wrap overflow-hidden rounded-lg border border-gray-200">
          {statusFilters.map(option => (
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
            <div className="absolute right-0 mt-1 w-64 bg-white border rounded-lg shadow-lg z-10 overflow-hidden">
              {/* When/Source dropped for the customer scope (this page): "When" duplicated the new
                  Scheduled date range below, and "Source" only ever offered All/AI Recommended here
                  (customer bookings are always AI-matched), so both were mostly showing "0" counts
                  and adding noise. Tasks scope still uses both — its Source options (Manager
                  Created/Department Requests/AI Recommended) are meaningfully different per row. */}
              {sourceScope === 'tasks' && (
                <>
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
                  {sourceFilters.map(tab => (
                    <button
                      key={tab.value}
                      type="button"
                      onClick={() => { setSourceFilter(tab.value); setBookingFiltersOpen(false) }}
                      className={`flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-gray-50 ${sourceFilter === tab.value ? 'text-accent-600 font-medium' : 'text-gray-700'}`}
                    >
                      {tab.label} <span className="text-xs text-gray-400">{sourceFilterCounts[tab.value]}</span>
                    </button>
                  ))}
                </>
              )}
              <p className={`${sourceScope === 'tasks' ? 'border-t ' : ''}px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400`}>Service Type</p>
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
              <div className="border-t px-3 pt-2 pb-3">
                <p className="pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Scheduled date</p>
                <div className="space-y-2">
                  <div>
                    <label className="block text-[11px] text-gray-400 mb-1">From</label>
                    <input type="date" value={bookingDateFrom} onChange={e => setBookingDateFrom(e.target.value)} className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-accent-500" />
                  </div>
                  <div>
                    <label className="block text-[11px] text-gray-400 mb-1">To</label>
                    <input type="date" value={bookingDateTo} onChange={e => setBookingDateTo(e.target.value)} className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-accent-500" />
                  </div>
                </div>
                {(bookingDateFrom || bookingDateTo) && (
                  <button type="button" onClick={() => { setBookingDateFrom(''); setBookingDateTo('') }} className="mt-2 text-xs font-medium text-accent-600 hover:underline">
                    Clear dates
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {notification && <div className="mb-4 p-3 bg-green-50 text-green-700 rounded-lg flex items-center gap-2"><Bell className="w-4 h-4" />{notification}</div>}

      {pendingRecurring.length > 0 && (
        <div className="mb-6 bg-white rounded-xl shadow-sm border border-purple-100 overflow-hidden">
          <div className="p-4 border-b bg-purple-50 flex items-center gap-2">
            <Repeat className="w-4 h-4 text-purple-600" />
            <h2 className="font-semibold text-purple-900">Recurring Booking Requests ({pendingRecurring.length})</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {pendingRecurring.map(recurring => (
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

      {sourceScope === 'customer' && activeOrPastRecurring.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Repeat className="w-4 h-4 text-gray-500" />
            <h2 className="font-semibold text-gray-800">Recurring Bookings ({recurringCardsVisible.length})</h2>
          </div>
          {recurringCardsVisible.length === 0 && (
            <div className="rounded-xl border border-gray-100 bg-white p-8 text-center text-gray-400">No recurring bookings match these filters.</div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {recurringCardsVisible.map(recurring => {
              const theme = getRecurringTheme(recurring.service_type)
              const customerName = recurring.customer?.full_name || recurring.customer?.email || 'Customer'
              const displayStatus = getRecurringDisplayStatus(recurring)
              const visitCounts = recurringVisitCounts.get(recurring.id)
              const hasVisitsAwaitingReview = (visitCounts?.pending || 0) > 0
              const hasAnyVisit = !!visitCounts && Object.values(visitCounts).reduce((sum, n) => sum + n, 0) > 0
              const buttonLabel = hasAnyVisit && !hasVisitsAwaitingReview ? 'Reassign Staff' : 'Review Staff'
              return (
                <div key={recurring.id} className="flex h-full flex-col rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="truncate font-semibold text-gray-900 min-w-0">{recurring.service_type}</h3>
                    <span className={`shrink-0 text-xs px-2 py-1 rounded-full font-medium ${displayStatus.color}`}>
                      {displayStatus.label}
                    </span>
                  </div>

                  <div className="mt-3 space-y-1.5 text-sm text-gray-500">
                    <p className="flex items-start gap-1.5"><MapPin className="h-4 w-4 shrink-0 mt-0.5" /><span>{recurring.location}</span></p>
                    <p className="flex items-center gap-1.5"><Phone className="h-4 w-4 shrink-0" />{customerName}{recurring.customer?.phone ? ` · ${recurring.customer.phone}` : ''}</p>
                  </div>

                  <div className={`mt-3 space-y-0.5 text-sm font-medium ${theme.accent}`}>
                    <p className="flex items-center gap-1.5"><Calendar className="h-4 w-4 shrink-0" />{recurring.start_date} – {recurring.end_date}</p>
                    <p className="pl-[22px]">
                      {formatDaysOfWeek(recurring.days_of_week)}{recurring.scheduled_time ? ` · ${formatTime(recurring.scheduled_time)}` : ''} · {recurring.staff_count || 1} cleaner{(recurring.staff_count || 1) === 1 ? '' : 's'}/visit
                    </p>
                  </div>

                  {recurring.description && (
                    <p className="mt-3 text-sm text-gray-600"><span className="font-medium text-gray-700">Description:</span> {recurring.description}</p>
                  )}
                  {recurring.status === 'rejected' && recurring.rejection_reason && (
                    <p className="mt-3 text-xs text-red-600">Reason: {recurring.rejection_reason}</p>
                  )}

                  {recurring.status === 'active' && (
                    <button
                      type="button"
                      onClick={() => handleBuildScheduleForActive(recurring)}
                      disabled={recurringActionId === recurring.id}
                      className={`mt-4 flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition disabled:opacity-50 ${theme.btn}`}
                    >
                      {recurringActionId === recurring.id ? 'Checking...' : buttonLabel} <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {sourceScope === 'customer' && recurringVisible.length > 0 && (
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">One-time Bookings</h2>
      )}
      <div>
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full table-fixed text-sm">
              <colgroup>
                <col className="w-[18%]" />
                <col className="w-[14%]" />
                <col className="w-[14%]" />
                {sourceScope === 'tasks' && <col className="w-[11%]" />}
                <col className={sourceScope === 'tasks' ? 'w-[14%]' : 'w-[16%]'} />
                <col className={sourceScope === 'tasks' ? 'w-[12%]' : 'w-[13%]'} />
                <col className={sourceScope === 'tasks' ? 'w-[9%]' : 'w-[11%]'} />
                <col className={sourceScope === 'tasks' ? 'w-[8%]' : 'w-[10%]'} />
              </colgroup>
              <thead>
                <tr className="border-b bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <th className="px-3 py-2.5">Service</th>
                  <th className="px-3 py-2.5">Customer</th>
                  <th className="px-3 py-2.5">Location</th>
                  {sourceScope === 'tasks' && <th className="px-3 py-2.5">Source</th>}
                  <th className="px-3 py-2.5">Assignee</th>
                  <th className="px-3 py-2.5">Date</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pageBookings.map(booking => renderBookingRow(booking))}
              </tbody>
            </table>
          </div>
          {oneTimeVisible.length === 0 && (
            <div className="p-8 text-center text-gray-400">
              {bookings.length === 0 ? 'No bookings found.' : 'No bookings match these filters.'}
            </div>
          )}
          {oneTimeVisible.length > 0 && (
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

      {sourceScope === 'customer' && recurringVisible.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Recurring Visits</h2>
          <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full table-fixed text-sm">
                <colgroup>
                  <col className="w-[18%]" />
                  <col className="w-[14%]" />
                  <col className="w-[14%]" />
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
                  {recurringPageBookings.map(booking => renderBookingRow(booking, { showServiceIcon: false }))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t px-4 py-3">
              <span className="text-xs text-gray-500">Page {recurringSafePage} of {recurringTotalPages}</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setRecurringVisitsPage(p => Math.max(1, p - 1))}
                  disabled={recurringSafePage <= 1}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Prev
                </button>
                <button
                  type="button"
                  onClick={() => setRecurringVisitsPage(p => Math.min(recurringTotalPages, p + 1))}
                  disabled={recurringSafePage >= recurringTotalPages}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {detailBookingId && (() => {
        const booking = bookings.find(b => b.id === detailBookingId)
        if (!booking) return null
        const scheduleBadge = getScheduleBadge(booking)
        const closeDrawer = () => { setDetailBookingId(null); setReassigningId(null); setDeletingId(null) }
        return (
          <>
            <div className="fixed inset-0 z-40 bg-gray-900/40" onClick={closeDrawer} />
            <div className="fixed right-0 top-0 bottom-0 z-[60] flex w-full max-w-[420px] flex-col bg-white shadow-lg">
              <div className="flex items-center justify-between border-b p-5">
                <h4 className="font-semibold text-gray-900">{sourceScope === 'tasks' ? 'Task detail' : 'Booking detail'}</h4>
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
                {booking.requested_staff_name && (
                  <div className="flex items-start gap-2 rounded-lg border border-accent-200 bg-accent-100 px-3 py-2">
                    <Sparkles className="w-4 h-4 mt-0.5 shrink-0 text-accent-600" />
                    <p className="text-sm text-accent-800">
                      Customer requested: <span className="font-medium">{booking.requested_staff_name}</span>
                      <span className="block text-xs text-accent-600 font-normal">Subject to their availability — the allocation engine already weighs this request.</span>
                    </p>
                  </div>
                )}
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

                {!['rejected', 'completed'].includes(booking.status) && (
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

      {recurringProposal && (() => {
        const needsApprovalCount = recurringProposal.rows.filter(row => !row.already_assigned && row.recommended_staff_id).length
        const unmatchedCount = recurringProposal.rows.filter(row => !row.already_assigned && !row.recommended_staff_id).length
        const alreadyScheduledCount = recurringProposal.rows.filter(row => row.already_assigned).length
        const nothingLeftToApprove = needsApprovalCount === 0
        return (
          <>
            <div className="fixed inset-0 z-40 bg-gray-900/40" onClick={() => setRecurringProposal(null)} />
            <div className="fixed right-0 top-0 bottom-0 z-[60] flex w-full max-w-[420px] flex-col bg-white shadow-lg">
              <div className="flex items-center justify-between border-b p-5">
                <div>
                  <h4 className="font-semibold text-gray-900 flex items-center gap-1.5"><Sparkles className="w-4 h-4 text-purple-600" /> AI Recommendations</h4>
                  <p className="text-xs text-gray-500 mt-0.5">{recurringProposal.serviceType} · {recurringProposal.rows.length} upcoming visit{recurringProposal.rows.length === 1 ? '' : 's'}</p>
                </div>
                <button type="button" onClick={() => setRecurringProposal(null)} aria-label="Close" className="text-gray-400 hover:text-gray-600">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-5 space-y-3">
                {recurringProposal.rows.map(row => (
                  <div key={row.booking_id} className="rounded-lg border border-gray-100 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-gray-800">{new Date(`${row.scheduled_date}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}{row.scheduled_time ? ` · ${formatTime(row.scheduled_time)}` : ''}</p>
                      {row.already_assigned && (
                        <button
                          type="button"
                          onClick={() => { setDetailBookingId(row.booking_id); setRecurringProposal(null) }}
                          className="shrink-0 text-xs font-medium text-accent-600 hover:underline"
                        >
                          Reassign
                        </button>
                      )}
                    </div>
                    {row.recommended_staff_name ? (
                      <p className="mt-1 flex items-center gap-1.5 text-sm text-accent-700">
                        <UserCheck className="w-3.5 h-3.5 shrink-0" /> {row.recommended_staff_name}
                      </p>
                    ) : (
                      <p className="mt-1 text-sm text-amber-600">No suitable staff found — needs manual assignment</p>
                    )}
                    {row.reason && <p className="mt-0.5 text-xs text-gray-400">{row.reason}</p>}
                  </div>
                ))}
              </div>
              <div className="border-t p-5 space-y-2">
                {unmatchedCount > 0 && (
                  <p className="text-xs text-amber-600">{unmatchedCount} visit{unmatchedCount === 1 ? '' : 's'} need manual assignment in the table below.</p>
                )}
                {nothingLeftToApprove && alreadyScheduledCount > 0 && (
                  <p className="text-xs text-gray-500">All {alreadyScheduledCount} visit{alreadyScheduledCount === 1 ? '' : 's'} already {alreadyScheduledCount === 1 ? 'has' : 'have'} staff assigned. Click &ldquo;Reassign&rdquo; on a visit above to change it.</p>
                )}
                <div className="flex gap-2">
                  {!nothingLeftToApprove && (
                    <button
                      type="button"
                      onClick={handleApproveAllRecommended}
                      disabled={approvingProposal}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-green-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-green-600 disabled:opacity-50"
                    >
                      <CheckCircle className="w-4 h-4" /> {approvingProposal ? 'Approving...' : `Approve All (${needsApprovalCount})`}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setRecurringProposal(null)}
                    className={`rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 ${nothingLeftToApprove ? 'flex-1' : ''}`}
                  >
                    {nothingLeftToApprove ? 'Close' : 'Later'}
                  </button>
                </div>
              </div>
            </div>
          </>
        )
      })()}
    </div>
  )
}
