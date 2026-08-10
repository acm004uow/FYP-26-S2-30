// Shared conflict-detection used everywhere a staff member gets assigned to a job — the root fix
// for staff getting double-booked (the same person recommended/assigned to two jobs that overlap
// in time). None of the scoring in recommendationEngine.js previously looked at a staff member's
// OTHER already-assigned bookings, only their weekly hour total and workload count, so two
// separate bookings at the same time could both independently pick the same top-scoring staff.

function toMinutes(time) {
  if (!time) return null
  const [h, m] = String(time).split(':').map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null
  return h * 60 + m
}

// True if two [start, start+duration] windows on the same date overlap. A booking with no
// scheduled_time is treated as never conflicting — we can't know when in the day it falls, so we
// don't block on it (consistent with how the rest of the scheduler already treats a missing time).
export function timesOverlap(dateA, timeA, hoursA, dateB, timeB, hoursB) {
  if (!dateA || !dateB || dateA !== dateB) return false
  const startA = toMinutes(timeA)
  const startB = toMinutes(timeB)
  if (startA == null || startB == null) return false
  const endA = startA + Math.max(Number(hoursA) || 0, 0.25) * 60
  const endB = startB + Math.max(Number(hoursB) || 0, 0.25) * 60
  return startA < endB && startB < endA
}

// Staff IDs already committed to a job that overlaps this task's date/time, given a list of other
// bookings (each needs assigned_staff_id, scheduled_date, scheduled_time, estimated_hours). Pass
// excludeBookingId when re-matching an existing booking so it doesn't conflict with itself.
export function getConflictingStaffIds(task, existingBookings, { excludeBookingId } = {}) {
  const conflicting = new Set()
  for (const booking of existingBookings || []) {
    if (!booking?.assigned_staff_id) continue
    if (excludeBookingId && booking.id === excludeBookingId) continue
    if (timesOverlap(task.scheduled_date, task.scheduled_time, task.estimated_hours, booking.scheduled_date, booking.scheduled_time, booking.estimated_hours)) {
      conflicting.add(booking.assigned_staff_id)
    }
  }
  return conflicting
}

// Fetches other active (pending/approved) bookings for this company on a given date that already
// have a staff member assigned — the data set getConflictingStaffIds checks against. Client-side
// helper; every AI-recommendation and manual-assignment surface calls this before assigning.
export async function fetchAssignedBookingsForDate(supabase, hostAdminId, date, { excludeBookingId } = {}) {
  if (!hostAdminId || !date) return []
  let query = supabase
    .from('bookings')
    .select('id,assigned_staff_id,scheduled_date,scheduled_time,estimated_hours')
    .eq('host_admin_id', hostAdminId)
    .eq('scheduled_date', date)
    .not('assigned_staff_id', 'is', null)
    .in('status', ['pending', 'approved'])
  if (excludeBookingId) query = query.neq('id', excludeBookingId)
  const { data } = await query
  return data || []
}
