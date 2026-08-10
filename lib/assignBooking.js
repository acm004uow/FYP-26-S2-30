import { supabase } from './supabaseClient'

// Real, persisted rejection — sets status='rejected' on the booking, same as the Bookings
// screen's Reject button (src/actors/manager/bookings/BookingsReviewPanel.js#handleReview).
// Distinct from the AI Scheduling Agent's "Skip" action, which only hides a row from that one
// proposal view locally and leaves the underlying booking 'pending' (it can be re-proposed later).
export async function rejectBooking({ booking, managerUserId, action = 'reject_booking' }) {
  const { data: rejectedBooking, error } = await supabase
    .from('bookings')
    .update({ status: 'rejected', reviewed_by: managerUserId, updated_at: new Date().toISOString() })
    .eq('id', booking.id)
    .eq('status', 'pending')
    .select('id,customer_id,service_type')
    .maybeSingle()

  if (error || !rejectedBooking) {
    return { success: false, message: error?.message || 'This booking could not be rejected.' }
  }

  await Promise.all([
    rejectedBooking.customer_id
      ? supabase.from('notifications').insert({
        user_id: rejectedBooking.customer_id,
        title: 'Booking rejected',
        message: `${rejectedBooking.service_type} was rejected by the manager.`,
      })
      : Promise.resolve(),
    supabase.from('audit_logs').insert({ user_id: managerUserId, action, details: `Rejected ${rejectedBooking.service_type}` }),
  ])

  return { success: true, message: `${rejectedBooking.service_type} rejected.`, rejectedBooking }
}

export async function assignStaffToBooking({ booking, staff, managerUserId, previousStaff, action = 'assign_booking' }) {
  if (!staff) return { success: false, message: 'Staff member not found.' }
  if (booking.status === 'rejected') return { success: false, message: 'This booking has been rejected.' }
  if (!staff.canAssign) return { success: false, message: `${staff.name} is not available for assignment.` }
  if (booking.assigned_staff_id === staff.id) return { success: false, message: `${staff.name} is already assigned to ${booking.service_type}.` }

  const { data: assignedBooking, error } = await supabase
    .from('bookings')
    .update({
      assigned_staff_id: staff.id,
      status: booking.status === 'pending' ? 'approved' : booking.status,
      reviewed_by: managerUserId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', booking.id)
    .in('status', ['pending', 'approved'])
    .select('id,customer_id,service_type,status')
    .maybeSingle()

  if (error || !assignedBooking) {
    return { success: false, message: error?.message || 'This booking cannot be assigned.' }
  }

  await Promise.all([
    supabase
      .from('staff_profiles')
      .update({ current_workload: Number(staff.tasks || 0) + 1, updated_at: new Date().toISOString() })
      .eq('id', staff.id),
    previousStaff && booking.status === 'approved'
      ? supabase
        .from('staff_profiles')
        .update({ current_workload: Math.max(0, Number(previousStaff.tasks || 0) - 1), updated_at: new Date().toISOString() })
        .eq('id', previousStaff.id)
      : Promise.resolve(),
    staff.userId
      ? supabase.from('notifications').insert({
        user_id: staff.userId,
        title: 'New booking assignment',
        message: `${assignedBooking.service_type} has been assigned to you.`,
      })
      : Promise.resolve(),
    booking.status === 'pending' && assignedBooking.customer_id
      ? supabase.from('notifications').insert({
        user_id: assignedBooking.customer_id,
        title: 'Booking approved',
        message: `${assignedBooking.service_type} was approved and assigned to ${staff.name}.`,
      })
      : Promise.resolve(),
    supabase.from('audit_logs').insert({ user_id: managerUserId, action, details: `${staff.name} assigned to ${assignedBooking.service_type}` }),
  ])

  return { success: true, message: `${staff.name} assigned to ${assignedBooking.service_type}.`, assignedBooking }
}

// Used by the manager-editable Weekly Schedule grid: unlike assignStaffToBooking (which only
// ever adds a staff member), this also supports unassigning (staff = null) and changing the
// scheduled date/time, since the grid lets a manager fully rework an existing slot.
export async function updateBookingAssignment({ booking, staff, scheduledDate, scheduledTime, managerUserId, previousStaff }) {
  if (!['pending', 'approved'].includes(booking.status)) {
    return { success: false, message: 'Only pending or approved bookings can be edited.' }
  }
  if (staff && !staff.canAssign) {
    return { success: false, message: `${staff.name} is not available for assignment.` }
  }

  const { data: updatedBooking, error } = await supabase
    .from('bookings')
    .update({
      assigned_staff_id: staff ? staff.id : null,
      status: staff ? (booking.status === 'pending' ? 'approved' : booking.status) : 'pending',
      scheduled_date: scheduledDate || null,
      scheduled_time: scheduledTime || null,
      reviewed_by: managerUserId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', booking.id)
    .in('status', ['pending', 'approved'])
    .select('id,customer_id,service_type,status')
    .maybeSingle()

  if (error || !updatedBooking) {
    return { success: false, message: error?.message || 'This booking could not be updated.' }
  }

  const staffChanged = (staff?.id || null) !== (previousStaff?.id || null)
  const sideEffects = []

  if (staffChanged && staff) {
    sideEffects.push(
      supabase.from('staff_profiles').update({ current_workload: Number(staff.tasks || 0) + 1, updated_at: new Date().toISOString() }).eq('id', staff.id)
    )
  }
  if (staffChanged && previousStaff) {
    sideEffects.push(
      supabase.from('staff_profiles').update({ current_workload: Math.max(0, Number(previousStaff.tasks || 0) - 1), updated_at: new Date().toISOString() }).eq('id', previousStaff.id)
    )
  }
  if (staff?.userId) {
    sideEffects.push(supabase.from('notifications').insert({
      user_id: staff.userId,
      title: staffChanged ? 'New booking assignment' : 'Booking schedule updated',
      message: staffChanged
        ? `${updatedBooking.service_type} has been assigned to you (${scheduledDate} ${scheduledTime}).`
        : `${updatedBooking.service_type} was rescheduled to ${scheduledDate} ${scheduledTime}.`,
    }))
  }
  sideEffects.push(supabase.from('audit_logs').insert({
    user_id: managerUserId,
    action: 'update_booking_schedule',
    details: staff
      ? `${staff.name} scheduled for ${updatedBooking.service_type} at ${scheduledDate} ${scheduledTime}`
      : `${updatedBooking.service_type} unassigned`,
  }))

  await Promise.all(sideEffects)

  return {
    success: true,
    message: staff ? `${staff.name} scheduled for ${updatedBooking.service_type}.` : `${updatedBooking.service_type} unassigned.`,
    assignedBooking: updatedBooking,
  }
}

// Lets a manager create and assign an ad-hoc task that never came in as a customer
// booking (e.g. an unexpected job) directly from the Weekly Schedule grid. creationMethod
// distinguishes the grid's "Manual" tab from its "AI Agent" tab (see schema.sql's
// bookings.creation_method comment), same convention as the department dashboard's task creation.
export async function createManualBooking({ hostAdminId, serviceType, location, latitude, longitude, description, estimatedHours, scheduledDate, scheduledTime, staff, managerUserId, guestName, creationMethod = 'manual' }) {
  if (!staff) return { success: false, message: 'Select a staff member to assign.' }
  if (!staff.canAssign) return { success: false, message: `${staff.name} is not available for assignment.` }
  if (!serviceType || !location) return { success: false, message: 'Service type and location are required.' }

  const { data: createdBooking, error } = await supabase
    .from('bookings')
    .insert({
      host_admin_id: hostAdminId,
      service_type: serviceType,
      location,
      latitude: latitude ?? null,
      longitude: longitude ?? null,
      description: description || null,
      estimated_hours: estimatedHours || 2,
      scheduled_date: scheduledDate || null,
      scheduled_time: scheduledTime || null,
      status: 'approved',
      assigned_staff_id: staff.id,
      reviewed_by: managerUserId,
      guest_name: guestName || null,
      source: 'manager',
      creation_method: creationMethod,
      recommendation_reason: creationMethod === 'ai' ? 'AI-drafted by manager' : 'Manually created by manager',
    })
    .select('id,service_type')
    .single()

  if (error || !createdBooking) {
    return { success: false, message: error?.message || 'This task could not be created.' }
  }

  await Promise.all([
    supabase
      .from('staff_profiles')
      .update({ current_workload: Number(staff.tasks || 0) + 1, updated_at: new Date().toISOString() })
      .eq('id', staff.id),
    staff.userId
      ? supabase.from('notifications').insert({
        user_id: staff.userId,
        title: 'New task assignment',
        message: `${createdBooking.service_type} has been assigned to you.`,
      })
      : Promise.resolve(),
    supabase.from('audit_logs').insert({ user_id: managerUserId, action: 'create_manual_booking', details: `${staff.name} assigned to new task: ${createdBooking.service_type}` }),
  ])

  return { success: true, message: `${staff.name} assigned to ${createdBooking.service_type}.`, createdBooking }
}
