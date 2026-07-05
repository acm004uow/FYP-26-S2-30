import { supabase } from './supabaseClient'

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
