import Layout from '../../../components/Layout'
import { useEffect, useState } from 'react'
import { CheckCircle, XCircle, Bell, GripVertical, MapPin, Star, UserCheck, Calendar, Sparkles, ListChecks, Move } from 'lucide-react'
import { supabase } from '../../../../lib/supabaseClient'
import { assignStaffToBooking } from '../../../../lib/assignBooking'

const statusColor = {
  pending: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
}

const staffStatusColor = {
  Available: 'bg-green-100 text-green-700',
  Busy: 'bg-blue-100 text-blue-700',
  'On Leave': 'bg-gray-100 text-gray-600',
}

const dateToneColor = {
  overdue: 'bg-red-50 text-red-700',
  today: 'bg-orange-50 text-orange-700',
  tomorrow: 'bg-blue-50 text-blue-700',
  upcoming: 'bg-gray-100 text-gray-600',
  none: 'bg-gray-100 text-gray-400',
}

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

export default function ManagerBookings() {
  const [bookings, setBookings] = useState([])
  const [staffRows, setStaffRows] = useState([])
  const [notification, setNotification] = useState(null)
  const [draggedStaffId, setDraggedStaffId] = useState(null)
  const [dropTargetId, setDropTargetId] = useState(null)
  const [assigningBookingId, setAssigningBookingId] = useState(null)
  const [selectedStaffId, setSelectedStaffId] = useState({})
  const [reassigningId, setReassigningId] = useState(null)

  const loadBookings = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: managerProfile } = await supabase
      .from('profiles')
      .select('host_admin_id')
      .eq('id', user?.id)
      .single()

    const hostAdminId = managerProfile?.host_admin_id
    if (!hostAdminId) {
      setBookings([])
      setStaffRows([])
      return
    }

    const [{ data: bookingRows }, { data: staff }] = await Promise.all([
      supabase
        .from('bookings')
        .select('id,customer_id,service_type,location,description,notes,scheduled_date,scheduled_time,status,created_at,assigned_staff_id,recommendation_reason,customer:profiles!bookings_customer_id_fkey(full_name,email),staff_profiles(staff_name)')
        .eq('host_admin_id', hostAdminId)
        .in('status', ['pending', 'approved', 'rejected'])
        .order('created_at', { ascending: false }),
      supabase
        .from('staff_profiles')
        .select('id,user_id,staff_name,skills,availability,current_workload,performance_rating,status,is_suspended')
        .eq('host_admin_id', hostAdminId)
        .eq('status', 'active')
        .order('staff_name'),
    ])

    setBookings(bookingRows || [])
    setStaffRows((staff || []).map(row => ({
      id: row.id,
      userId: row.user_id,
      name: row.staff_name,
      role: row.skills?.[0] || 'Staff Member',
      status: row.is_suspended ? 'On Leave' : row.availability === 'available' ? 'Available' : 'Busy',
      canAssign: !row.is_suspended && row.status === 'active' && row.availability === 'available',
      tasks: row.current_workload || 0,
      rating: row.performance_rating || 0,
    })))
  }

  useEffect(() => {
    loadBookings()
  }, [])

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

    if (managerProfile?.role !== 'manager' || managerProfile?.status !== 'active') {
      showNotification('Only an active manager can approve, reject, or assign bookings.')
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

  const handleStaffDragStart = (event, staff) => {
    if (!staff.canAssign) return
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', staff.id)
    setDraggedStaffId(staff.id)
  }

  const handleBookingDragOver = (event, booking) => {
    if (booking.status === 'rejected') return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setDropTargetId(booking.id)
  }

  const performAssignment = async (booking, staffId, action) => {
    const staff = staffRows.find(item => item.id === staffId)
    if (!staff || booking.status === 'rejected') return
    if (!staff.canAssign) {
      showNotification(`${staff.name} is not available for assignment.`)
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

  const handleAssignStaff = async (event, booking) => {
    event.preventDefault()
    setDropTargetId(null)
    const staffId = event.dataTransfer.getData('text/plain') || draggedStaffId
    setDraggedStaffId(null)
    await performAssignment(booking, staffId, 'assign_booking_drag_drop')
  }

  const handleManualAssign = async (booking) => {
    const staffId = selectedStaffId[booking.id]
    if (!staffId) return
    await performAssignment(booking, staffId, 'assign_booking_manual')
    setSelectedStaffId(prev => ({ ...prev, [booking.id]: '' }))
    setReassigningId(null)
  }

  const statusLabel = (status) => status.replace('_', ' ').replace(/^\w/, c => c.toUpperCase())

  return (
    <Layout role="manager">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold">Bookings for Review</h1>
        <p className="text-gray-500 mt-1">AI recommends the best-matched staff for each booking. Approve to confirm, or override the pick below.</p>
        <div className="mt-3 mb-6 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
            <ListChecks className="w-3.5 h-3.5" /> Select staff from the dropdown
          </span>
          <span className="text-xs text-gray-400">or</span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
            <Move className="w-3.5 h-3.5" /> Drag a staff member onto a booking
          </span>
        </div>
        {notification && <div className="mb-4 p-3 bg-green-50 text-green-700 rounded-lg flex items-center gap-2"><Bell className="w-4 h-4" />{notification}</div>}

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-6">
          <div className="space-y-4">
            {bookings.map(booking => {
              const scheduleBadge = getScheduleBadge(booking)
              return (
              <div
                key={booking.id}
                onDragOver={(event) => handleBookingDragOver(event, booking)}
                onDragLeave={() => setDropTargetId(null)}
                onDrop={(event) => handleAssignStaff(event, booking)}
                className={`bg-white rounded-xl shadow-sm border p-5 transition ${booking.status !== 'rejected' ? 'hover:bg-blue-50' : ''} ${dropTargetId === booking.id ? 'bg-blue-50 ring-2 ring-inset ring-blue-300' : ''}`}
              >
                <div className="flex justify-between items-start gap-4">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-gray-900">{booking.service_type}</h3>
                    <p className="text-sm text-gray-500 flex items-center gap-1 mt-1"><MapPin className="w-4 h-4" />{booking.location}</p>
                    <p className="text-xs text-gray-400 mt-2">Requested by {booking.customer?.full_name || booking.customer?.email || 'Customer'} on {new Date(booking.created_at).toLocaleDateString()}</p>
                    {booking.status === 'pending' && booking.staff_profiles?.staff_name ? (
                      <p className="text-sm text-indigo-700 mt-2 flex items-start gap-1">
                        <Sparkles className="w-4 h-4 mt-0.5 shrink-0" />
                        <span>
                          AI Recommended: <span className="font-medium">{booking.staff_profiles.staff_name}</span>
                          {booking.recommendation_reason && <span className="block text-xs text-indigo-400 font-normal">{booking.recommendation_reason}</span>}
                        </span>
                      </p>
                    ) : (
                      <p className="text-sm text-gray-600 mt-2 flex items-center gap-1"><UserCheck className="w-4 h-4" />Assigned staff: {booking.staff_profiles?.staff_name || 'Unassigned'}</p>
                    )}
                    {booking.description && (
                      <p className="text-sm text-gray-600 mt-2"><span className="font-medium text-gray-700">Description:</span> {booking.description}</p>
                    )}
                    {booking.notes && (
                      <p className="text-sm text-gray-600 mt-1"><span className="font-medium text-gray-700">Notes:</span> {booking.notes}</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColor[booking.status] || 'bg-gray-100 text-gray-600'}`}>
                      {assigningBookingId === booking.id ? 'Assigning...' : statusLabel(booking.status)}
                    </span>
                    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${dateToneColor[scheduleBadge.tone]}`}>
                      <Calendar className="w-3.5 h-3.5" />{scheduleBadge.label}
                    </span>
                  </div>
                </div>
                {booking.status !== 'rejected' && (
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex gap-2">
                      {booking.status === 'pending' && (
                        <>
                          <button
                            onClick={() => handleReview(booking.id, 'Approved')}
                            className="flex items-center gap-1.5 rounded-lg bg-green-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-green-600 hover:shadow-md active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-green-300 focus:ring-offset-1"
                          >
                            <CheckCircle className="w-4 h-4" /> Approve
                          </button>
                          <button
                            onClick={() => handleReview(booking.id, 'Rejected')}
                            className="flex items-center gap-1.5 rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-red-600 hover:shadow-md active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-red-300 focus:ring-offset-1"
                          >
                            <XCircle className="w-4 h-4" /> Reject
                          </button>
                        </>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setReassigningId(prev => prev === booking.id ? null : booking.id)}
                      className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                    >
                      <UserCheck className="w-4 h-4" />
                      {reassigningId === booking.id ? 'Cancel' : booking.status === 'pending' ? 'Choose different staff' : 'Reassign staff'}
                    </button>
                  </div>
                )}
                {reassigningId === booking.id && (
                  <div className="mt-3 rounded-lg border border-gray-100 bg-gray-50 p-3">
                    {booking.status === 'pending' && (
                      <p className="text-xs text-gray-500 mb-2">Assigning will also approve this booking.</p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <select
                        value={selectedStaffId[booking.id] || ''}
                        onChange={(event) => setSelectedStaffId(prev => ({ ...prev, [booking.id]: event.target.value }))}
                        className="min-w-[180px] flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
                      >
                        <option value="">Choose staff...</option>
                        {staffRows.map(staff => (
                          <option key={staff.id} value={staff.id} disabled={!staff.canAssign}>
                            {staff.name}{staff.canAssign ? '' : ` (${staff.status})`}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => handleManualAssign(booking)}
                        disabled={!selectedStaffId[booking.id] || assigningBookingId === booking.id}
                        className="flex items-center gap-1 px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                      >
                        <UserCheck className="w-4 h-4" /> {booking.status === 'pending' ? 'Assign & Approve' : 'Confirm'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
              )
            })}
            {bookings.length === 0 && <div className="bg-white rounded-xl border p-8 text-center text-gray-400">No bookings found.</div>}
          </div>

          <div className="bg-white rounded-xl shadow-sm border h-fit overflow-hidden">
            <div className="p-5 border-b">
              <h2 className="font-semibold text-gray-900">Available Staff</h2>
              <p className="text-sm text-gray-500 mt-1">Drag a staff member onto a booking.</p>
            </div>
            <div className="divide-y divide-gray-50 max-h-[70vh] overflow-y-auto">
              {staffRows.map(staff => (
                <div
                  key={staff.id}
                  draggable={staff.canAssign}
                  onDragStart={(event) => handleStaffDragStart(event, staff)}
                  onDragEnd={() => {
                    setDraggedStaffId(null)
                    setDropTargetId(null)
                  }}
                  className={`p-4 transition ${staff.canAssign ? 'cursor-grab hover:bg-gray-50 active:cursor-grabbing' : 'cursor-not-allowed opacity-70'} ${draggedStaffId === staff.id ? 'bg-blue-50' : ''}`}
                  title={staff.canAssign ? 'Drag this staff member onto a booking' : 'Only available active staff can be assigned'}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-green-400 rounded-full flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
                      {staff.name.split(' ').map(part => part[0]).join('').slice(0, 2)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-800 truncate">{staff.name}</p>
                      <p className="text-xs text-gray-500 truncate">{staff.role} - {staff.tasks} active tasks</p>
                    </div>
                    {staff.canAssign && <GripVertical className="h-4 w-4 text-gray-300" />}
                    <div className="flex flex-col items-end gap-1">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${staffStatusColor[staff.status]}`}>{staff.status}</span>
                      <span className="text-xs text-yellow-500 flex items-center gap-0.5"><Star className="w-3 h-3 fill-yellow-400" />{staff.rating}</span>
                    </div>
                  </div>
                </div>
              ))}
              {staffRows.length === 0 && <div className="p-8 text-center text-gray-400">No active staff found.</div>}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  )
}
