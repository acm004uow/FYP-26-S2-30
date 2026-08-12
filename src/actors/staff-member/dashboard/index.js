import Layout from '../../../components/Layout'
import BookingMessagesPanel from '../../../components/BookingMessagesPanel'
import { useEffect, useMemo, useState } from 'react'
import { MapPin, Clock, CheckCircle, Star, X, Eye, Bell, ChevronRight, ChevronLeft, ChevronDown, ChevronUp, Calendar, FileUp, AlertCircle, AlertTriangle, ClipboardList, Sparkles, FileText, User, LogIn, LogOut, MessageCircle } from 'lucide-react'
import { supabase } from '../../../../lib/supabaseClient'
import { CHECK_IN_LEAD_MINUTES, formatBookingAsTask, getTaskAssignedDate, isSameLocalDay, isTaskAssignedToday, isTaskCheckInOpen, isTaskPastDue, statusColor } from '../../../../lib/staffTasks'
import { formatDuration, getAttendanceStatusFromDateTime } from '../../../../lib/attendance'
import { CHECK_IN_RADIUS_METERS, getCurrentPosition, getDistanceMeters } from '../../../../lib/geolocation'
import { useAuthUser } from '../../../context/AuthUserContext'

const getTaskDisplayStatus = (task) => {
  if (task.rawStatus === 'overdue' || isTaskPastDue(task)) {
    return 'Overdue'
  }

  return task.status
}

const getDateTimeParts = (iso) => {
  if (!iso) return null

  const date = new Date(iso)

  return {
    datePart: date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }),
    timePart: date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }),
  }
}

const formatTaskDateTime = (task) => {
  const parts = getDateTimeParts(task.scheduledStartRaw)
  return parts ? `${parts.datePart} • ${parts.timePart}` : 'Not scheduled'
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

const statusIcon = {
  Approved: CheckCircle,
  Completed: CheckCircle,
  Pending: Clock,
  'In Progress': Clock,
  Overdue: AlertCircle,
}

export default function StaffMemberDashboard() {
  const { user } = useAuthUser()
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
  const [messagesTask, setMessagesTask] = useState(null)

  const loadDashboard = async () => {
    if (!user) return

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
      .select('id,created_at,service_type,location,scheduled_date,scheduled_time,estimated_hours,status,description,notes,customer_id,checked_in_at,checked_out_at,latitude,longitude,source,created_by,issue_status,issue_description,issue_reported_at,department_confirmed_at,customer:profiles!bookings_customer_id_fkey(full_name,email,phone),created_by_profile:profiles!bookings_created_by_fkey(full_name),performance_reviews(rating,feedback),task_proofs(file_url,file_name,created_at)')
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

      if (!user) return

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
  }, [user])

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

      const completedAt = new Date()

      const { error: taskError } = await supabase
        .from('bookings')
        .update({ status: 'completed', checked_out_at: completedAt.toISOString(), updated_at: completedAt.toISOString() })
        .eq('id', proofTask.id)
        .eq('assigned_staff_id', profile.id)

      if (taskError) throw taskError

      // Real elapsed check-in-to-check-out time, not the pre-assigned estimate — this feeds the
      // owner's allowance/payroll calculation (see ReportsPanel.js's Staff Pay Summary, which
      // computes hours the same way from bookings.checked_in_at/checked_out_at directly) and the
      // recommendation engine's max-weekly-hours cap (lib/recommendationEngine.js), so both need
      // to reflect actual time worked. Falls back to a nominal 2h only if check-in was somehow
      // never recorded (shouldn't happen — completion is only reachable after check-in).
      const actualHours = proofTask.checkedInAtRaw
        ? Math.round(Math.max(0, (completedAt - new Date(proofTask.checkedInAtRaw)) / 3600000) * 100) / 100
        : 2

      const { error: workloadError } = await supabase
        .from('staff_profiles')
        .update({
          current_workload: Math.max(0, Number(profile.current_workload || 0) - 1),
          // Accumulates actual hours worked this week (reset to 0 by the weekly cron once each
          // business's own cutoff passes — app/api/cron/weekly-schedule/route.js).
          weekly_working_hours: Number(profile.weekly_working_hours || 0) + actualHours,
          updated_at: completedAt.toISOString(),
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
  //
  // Reopened tasks (issueStatus === 'open', status flipped back to in_progress after a
  // department staff reported a problem) are carved out of all three groups below and given
  // their own section rendered with renderTaskCard (which has the Check-Out button) — their
  // original scheduled date is virtually always in the past by the time an issue is reported,
  // so without this they'd fall into overdueTasks and render via the view-only renderTaskListRow,
  // leaving the assignee with no way to act on them.
  const reopenedTasks = myTasks.filter((task) => task.isReopened)
  const todayTasks = myTasks.filter((task) => isTaskAssignedToday(task) && !task.isReopened)
  const otherActiveTasks = myTasks.filter((task) => !isTaskAssignedToday(task) && !isTaskPastDue(task) && !task.isReopened)

  const allTasks = useMemo(() => {
    return [...myTasks, ...completedTasks]
  }, [myTasks, completedTasks])

  const overdueTasks = useMemo(() => {
    return allTasks.filter((task) => isTaskPastDue(task) && !task.isReopened)
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

  const goToToday = () => {
    const today = new Date()
    setCalendarDate(today)
    setSelectedCalendarDate(today)
  }

  const greeting = (() => {
    const hour = new Date().getHours()
    if (hour < 12) return 'Good Morning'
    if (hour < 18) return 'Good Afternoon'
    return 'Good Evening'
  })()

  const staffInitial = (profile?.staff_name || 'S').trim().charAt(0).toUpperCase() || 'S'

  const renderTaskCard = (task) => {
    const canStartToday = isTaskAssignedToday(task)
    const checkInOpen = canStartToday && isTaskCheckInOpen(task)
    const checkInOpensAt = getDateTimeParts(task.scheduledStartRaw)?.timePart
    const isExpanded = selectedTask?.id === task.id
    const displayStatus = getTaskDisplayStatus(task)
    const StatusIcon = statusIcon[displayStatus] || CheckCircle

    return (
      <div
        key={task.id}
        className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 transition hover:shadow-md"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ${statusColor[displayStatus] || statusColor.Pending}`}>
              <StatusIcon className="h-4 w-4" />
              {displayStatus}
            </span>

            {canStartToday && task.status !== 'In Progress' && (
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-700">
                Today
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={() => setSelectedTask(isExpanded ? null : task)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition hover:bg-gray-50"
            aria-label={isExpanded ? 'Collapse task' : 'Expand task'}
          >
            <ChevronUp className={`h-4 w-4 transition-transform ${isExpanded ? '' : 'rotate-180'}`} />
          </button>
        </div>

        {task.isReopened && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span><strong>Reopened for rework.</strong> {task.issueDescription}</span>
          </div>
        )}

        <button
          type="button"
          onClick={() => setSelectedTask(isExpanded ? null : task)}
          className="mt-4 flex w-full items-start gap-4 text-left"
        >

          <span className="min-w-0 flex-1">
            <span className="block text-xl font-bold text-gray-900">{task.title}</span>

            <span className="mt-2 flex flex-wrap items-center gap-1.5 text-sm text-gray-500">
              <MapPin className="h-4 w-4 text-emerald-600" />
              {task.location}
            </span>
          </span>
        </button>

        {isExpanded && (
          <div className="mt-5 border-t border-gray-100 pt-5">
            {task.description && (
              <div className="mb-4 flex items-start gap-2 text-sm text-gray-600">
                <FileText className="h-4 w-4 mt-0.5 shrink-0 text-emerald-600" />
                <p>{task.description}</p>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex items-center gap-3 rounded-xl bg-gray-50 p-4">
                <Calendar className="h-5 w-5 shrink-0 text-emerald-600" />
                <div>
                  <p className="text-xs text-gray-500">Assigned day</p>
                  <p className="text-sm font-bold text-gray-900">{formatTaskDateTime(task)}</p>
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-xl bg-gray-50 p-4">
                <ClipboardList className="h-5 w-5 shrink-0 text-emerald-600" />
                <div>
                  <p className="text-xs text-gray-500">Requirement</p>
                  <p className="text-sm font-bold text-gray-900">{task.requiredSkill}</p>
                </div>
              </div>
            </div>

            <div className="mt-3 rounded-xl border border-gray-100 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                <FileText className="h-4 w-4 text-emerald-600" />
                Instructions
              </div>
              <div className="mt-2 rounded-lg bg-gray-50 p-3 text-sm text-gray-600">
                {task.instructions}
              </div>
            </div>

            {(task.checkedInAtRaw || task.checkedOutAtRaw) && (
              <div className="mt-3 rounded-lg bg-emerald-50 border border-emerald-100 p-3 text-xs text-emerald-800 space-y-1">
                {task.checkedInAt && <p>Checked in: {task.checkedInAt}</p>}
                {task.checkedOutAt && <p>Checked out: {task.checkedOutAt}</p>}
                {task.checkedInAtRaw && task.checkedOutAtRaw && (
                  <p className="font-semibold">Worked: {formatDuration(new Date(task.checkedOutAtRaw) - new Date(task.checkedInAtRaw))}</p>
                )}
              </div>
            )}

            <p className="mt-4 flex items-center gap-1.5 text-sm text-gray-500">
              <User className="h-4 w-4" />
              Assigned by: <span className="font-semibold text-gray-800">{task.supervisor}</span>{task.customerPhone ? ` · ${task.customerPhone}` : ''}
            </p>

            {task.source === 'department' && (
              <button
                type="button"
                onClick={() => setMessagesTask(task)}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
              >
                <MessageCircle className="h-4 w-4" /> Messages
              </button>
            )}

            {checkInErrorTaskId === task.id && checkInError && (
              <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-600">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{checkInError}</span>
              </div>
            )}

            {(['Pending', 'Approved'].includes(task.status) || task.status === 'In Progress') && (
              <div className="mt-5 rounded-2xl  p-1.5">
                {['Pending', 'Approved'].includes(task.status) && (
                  <button
                    type="button"
                    onClick={() => handleStartTask(task.id)}
                    disabled={!checkInOpen || checkingInTaskId === task.id}
                    title={
                      !canStartToday ? 'This task can only be started on its assigned day'
                        : !checkInOpen ? `Check-in opens ${CHECK_IN_LEAD_MINUTES} minutes before the scheduled start${checkInOpensAt ? ` (${checkInOpensAt})` : ''}`
                          : 'Check in and start this task'
                    }
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3.5 text-base font-bold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500"
                  >
                    <Calendar className="h-5 w-5" />
                    {checkingInTaskId === task.id
                      ? 'Checking location...'
                      : !canStartToday
                        ? 'Check In on Assigned Day'
                        : !checkInOpen
                          ? `Check-in opens at ${checkInOpensAt}`
                          : 'Check In'}
                  </button>
                )}

                {task.status === 'In Progress' && (
                  <button
                    type="button"
                    onClick={() => handleCompleteTask(task.id)}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3.5 text-base font-bold text-white transition hover:bg-emerald-700"
                  >
                    <CheckCircle className="h-5 w-5" />
                    Check Out &amp; Complete
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  const renderTaskListRow = (task, { icon: Icon, iconBg, iconColor, detail }) => {
    const isExpanded = selectedTask?.id === task.id
    const scheduledParts = getDateTimeParts(task.scheduledStartRaw)

    return (
      <div key={task.id} className={`rounded-xl border border-gray-100 bg-white shadow-sm transition ${isExpanded ? 'p-4' : 'px-3 py-2'} `}>
        <div className="flex items-start gap-4">
          <span className={`flex shrink-0 items-center justify-center rounded-full transition-all ${iconBg} ${iconColor} ${isExpanded ? 'h-12 w-12' : 'h-10 w-10'}`}>
            <Icon className={isExpanded ? 'h-5 w-5' : 'h-4 w-4'} />
          </span>

          <div className="min-w-0 flex-1">
            <p className={`font-bold text-gray-900 ${isExpanded ? 'text-lg' : ''}`}>{task.title}</p>

            <p className={`mt-1 flex items-center gap-1.5 text-gray-500 ${isExpanded ? 'text-base' : 'text-sm'}`}>
              <MapPin className={`shrink-0 text-emerald-600 ${isExpanded ? 'h-4 w-4' : 'h-3.5 w-3.5'}`} />
              <span className={isExpanded ? '' : 'truncate'}>{task.location}</span>
            </p>

            {isExpanded ? (
              <p className="mt-2 flex flex-wrap items-center gap-3 text-base text-gray-600">
                <span className="flex items-center gap-1.5">
                  <Calendar className="h-4 w-4 text-emerald-600" />
                  {scheduledParts ? scheduledParts.datePart : 'Not scheduled'}
                </span>

                {scheduledParts && (
                  <>
                    <span className="text-gray-300">|</span>
                    <span className="flex items-center gap-1.5">
                      <Clock className="h-4 w-4 text-emerald-600" />
                      {scheduledParts.timePart}
                    </span>
                  </>
                )}
              </p>
            ) : (
              <p className="mt-1 flex items-center gap-1.5 text-sm text-gray-500">
                <Calendar className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                {formatTaskDateTime(task)}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={() => setSelectedTask(isExpanded ? null : task)}
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-200 px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50"
          >
            <Eye className="h-4 w-4" />
            View
          </button>
        </div>

        {isExpanded && (
          <div className="mt-5 border-t border-gray-100 pt-5 text-sm text-gray-600">
            {detail}
          </div>
        )}
      </div>
    )
  }

  return (
    <Layout role="staffMember">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {notification && (
          <div className="mb-4 p-3 bg-accent-100 text-accent-800 rounded-lg flex items-center gap-2 border-l-4 border-accent">
            <Bell className="w-4 h-4" />
            {notification}
          </div>
        )}

        <div className="mb-6 overflow-hidden rounded-2xl border border-emerald-100 bg-gradient-to-r from-emerald-50 to-emerald-100/50">
          <div className="flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-2xl font-bold text-white">
                {staffInitial}
              </div>

              <div>
                <p className="text-sm text-gray-500">{greeting},</p>
                <h1 className="text-3xl font-bold leading-tight text-gray-900">
                  {profile?.staff_name || 'Staff Member'}
                </h1>

                <div className="mt-1.5 flex items-center gap-1.5 text-sm text-gray-600">
                  <MapPin className="h-4 w-4 text-emerald-600" />
                  <span>{profile?.assigned_region || 'No location added'}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-5 sm:gap-8">
              <button
                type="button"
                onClick={() => setActiveTab('active')}
                className="flex items-center gap-3 text-left"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-emerald-600 shadow-sm">
                  <ClipboardList className="h-5 w-5" />
                </span>
                <span>
                  <span className="block text-2xl font-bold text-gray-900">{myTasks.length}</span>
                  <span className="block text-xs font-medium text-gray-500">Active Tasks</span>
                  <span className="mt-1 block h-0.5 w-6 rounded-full bg-emerald-500" />
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('completed')}
                className="flex items-center gap-3 text-left"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-emerald-600 shadow-sm">
                  <CheckCircle className="h-5 w-5" />
                </span>
                <span>
                  <span className="block text-2xl font-bold text-gray-900">{completedTasks.length}</span>
                  <span className="block text-xs font-medium text-gray-500">Completed</span>
                  <span className="mt-1 block h-0.5 w-6 rounded-full bg-emerald-500" />
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('completed')}
                className="flex items-center gap-3 text-left"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-amber-500 shadow-sm">
                  <Star className="h-5 w-5 fill-amber-400 text-amber-400" />
                </span>
                <span>
                  <span className="block text-2xl font-bold text-gray-900">{avgRating}</span>
                  <span className="block text-xs font-medium text-gray-500">Rating</span>
                  <span className="mt-1 block h-0.5 w-6 rounded-full bg-emerald-500" />
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Calendar */}
        {overdueTasks.length > 0 && !dismissedOverdueAlert && (
          <div className="mb-6 rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
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
        <div className="bg-white rounded-xl border border-gray-100 p-6 mb-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <div>
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
                  <Calendar className="h-5 w-5" />
                </span>
                <p className="text-xl font-semibold text-gray-900">
                  Assigned tasks calendar
                </p>
              </div>
              <span className="ml-11 mt-1 block h-0.5 w-10 rounded-full bg-emerald-500" />
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => changeMonth(-1)}
                className="flex items-center gap-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                <ChevronLeft className="h-4 w-4" />
                Prev
              </button>

              <button
                onClick={() => changeMonth(1)}
                className="flex items-center gap-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </button>

              <button
                onClick={goToToday}
                className="flex items-center gap-1.5 rounded-xl border border-emerald-200 px-4 py-2.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
              >
                <Calendar className="h-4 w-4" />
                Today
              </button>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-[520px_1fr] items-stretch">
            <div className="min-w-0 w-full">
              <div className="h-full flex flex-col rounded-xl border border-gray-100 bg-white p-4">
                <div className="mb-3 flex items-center gap-1 text-base font-semibold text-gray-900">
                  {calendarDate.toLocaleDateString(undefined, {
                    month: 'long',
                    year: 'numeric',
                  })}
                  <ChevronDown className="h-4 w-4 text-gray-400" />
                </div>

                <div className="grid grid-cols-7 gap-3 text-center text-xs uppercase tracking-[0.06em] text-gray-500">
                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
                    <div key={day}>{day}</div>
                  ))}
                </div>
                <div className="space-y-2 mt-4 flex-1">
                  {calendarWeeks.map((week, weekIndex) => (
                    <div key={weekIndex} className="grid grid-cols-7 gap-2">
                      {week.map((day) => {
                        const isSelected = isSameLocalDay(day.date, selectedCalendarDate)
                        const isCurrentMonth = day.date.getMonth() === calendarDate.getMonth()
                        const isToday = isSameLocalDay(day.date, new Date())
                        const hasTasks = day.tasks.length > 0
                        const isOverdue = day.tasks.some((task) => getTaskDisplayStatus(task) === 'Overdue')
                        const isAllCompleted = hasTasks && day.tasks.every((task) => task.rawStatus === 'completed')
                        const dotColor = isOverdue ? 'bg-red-400' : isAllCompleted ? 'bg-emerald-400' : 'bg-amber-400'

                        return (
                          <button
                            key={day.date.toISOString()}
                            type="button"
                            onClick={() => {
                              setSelectedCalendarDate(day.date)
                              setSelectedCalendarTask(day.tasks[0] || null)
                            }}
                            className={`flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-xl border py-2 text-center transition cursor-pointer
                              ${isCurrentMonth
                                ? isSelected
                                  ? 'border-emerald-400 bg-emerald-50'
                                  : 'border-gray-200 bg-white hover:border-gray-300'
                                : 'border-transparent bg-gray-50'}
                            `}
                          >
                            <span className={`text-sm font-medium ${isToday ? 'text-emerald-600 font-bold' : isCurrentMonth ? 'text-gray-900' : 'text-gray-300'}`}>
                              {day.date.getDate()}
                            </span>
                            <span className={`h-1.5 w-1.5 rounded-full ${hasTasks ? dotColor : 'bg-transparent'}`} />
                          </button>
                        )
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-4 w-full">
              <div className="mb-4 flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
                  <Calendar className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-gray-900">Selected date</p>
                  <p className="text-sm font-medium text-emerald-700">
                    {selectedCalendarDate.toLocaleDateString(undefined, {
                      weekday: 'long',
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-dashed border-gray-200 bg-white p-4">
                {selectedCalendarTasks.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-6 text-center">
                    <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gray-50 text-gray-300">
                      <ClipboardList className="h-7 w-7" />
                    </div>
                    <p className="font-semibold text-gray-800">No tasks assigned for this day</p>
                    <p className="mt-1 text-sm text-gray-500">
                      Enjoy your day! New tasks will appear here once assigned.
                    </p>
                    <button
                      type="button"
                      onClick={() => setActiveTab('active')}
                      className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
                    >
                      <Calendar className="h-4 w-4" />
                      View all tasks
                    </button>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col overflow-hidden">
                    {selectedCalendarTask ? (
                      <div className="overflow-y-auto rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-700">
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

                          {selectedCalendarTask.checkedInAtRaw && selectedCalendarTask.checkedOutAtRaw && (
                            <p>
                              <span className="font-medium text-gray-800">Worked:</span>{' '}
                              {formatDuration(new Date(selectedCalendarTask.checkedOutAtRaw) - new Date(selectedCalendarTask.checkedInAtRaw))}
                            </p>
                          )}

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
                      <div className="min-h-[250px] rounded-xl border border-dashed border-gray-300 bg-white p-6 text-center text-base text-gray-500 flex flex-col items-center justify-center">
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

        <div className="flex gap-1 bg-[#07191E] p-1 rounded-xl mb-6">
          <button
            onClick={() => setActiveTab('active')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium ${activeTab === 'active' ? 'bg-[#D9FFF0] text-[#004D32] shadow-sm' : 'text-emerald-100'}`}
          >
            Active Tasks ({myTasks.length})
          </button>

          <button
            onClick={() => setActiveTab('overdue')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium ${activeTab === 'overdue' ? 'bg-[#D9FFF0] text-[#004D32] shadow-sm' : 'text-emerald-100'}`}
          >
            Overdue ({overdueTasks.length})
          </button>

          <button
            onClick={() => setActiveTab('completed')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium ${activeTab === 'completed' ? 'bg-[#D9FFF0] text-[#004D32] shadow-sm' : 'text-emerald-100'}`}
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

            {reopenedTasks.length > 0 && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-600" />
                  <h2 className="text-sm font-semibold text-red-800">Reopened — needs rework ({reopenedTasks.length})</h2>
                </div>
                <div className="space-y-3">{reopenedTasks.map(renderTaskCard)}</div>
              </div>
            )}

            <div className="rounded-xl border border-accent-200 bg-accent-100/50 p-4">
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

            {overdueTasks.map(task => renderTaskListRow(task, {
              icon: Bell,
              iconBg: 'bg-red-100',
              iconColor: 'text-red-500',
              detail: (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-lg bg-gray-50 p-4">
                      <div className="flex items-start gap-3">
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                          <Calendar className="h-5 w-5" />
                        </span>
                        <div>
                          <p className="text-sm font-semibold text-gray-900">Assigned day</p>
                          <p className="mt-1 text-sm text-gray-600">{task.assignedDate}</p>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-lg bg-gray-50 p-4">
                      <div className="flex items-start gap-3">
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-500">
                          <AlertCircle className="h-5 w-5" />
                        </span>
                        <div>
                          <p className="text-sm font-semibold text-gray-900">Status</p>
                          <p className="mt-1 text-sm text-gray-600">{getTaskDisplayStatus(task)}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 rounded-xl border border-gray-100 p-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                      <FileText className="h-4 w-4 text-emerald-600" />
                      Instructions
                    </div>
                    <div className="mt-2 rounded-lg bg-gray-50 p-3 text-sm text-gray-600">
                      {task.instructions}
                    </div>
                  </div>
                </>
              ),
            }))}
          </div>
        )}

        {activeTab === 'completed' && (
          <div className="space-y-3">
            {completedTasks.length === 0 && (
              <div className="bg-white rounded-xl border p-8 text-center text-gray-400">
                No completed tasks yet.
              </div>
            )}

            {completedTasks.map(task => {
              const checkedInParts = getDateTimeParts(task.checkedInAtRaw)
              const checkedOutParts = getDateTimeParts(task.checkedOutAtRaw)

              const renderDateTimeLine = (parts) => (
                parts ? (
                  <p className="mt-1 flex items-center gap-2 text-sm text-gray-600">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5 text-emerald-600" />
                      {parts.datePart}
                    </span>
                    <span className="text-gray-300">|</span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5 text-emerald-600" />
                      {parts.timePart}
                    </span>
                  </p>
                ) : (
                  <p className="mt-1 text-sm text-gray-400">Not recorded</p>
                )
              )

              return renderTaskListRow(task, {
                icon: CheckCircle,
                iconBg: 'bg-emerald-100',
                iconColor: 'text-emerald-600',
                detail: (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-xl bg-gray-50 p-1">
                        <div className="flex items-start gap-3">
                          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                            <LogIn className="h-5 w-5" />
                          </span>
                          <div>
                            <p className="text-sm font-semibold text-gray-900">Checked in</p>
                            {renderDateTimeLine(checkedInParts)}
                          </div>
                        </div>
                      </div>

                      <div className="rounded-lg bg-gray-50 p-4">
                        <div className="flex items-start gap-3">
                          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                            <LogOut className="h-5 w-5" />
                          </span>
                          <div>
                            <p className="text-sm font-semibold text-gray-900">Checked out</p>
                            {renderDateTimeLine(checkedOutParts)}
                          </div>
                        </div>
                      </div>

                      {task.checkedInAtRaw && task.checkedOutAtRaw && (
                        <div className="rounded-lg bg-gray-50 p-4 sm:col-span-2">
                          <div className="flex items-start gap-3">
                            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                              <Clock className="h-5 w-5" />
                            </span>
                            <div>
                              <p className="text-sm font-semibold text-gray-900">Worked</p>
                              <p className="mt-1 text-sm font-semibold text-emerald-700">
                                {formatDuration(new Date(task.checkedOutAtRaw) - new Date(task.checkedInAtRaw))}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="rounded-lg bg-gray-50 p-4">
                        <div className="flex items-start gap-3">
                          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-500">
                            <Star className="h-5 w-5" />
                          </span>
                          <div>
                            <p className="text-sm font-semibold text-gray-900">Rating</p>
                            <span className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-700">
                              <Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500" />
                              {task.rating ? `${task.rating}/5` : 'Not graded yet / 5'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-lg bg-gray-50 p-4">
                        <div className="flex items-start gap-3">
                          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-500">
                            <MessageCircle className="h-5 w-5" />
                          </span>
                          <div>
                            <p className="text-sm font-semibold text-gray-900">Feedback</p>
                            <span className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-3 py-1 text-sm font-medium text-blue-700">
                              <MessageCircle className="h-3.5 w-3.5" />
                              {task.feedback}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {task.proof?.file_url && (
                      <a
                        href={task.proof.file_url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-emerald-600 hover:underline"
                      >
                        <FileUp className="h-3.5 w-3.5" />
                        View submitted proof
                      </a>
                    )}
                  </>
                ),
              })
            })}
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
              className="w-full py-2 bg-accent hover:bg-accent-600 text-white rounded-lg text-sm font-semibold transition disabled:opacity-60"
            >
              {uploadingProof ? 'Uploading...' : 'Check Out & Complete'}
            </button>
          </div>
        </div>
      )}

      {messagesTask && (
        <BookingMessagesPanel
          bookingId={messagesTask.id}
          currentUserId={user.id}
          role="staffMember"
          otherPartyLabel={messagesTask.requestedByName || 'Department staff'}
          notifyUserId={messagesTask.createdByUserId}
          notifyContext={messagesTask.title}
          onClose={() => setMessagesTask(null)}
        />
      )}

    </Layout>
  )
}