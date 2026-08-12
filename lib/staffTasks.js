export const statusColor = {
  'In Progress': 'bg-blue-100 text-blue-700',
  Pending: 'bg-yellow-100 text-yellow-700',
  Completed: 'bg-green-100 text-green-700',
  Approved: 'bg-green-100 text-green-700',
  Overdue: 'bg-red-100 text-red-700',
}

export const parseDate = (value) => (value ? new Date(value) : null)

export const isTaskPastDue = (task) => {
  const dueDate = parseDate(task.scheduledEndRaw)
  return dueDate && dueDate < new Date() && task.rawStatus !== 'completed'
}

export const getTaskDisplayStatus = (task) => {
  if (task.rawStatus === 'overdue' || isTaskPastDue(task)) {
    return 'Overdue'
  }

  return task.status
}

export const getTaskAssignedDate = (task) => {
  const dateValue =
    task.scheduled_start ||
    task.scheduledStartRaw ||
    task.scheduled_end ||
    task.scheduledEndRaw

  return dateValue ? new Date(dateValue) : null
}

export const isSameLocalDay = (first, second) =>
  first &&
  second &&
  first.getFullYear() === second.getFullYear() &&
  first.getMonth() === second.getMonth() &&
  first.getDate() === second.getDate()

export const isTaskAssignedToday = (task) =>
  isSameLocalDay(getTaskAssignedDate(task), new Date())

// Staff can check in starting this many minutes before the scheduled start — early enough to be
// ready on time, but not so early the button is live all day. There's no upper bound: once open,
// check-in stays available (a late check-in is still valid, just recorded as "late" — see
// lib/attendance.js).
export const CHECK_IN_LEAD_MINUTES = 30

export const isTaskCheckInOpen = (task, now = new Date()) => {
  const scheduledStart = getTaskAssignedDate(task)
  if (!scheduledStart) return false
  return now.getTime() >= scheduledStart.getTime() - CHECK_IN_LEAD_MINUTES * 60000
}

// The Monday-Sunday week right after the current one — matches the manager's "next week"
// scheduling convention used elsewhere (Finalize Schedule, the AI Agent's Weekly Schedule grid).
export const getNextWeekRange = () => {
  const now = new Date()
  const day = now.getDay() // 0=Sun..6=Sat
  const diffToNextMonday = day === 0 ? 1 : 8 - day
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  start.setDate(now.getDate() + diffToNextMonday)
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  end.setHours(23, 59, 59, 999)
  return { start, end }
}

export const isTaskInRange = (task, range) => {
  const assigned = getTaskAssignedDate(task)
  return Boolean(assigned && assigned >= range.start && assigned <= range.end)
}

export const titleCase = (value) =>
  value === 'in_progress'
    ? 'In Progress'
    : value.replace('_', ' ').replace(/^\w/, c => c.toUpperCase())

export const formatBookingAsTask = (booking) => {
  const scheduledIso = booking.scheduled_date
    ? new Date(`${booking.scheduled_date}T${booking.scheduled_time || '09:00'}`).toISOString()
    : null
  // A task isn't "overdue" the moment its start time passes — it's due for its full
  // estimated duration (e.g. a 7-9pm job checked in at 7:08pm is on time, not late).
  const scheduledEndIso = scheduledIso
    ? new Date(new Date(scheduledIso).getTime() + Number(booking.estimated_hours || 2) * 60 * 60 * 1000).toISOString()
    : null

  return {
    id: booking.id,
    createdAt: booking.created_at,
    title: booking.service_type,
    location: booking.location,
    latitude: booking.latitude ?? null,
    longitude: booking.longitude ?? null,
    scheduledStartRaw: scheduledIso,
    scheduledEndRaw: scheduledEndIso,
    scheduledStart: scheduledIso ? new Date(scheduledIso).toLocaleString() : 'Not set',
    due: scheduledIso ? new Date(scheduledIso).toLocaleString() : 'No due date',
    assignedDate: scheduledIso ? new Date(scheduledIso).toLocaleDateString() : 'Not scheduled',
    status: titleCase(booking.status),
    rawStatus: booking.status,
    description: booking.description || '',
    requiredSkill: booking.service_type,
    instructions: booking.notes || 'No special instructions.',
    supervisor: booking.customer?.full_name || booking.customer?.email || booking.created_by_profile?.full_name || 'Customer',
    customerId: booking.customer_id,
    customerPhone: booking.customer?.phone || '',
    source: booking.source || 'customer',
    createdByUserId: booking.created_by || null,
    requestedByName: booking.created_by_profile?.full_name || null,
    issueStatus: booking.issue_status || null,
    issueDescription: booking.issue_description || '',
    issueReportedAt: booking.issue_reported_at || null,
    departmentConfirmedAt: booking.department_confirmed_at || null,
    isReopened: booking.issue_status === 'open' && booking.status === 'in_progress',
    rating: booking.performance_reviews?.[0]?.rating || 0,
    feedback: booking.performance_reviews?.[0]?.feedback || 'No feedback yet',
    proof: booking.task_proofs?.[0] || null,
    checkedInAt: booking.checked_in_at ? new Date(booking.checked_in_at).toLocaleString() : null,
    checkedOutAt: booking.checked_out_at ? new Date(booking.checked_out_at).toLocaleString() : null,
    checkedInAtRaw: booking.checked_in_at || null,
    checkedOutAtRaw: booking.checked_out_at || null,
  }
}
