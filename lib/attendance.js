// Staff must check in within this many minutes of the customer's scheduled time
// (either side) to be marked "present" instead of "late".
export const ATTENDANCE_WINDOW_MINUTES = 5

export function getScheduledDateTime(scheduledDate, scheduledTime) {
  if (!scheduledDate) return null
  return new Date(`${scheduledDate}T${scheduledTime || '00:00'}:00`)
}

// Returns 'present' | 'late' | null (null when there's no scheduled time to compare against).
export function getAttendanceStatusFromDateTime(scheduledDateTime, checkInAt = new Date()) {
  if (!scheduledDateTime) return null
  const scheduled = scheduledDateTime instanceof Date ? scheduledDateTime : new Date(scheduledDateTime)
  if (Number.isNaN(scheduled.getTime())) return null
  const diffMinutes = Math.abs(checkInAt - scheduled) / 60000
  return diffMinutes <= ATTENDANCE_WINDOW_MINUTES ? 'present' : 'late'
}

export function getAttendanceStatus(scheduledDate, scheduledTime, checkInAt = new Date()) {
  return getAttendanceStatusFromDateTime(getScheduledDateTime(scheduledDate, scheduledTime), checkInAt)
}
