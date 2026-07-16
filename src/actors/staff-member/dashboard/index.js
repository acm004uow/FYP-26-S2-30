import Layout from '../../../components/Layout'
import { useEffect, useMemo, useState } from 'react'
import { MapPin, Clock, CheckCircle, Star, X, Eye, Bell, ChevronRight, Calendar, FileUp, AlertCircle } from 'lucide-react'
import { supabase } from '../../../../lib/supabaseClient'
import { formatBookingAsTask, getTaskAssignedDate, isSameLocalDay, isTaskAssignedToday, isTaskPastDue, statusColor } from '../../../../lib/staffTasks'
import { getAttendanceStatusFromDateTime } from '../../../../lib/attendance'
import { CHECK_IN_RADIUS_METERS, getCurrentPosition, getDistanceMeters } from '../../../../lib/geolocation'

const getTaskDisplayStatus = (task) => {
  if (task.rawStatus === 'overdue' || isTaskPastDue(task)) {
    return 'Overdue'
  }

  return task.status
}

const availabilityOptions = [
  { value: 'available', label: 'Available' },
  { value: 'unavailable', label: 'Unavailable' },
  { value: 'time_off', label: 'Time-off' },
]

const availabilityLabels = {
  available: 'Available',
  unavailable: 'Unavailable',
  time_off: 'Time-off',
}

const availabilityDot = {
  available: 'bg-green-300',
  unavailable: 'bg-red-300',
  time_off: 'bg-gray-300',
}

export default function StaffMemberDashboard() {
  const [availability, setAvailability] = useState('available')
  const [profile, setProfile] = useState(null)
  const [myTasks, setMyTasks] = useState([])
  const [completedTasks, setCompletedTasks] = useState([])
  const [selectedTask, setSelectedTask] = useState(null)
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(new Date())
  const [selectedCalendarTask, setSelectedCalendarTask] = useState(null)
  const [activeTab, setActiveTab] = useState('active')
  const [calendarDate, setCalendarDate] = useState(new Date())
  const [showProofModal, setShowProofModal] = useState(false)
  const [proofTask, setProofTask] = useState(null)
  const [proofFile, setProofFile] = useState(null)
  const [proofError, setProofError] = useState('')
  const [notification, setNotification] = useState(null)
  const [uploadingProof, setUploadingProof] = useState(false)
  const [dismissedOverdueAlert, setDismissedOverdueAlert] = useState(false)
  const [checkingInTaskId, setCheckingInTaskId] = useState(null)
  const [checkInErrorTaskId, setCheckInErrorTaskId] = useState(null)
  const [checkInError, setCheckInError] = useState('')

  const loadDashboard = async () => {
    const { data: { user } } = await supabase.auth.getUser()

    const { data: staffProfile } = await supabase
      .from('staff_profiles')
      .select('*')
      .eq('user_id', user?.id)
      .single()

    setProfile(staffProfile)
    if (!staffProfile) return

    setAvailability(staffProfile.availability || 'available')

    const { data: bookings } = await supabase
      .from('bookings')
      .select('id,created_at,service_type,location,scheduled_date,scheduled_time,estimated_hours,status,description,notes,customer_id,checked_in_at,checked_out_at,latitude,longitude,customer:profiles!bookings_customer_id_fkey(full_name,email,phone),performance_reviews(rating,feedback),task_proofs(file_url,file_name,created_at)')
      .eq('assigned_staff_id', staffProfile.id)
      .neq('status', 'pending')
      .order('created_at', { ascending: false })

    const rows = (bookings || []).map(formatBookingAsTask)

    setMyTasks(rows.filter(task => task.status !== 'Completed'))
    setCompletedTasks(rows.filter(task => task.status === 'Completed'))
  }

  useEffect(() => {
    let bookingChannel = null

    async function initDashboard() {
      await loadDashboard()

      const { data: { user } } = await supabase.auth.getUser()

      const { data: staffProfile } = await supabase
        .from('staff_profiles')
        .select('id')
        .eq('user_id', user?.id)
        .single()

      if (!staffProfile?.id) return

      bookingChannel = supabase
        .channel(`staff-assigned-bookings-${staffProfile.id}-${Date.now()}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'bookings',
            filter: `assigned_staff_id=eq.${staffProfile.id}`,
          },
          (payload) => {
            if (['INSERT', 'UPDATE'].includes(payload.eventType) && payload.new?.status === 'approved') {
              setNotification(`New booking assignment: ${payload.new.service_type}`)
              setTimeout(() => setNotification(null), 3000)
            }

            loadDashboard()
          }
        )
        .subscribe()
    }

    initDashboard()

    return () => {
      if (bookingChannel) supabase.removeChannel(bookingChannel)
    }
  }, [])

  const handleStartTask = async (taskId) => {
    const task = myTasks.find(item => item.id === taskId)
    setCheckInError('')
    setCheckInErrorTaskId(null)

    if (!task || !isTaskAssignedToday(task)) {
      setCheckInError('You can only start this task on its assigned day.')
      setCheckInErrorTaskId(taskId)
      return
    }

    // Only enforce proximity when the booking has stored coordinates — older bookings
    // created before geo-lookup was added have none, so they fall back to trusting the
    // check-in (can't verify what was never captured).
    if (Number.isFinite(task.latitude) && Number.isFinite(task.longitude)) {
      setCheckingInTaskId(taskId)
      let position
      try {
        position = await getCurrentPosition()
      } catch (error) {
        setCheckingInTaskId(null)
        setCheckInError(error.message)
        setCheckInErrorTaskId(taskId)
        return
      }

      const distance = getDistanceMeters(position.latitude, position.longitude, task.latitude, task.longitude)
      setCheckingInTaskId(null)
      if (distance > CHECK_IN_RADIUS_METERS) {
        setCheckInError(`You're ${Math.round(distance)}m from the job site — get within ${CHECK_IN_RADIUS_METERS}m to check in.`)
        setCheckInErrorTaskId(taskId)
        return
      }
    }

    const checkInAt = new Date()
    const attendanceStatus = getAttendanceStatusFromDateTime(task.scheduledStartRaw, checkInAt)

    const { error: checkInUpdateError } = await supabase
      .from('bookings')
      .update({ status: 'in_progress', checked_in_at: checkInAt.toISOString(), attendance_status: attendanceStatus, updated_at: checkInAt.toISOString() })
      .eq('id', taskId)

    if (checkInUpdateError) {
      setCheckInError(checkInUpdateError.message || 'Could not check in. Please try again.')
      setCheckInErrorTaskId(taskId)
      return
    }

    await supabase.from('audit_logs').insert({
      action: 'start_booking',
      details: `Booking ${taskId}`,
    })

    await loadDashboard()

    setNotification(attendanceStatus === 'late' ? "Task started — you're outside the customer's preferred check-in window." : 'Task started.')
    setTimeout(() => setNotification(null), 3000)
  }

  const handleCompleteTask = (taskId) => {
    setProofTask(myTasks.find(t => t.id === taskId))
    setProofFile(null)
    setProofError('')
    setShowProofModal(true)
  }

  const handleUploadProof = async () => {
    if (!proofTask || uploadingProof) return

    if (!profile?.id) {
      setProofError('Staff profile is still loading. Please try again in a moment.')
      return
    }

    setProofError('')
    setUploadingProof(true)

    try {
      let proofUrl = null
      let proofName = null

      if (proofFile) {
        const safeName = proofFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')
        const path = `${profile.id}/${proofTask.id}-${Date.now()}-${safeName}`

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('task-proofs')
          .upload(path, proofFile, { upsert: false })

        if (uploadError) throw uploadError

        const { data: publicUrlData } = supabase.storage
          .from('task-proofs')
          .getPublicUrl(uploadData.path)

        proofUrl = publicUrlData?.publicUrl
        proofName = proofFile.name
      }

      if (proofUrl) {
        const { error: proofInsertError } = await supabase
          .from('task_proofs')
          .insert({
            booking_id: proofTask.id,
            staff_id: profile.id,
            file_url: proofUrl,
            file_name: proofName,
          })

        if (proofInsertError) throw proofInsertError
      }

      const { error: taskError } = await supabase
        .from('bookings')
        .update({ status: 'completed', checked_out_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', proofTask.id)
        .eq('assigned_staff_id', profile.id)

      if (taskError) throw taskError

      const { error: workloadError } = await supabase
        .from('staff_profiles')
        .update({
          current_workload: Math.max(0, Number(profile.current_workload || 0) - 1),
          updated_at: new Date().toISOString(),
        })
        .eq('id', profile.id)

      if (workloadError) throw workloadError

      const { data: managers } = await supabase
        .from('profiles')
        .select('id')
        .eq('role', 'manager')
        .eq('status', 'active')

      const completionNotifications = (managers || []).map(manager => ({
        user_id: manager.id,
        title: 'Booking completed',
        message: `${profile.staff_name || 'A staff member'} completed ${proofTask.title}.`,
      }))

      if (completionNotifications.length) {
        await supabase.from('notifications').insert(completionNotifications)
      }

      if (proofTask.customerId) {
        await supabase.from('notifications').insert({
          user_id: proofTask.customerId,
          title: 'Booking completed',
          message: `${profile.staff_name || 'Your assigned staff'} completed your ${proofTask.title} booking.`,
        })
      }

      await supabase.from('audit_logs').insert({
        action: 'complete_booking',
        details: `Booking ${proofTask.id}`,
      })

      await loadDashboard()

      setShowProofModal(false)
      setProofTask(null)
      setProofFile(null)
      setNotification('Booking completed.')
      setTimeout(() => setNotification(null), 2000)
    } catch (error) {
      setProofError(error.message || 'This could not be completed. Please try again.')
    } finally {
      setUploadingProof(false)
    }
  }

  const updateAvailability = async (next) => {
    if (profile) {
      await supabase
        .from('staff_profiles')
        .update({ availability: next, updated_at: new Date().toISOString() })
        .eq('id', profile.id)

      const { data: managers } = await supabase
        .from('profiles')
        .select('id')
        .eq('role', 'manager')
        .eq('status', 'active')

      const nextLabel = availabilityLabels[next]?.toLowerCase() || next

      const notifications = (managers || []).map(manager => ({
        user_id: manager.id,
        title: 'Staff availability changed',
        message: `${profile.staff_name || 'A staff member'} is now ${nextLabel}.`,
      }))

      if (notifications.length) {
        await supabase.from('notifications').insert(notifications)
      }

      await supabase.from('audit_logs').insert({
        action: 'update_availability',
        details: `${profile.staff_name || profile.id} set ${nextLabel}`,
      })
    }

    setAvailability(next)
    setNotification(`Availability updated to ${availabilityLabels[next] || next}.`)
    setTimeout(() => setNotification(null), 2000)
  }

  const avgRating = completedTasks.length
    ? (completedTasks.reduce((sum, task) => sum + Number(task.rating || 0), 0) / completedTasks.length).toFixed(1)
    : Number(profile?.performance_rating || 0).toFixed(1)

  // Today's tasks stay visible (and actionable) here even once past due — a job scheduled
  // for today shouldn't disappear from "Today Tasks" just because its time has passed; it
  // still shows an "Overdue" badge and also appears in the dedicated Overdue tab.
  const todayTasks = myTasks.filter((task) => isTaskAssignedToday(task))
  const otherActiveTasks = myTasks.filter((task) => !isTaskAssignedToday(task) && !isTaskPastDue(task))

  const allTasks = useMemo(() => {
    return [...myTasks, ...completedTasks]
  }, [myTasks, completedTasks])

  const overdueTasks = useMemo(() => {
    return allTasks.filter((task) => isTaskPastDue(task))
  }, [allTasks])

  const selectedCalendarTasks = useMemo(() => {
    return allTasks.filter((task) => {
      const assigned = getTaskAssignedDate(task)
      return assigned && isSameLocalDay(assigned, selectedCalendarDate)
    })
  }, [allTasks, selectedCalendarDate])

  useEffect(() => {
    if (selectedCalendarTasks.length === 0) {
      setSelectedCalendarTask(null)
      return
    }

    if (!selectedCalendarTasks.some(task => task.id === selectedCalendarTask?.id)) {
      setSelectedCalendarTask(selectedCalendarTasks[0])
    }
  }, [selectedCalendarTasks, selectedCalendarTask?.id])

  const daysInMonth = (year, month) => new Date(year, month + 1, 0).getDate()

  const firstDayOfMonth = (year, month) =>
    (new Date(year, month, 1).getDay() + 6) % 7

  const calendarWeeks = useMemo(() => {
    const year = calendarDate.getFullYear()
    const month = calendarDate.getMonth()
    const totalDays = daysInMonth(year, month)
    const firstDay = firstDayOfMonth(year, month)
    const weeks = []
    let currentDay = 1 - firstDay

    while (currentDay <= totalDays) {
      const week = []

      for (let i = 0; i < 7; i += 1) {
        const date = new Date(year, month, currentDay)

        const dayTasks = allTasks.filter((task) => {
          const assigned = getTaskAssignedDate(task)
          return assigned && isSameLocalDay(assigned, date)
        })

        week.push({ date, tasks: dayTasks })
        currentDay += 1
      }

      weeks.push(week)
    }

    return weeks
  }, [calendarDate, allTasks])

  const changeMonth = (delta) => {
    const next = new Date(calendarDate)
    next.setMonth(calendarDate.getMonth() + delta)
    setCalendarDate(next)
  }

  const renderTaskCard = (task) => {
    const canStartToday = isTaskAssignedToday(task)

    return (
      <div
        key={task.id}
        onClick={() => setSelectedTask(selectedTask?.id === task.id ? null : task)}
        className="bg-white rounded-xl shadow-sm border-l-4 border-l-teal-400 border border-gray-100 p-5 cursor-pointer hover:shadow-md transition"
      >
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[getTaskDisplayStatus(task)] || statusColor.Pending}`}>
                {getTaskDisplayStatus(task)}
              </span>

              {canStartToday && task.status !== 'In Progress' && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">
                  Today
                </span>
              )}
            </div>

            <h3 className="font-semibold text-gray-800 text-sm">{task.title}</h3>

            <div className="flex flex-wrap items-center gap-4 mt-2">
              <span className="text-xs text-gray-500 flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {task.location}
              </span>

              <span className="text-xs text-gray-500 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {task.due}
              </span>
            </div>
          </div>

          <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${selectedTask?.id === task.id ? 'rotate-90' : ''}`} />
        </div>

        {selectedTask?.id === task.id && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-sm text-gray-600 mb-3">{task.description}</p>

            <div className="grid gap-2 text-xs text-gray-500 sm:grid-cols-2">
              <p className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                Assigned day: {task.assignedDate}
              </p>

              <p className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                Due: {task.due}
              </p>

              <p>Requirement: {task.requiredSkill}</p>
            </div>

            <div className="my-3 rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
              <p className="font-medium text-gray-700">Instructions</p>
              <p className="mt-1">{task.instructions}</p>
            </div>

            {(task.checkedInAt || task.checkedOutAt) && (
              <div className="my-3 rounded-lg bg-blue-50 border border-blue-100 p-3 text-xs text-blue-700 space-y-1">
                {task.checkedInAt && <p>Checked in: {task.checkedInAt}</p>}
                {task.checkedOutAt && <p>Checked out: {task.checkedOutAt}</p>}
              </div>
            )}

            <p className="text-xs text-gray-500 mb-4">
              Assigned by: {task.supervisor}{task.customerPhone ? ` · ${task.customerPhone}` : ''}
            </p>

            {checkInErrorTaskId === task.id && checkInError && (
              <div className="mb-3 flex items-start gap-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-600">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{checkInError}</span>
              </div>
            )}

            <div className="flex gap-3">
              {['Pending', 'Approved'].includes(task.status) && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    handleStartTask(task.id)
                  }}
                  disabled={!canStartToday || checkingInTaskId === task.id}
                  title={canStartToday ? 'Check in and start this task' : 'This task can only be started on its assigned day'}
                  className="flex-1 py-2 bg-gradient-to-r from-blue-500 to-green-500 text-white rounded-lg text-sm font-medium disabled:cursor-not-allowed disabled:from-gray-300 disabled:to-gray-300 disabled:text-gray-500"
                >
                  {checkingInTaskId === task.id ? 'Checking location...' : canStartToday ? 'Check In' : 'Check In on Assigned Day'}
                </button>
              )}

              {task.status === 'In Progress' && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    handleCompleteTask(task.id)
                  }}
                  className="flex-1 py-2 bg-gradient-to-r from-green-500 to-teal-500 text-white rounded-lg text-sm font-medium"
                >
                  Check Out &amp; Complete
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <Layout role="staffMember">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {notification && (
          <div className="mb-4 p-3 bg-blue-50 text-blue-700 rounded-lg flex items-center gap-2 border-l-4 border-blue-500">
            <Bell className="w-4 h-4" />
            {notification}
          </div>
        )}

        <div className="bg-gradient-to-r from-blue-500 to-green-500 rounded-2xl p-6 text-white mb-6 shadow-lg">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-blue-100 text-sm">Good Morning,</p>
              <h1 className="text-2xl font-bold">
                {profile?.staff_name || 'Staff Member'}
              </h1>
              <p className="text-blue-100 text-sm mt-1">
                {profile?.skills?.[0] || 'Staff'} - {profile?.assigned_region || 'No region'}
              </p>
            </div>

            <div className="text-right">
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-2 h-2 rounded-full ${availabilityDot[availability] || 'bg-gray-300'}`} />
                <span className="text-sm font-medium">
                  {availabilityLabels[availability] || availability}
                </span>
              </div>

              <select
                value={availability}
                onChange={event => updateAvailability(event.target.value)}
                className="rounded-full border border-white/20 bg-white/20 px-3 py-1.5 text-xs text-white outline-none transition hover:bg-white/30"
              >
                {availabilityOptions.map(option => (
                  <option key={option.value} value={option.value} className="text-gray-800">
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 mt-6 pt-4 border-t border-white/20">
            <div className="text-center">
              <p className="text-2xl font-bold">{myTasks.length}</p>
              <p className="text-blue-100 text-xs">Active Tasks</p>
            </div>

            <div className="text-center">
              <p className="text-2xl font-bold">{completedTasks.length}</p>
              <p className="text-blue-100 text-xs">Completed</p>
            </div>

            <div className="text-center">
              <p className="text-2xl font-bold">{avgRating}</p>
              <p className="text-blue-100 text-xs flex items-center justify-center gap-1">
                <Star className="w-3 h-3 fill-yellow-300 text-yellow-300" />
                Rating
              </p>
            </div>
          </div>
        </div>

        {/* Calendar */}
        {overdueTasks.length > 0 && !dismissedOverdueAlert && (
          <div className="mb-6 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold">Overdue tasks alert</p>
                <p className="mt-1">You have {overdueTasks.length} overdue assigned task{overdueTasks.length === 1 ? '' : 's'}.</p>
              </div>
              <button
                onClick={() => setDismissedOverdueAlert(true)}
                className="flex-shrink-0 rounded-lg p-1 hover:bg-red-100 transition-colors"
                aria-label="Close alert"
              >
                <X size={18} className="text-red-700" />
              </button>
            </div>
          </div>
        )}
        <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-6 shadow-sm">
          <div className="flex items-start justify-between gap-3 mb-6">
            <div>
              <p className="text-xl font-semibold text-gray-900">
                Assigned tasks calendar
              </p>
              <p className="mt-6 text-sm font-semibold text-gray-900">
                {calendarDate.toLocaleDateString(undefined, {
                  month: 'long',
                  year: 'numeric',
                })}
              </p>
            </div>

            <div className="flex items-center gap-4">
              <button
                onClick={() => changeMonth(-1)}
                className="rounded-xl border border-gray-200 px-4 py-3 text-base text-gray-700 hover:bg-gray-50"
              >
                Prev
              </button>

              <button
                onClick={() => changeMonth(1)}
                className="rounded-xl border border-gray-200 px-4 py-3 text-base text-gray-700 hover:bg-gray-50"
              >
                Next
              </button>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-[520px_1fr] items-stretch h-[520px]">
            <div className="min-w-0 w-full h-[520px]">
              <div className="h-full flex flex-col rounded-3xl border border-gray-100 bg-white p-4">
                <div className="grid grid-cols-7 gap-3 text-center text-xs uppercase tracking-[0.06em] text-gray-500">
                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
                    <div key={day}>{day}</div>
                  ))}
                </div>
                <div className="space-y-3 mt-4 flex-1">
                  {calendarWeeks.map((week, weekIndex) => (
                    <div key={weekIndex} className="grid grid-cols-7 gap-2">
                      {week.map((day) => {
                        const isSelected = isSameLocalDay(day.date, selectedCalendarDate)
                        const isCurrentMonth = day.date.getMonth() === calendarDate.getMonth()
                        const hasTasks = day.tasks.length > 0
                        const isOverdue = day.tasks.some((task) => getTaskDisplayStatus(task) === 'Overdue')
                        const isAllCompleted = hasTasks && day.tasks.every((task) => task.rawStatus === 'completed')

                        return (
                          <button
                            key={day.date.toISOString()}
                            type="button"
                            onClick={() => {
                              setSelectedCalendarDate(day.date)
                              setSelectedCalendarTask(day.tasks[0] || null)
                            }}
                            className={`min-h-[15px] rounded-xl border p-2 text-center transition cursor-pointer
                              ${isCurrentMonth
                                ? isOverdue
                                  ? 'border-red-200 bg-red-50 text-red-700'
                                  : isAllCompleted
                                  ? 'border-green-200 bg-green-50 text-green-700'
                                  : hasTasks
                                  ? 'border-yellow-200 bg-yellow-50 text-yellow-700'
                                  : 'border-gray-200 bg-white text-gray-900'
                                : 'border-transparent bg-gray-50 text-gray-400'}
                              ${isSelected ? 'ring-2 ring-blue-300 shadow-sm' : 'hover:border-gray-300'}
                            `}
                          >
                            <div className={`text-sm font-medium ${isSameLocalDay(day.date, new Date()) ? 'text-blue-600' : isCurrentMonth ? 'text-gray-900' : 'text-gray-400'}`}>
                              {day.date.getDate()}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-4 w-full h-[520px] overflow-hidden">
              <div className="h-full flex flex-col">
                <div className="mb-4">
                  <p className="text-lg font-semibold text-gray-900">
                    Selected date <span className="font-normal text-sm text-gray-500">- {selectedCalendarDate.toLocaleDateString(undefined, {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}</span>
                  </p>
                </div>

                {selectedCalendarTasks.length === 0 ? (
                  <div className="min-h-[220px] rounded-2xl border border-dashed border-gray-300 bg-white p-6 text-center text-base text-gray-700 flex flex-col items-center justify-center">
                    <Calendar className="w-10 h-10 text-gray-400 mb-4" />
                    No tasks assigned for this day.
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col overflow-hidden">
                    {selectedCalendarTask ? (
                      <div className="overflow-y-auto rounded-2xl border border-gray-200 bg-white p-4 text-sm text-gray-700">
                        <p className="mt-2 font-medium">
                          {selectedCalendarTask.title}
                        </p>

                        <p className="mt-1 text-xs text-gray-500">
                          {selectedCalendarTask.location}
                        </p>

                        <div className="mt-3 space-y-2">
                          <p>
                            <span className="font-medium text-gray-800">Due:</span>{' '}
                            {selectedCalendarTask.due}
                          </p>

                          <p>
                            <span className="font-medium text-gray-800">Status:</span>{' '}
                            {getTaskDisplayStatus(selectedCalendarTask)}
                          </p>

                          <p>
                            <span className="font-medium text-gray-800">Instructions:</span>{' '}
                            {selectedCalendarTask.instructions}
                          </p>

                          <p>
                            <span className="font-medium text-gray-800">Assigned by:</span>{' '}
                            {selectedCalendarTask.supervisor}{selectedCalendarTask.customerPhone ? ` · ${selectedCalendarTask.customerPhone}` : ''}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="min-h-[250px] rounded-2xl border border-dashed border-gray-300 bg-white p-6 text-center text-base text-gray-500 flex flex-col items-center justify-center">
                        <Calendar className="w-10 h-10 text-gray-400 mb-4" />
                        No task selected.
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-6">
          <button
            onClick={() => setActiveTab('active')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium ${activeTab === 'active' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'}`}
          >
            Active Tasks ({todayTasks.length + otherActiveTasks.length})
          </button>

          <button
            onClick={() => setActiveTab('overdue')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium ${activeTab === 'overdue' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'}`}
          >
            Overdue ({overdueTasks.length})
          </button>

          <button
            onClick={() => setActiveTab('completed')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium ${activeTab === 'completed' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'}`}
          >
            Completed ({completedTasks.length})
          </button>
        </div>

        {activeTab === 'active' && (
          <div className="space-y-4">
            {myTasks.length === 0 && (
              <div className="bg-white rounded-xl border p-8 text-center text-gray-400">
                No active tasks assigned.
              </div>
            )}

            <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-900">
                  Today Tasks ({todayTasks.length})
                </h2>
                <span className="text-xs text-gray-500">
                  {new Date().toLocaleDateString()}
                </span>
              </div>

              <div className="space-y-3">
                {todayTasks.length === 0 && (
                  <div className="rounded-lg bg-white p-5 text-center text-sm text-gray-400">
                    No tasks assigned for today.
                  </div>
                )}

                {todayTasks.map(renderTaskCard)}
              </div>
            </div>

            {otherActiveTasks.length > 0 && (
              <div className="space-y-3">
                <h2 className="px-1 text-sm font-semibold text-gray-900">
                  Other Active Tasks ({otherActiveTasks.length})
                </h2>

                {otherActiveTasks.map(renderTaskCard)}
              </div>
            )}
          </div>
        )}

        {activeTab === 'overdue' && (
          <div className="space-y-3">
            {overdueTasks.length === 0 && (
              <div className="bg-white rounded-xl border p-8 text-center text-gray-400">
                No overdue tasks.
              </div>
            )}

            {overdueTasks.map(task => (
              <div key={task.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                    <Bell className="w-5 h-5 text-red-500" />
                  </div>

                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-800">
                      {task.title}
                    </p>
                    <p className="text-xs text-gray-500">
                      {task.location} - {task.due}
                    </p>
                  </div>

                  <button
                    onClick={() => setSelectedTask(selectedTask?.id === task.id ? null : task)}
                    className="text-xs text-blue-500"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                </div>

                {selectedTask?.id === task.id && (
                  <div className="mt-4 border-t border-gray-100 pt-4 text-sm text-gray-600">
                    <p>
                      <span className="font-medium text-gray-800">Assigned day:</span>{' '}
                      {task.assignedDate}
                    </p>
                    <p className="mt-1">
                      <span className="font-medium text-gray-800">Status:</span>{' '}
                      {getTaskDisplayStatus(task)}
                    </p>
                    <p className="mt-1">
                      <span className="font-medium text-gray-800">Instructions:</span>{' '}
                      {task.instructions}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {activeTab === 'completed' && (
          <div className="space-y-3">
            {completedTasks.length === 0 && (
              <div className="bg-white rounded-xl border p-8 text-center text-gray-400">
                No completed tasks yet.
              </div>
            )}

            {completedTasks.map(task => (
              <div key={task.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                    <CheckCircle className="w-5 h-5 text-green-500" />
                  </div>

                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-800">
                      {task.title}
                    </p>
                    <p className="text-xs text-gray-500">
                      {task.location} - {task.due}
                    </p>
                  </div>

                  <button
                    onClick={() => setSelectedTask(selectedTask?.id === task.id ? null : task)}
                    className="text-xs text-blue-500"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                </div>

                {selectedTask?.id === task.id && (
                  <div className="mt-4 border-t border-gray-100 pt-4 text-sm text-gray-600">
                    {task.checkedInAt && (
                      <p>
                        <span className="font-medium text-gray-800">Checked in:</span>{' '}
                        {task.checkedInAt}
                      </p>
                    )}

                    {task.checkedOutAt && (
                      <p className="mt-1">
                        <span className="font-medium text-gray-800">Checked out:</span>{' '}
                        {task.checkedOutAt}
                      </p>
                    )}

                    <p className="mt-1">
                      <span className="font-medium text-gray-800">Rating:</span>{' '}
                      {task.rating || 'Not graded yet'}/5
                    </p>

                    <p className="mt-1">
                      <span className="font-medium text-gray-800">Feedback:</span>{' '}
                      {task.feedback}
                    </p>

                    {task.proof?.file_url && (
                      <a
                        href={task.proof.file_url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
                      >
                        <FileUp className="h-3.5 w-3.5" />
                        View submitted proof
                      </a>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {showProofModal && proofTask && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-sm w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold">Check Out &amp; Confirm Completion</h3>
              <button type="button" onClick={() => setShowProofModal(false)}>
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm text-gray-600 mb-4">
              Booking: {proofTask.title}
            </p>

            <input
              type="file"
              accept="image/*,.pdf,.doc,.docx"
              onChange={event => {
                setProofFile(event.target.files?.[0] || null)
                setProofError('')
              }}
              className="mb-4 text-sm"
            />

            {proofError && (
              <div className="mb-4 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
                {proofError}
              </div>
            )}

            <button
              type="button"
              onClick={handleUploadProof}
              disabled={uploadingProof}
              className="w-full py-2 bg-blue-500 text-white rounded-lg text-sm disabled:opacity-60"
            >
              {uploadingProof ? 'Uploading...' : 'Check Out & Complete'}
            </button>
          </div>
        </div>
      )}

    </Layout>
  )
}