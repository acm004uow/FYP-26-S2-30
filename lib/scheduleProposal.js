import { generateRecommendations } from './recommendationEngine'
import { fetchSupabaseRows } from './supabaseRest'
import { generateWeeklyVisits } from './recurringBookings'
import { fetchApprovedTimeOffServer, getExcludedStaffIdsForDate } from './staffTimeOff'

export * from './supabaseRest'

export async function buildScheduleProposal(hostAdminId, { start_date, end_date }) {
  // Generate this week's visits for any active recurring bookings before querying — see
  // lib/recurringBookings.js#generateWeeklyVisits. Idempotent, so safe on every call.
  await generateWeeklyVisits(hostAdminId, { start_date, end_date })

  const [bookings, staffRows, systemParamsRows, approvedTimeOff] = await Promise.all([
    fetchSupabaseRows('bookings', [
      ['select', 'id,service_type,location,scheduled_date,scheduled_time,estimated_hours,status,assigned_staff_id,description,notes,recurring_booking_id,staff_profiles(staff_name)'],
      ['host_admin_id', `eq.${hostAdminId}`],
      ['status', 'in.(pending,approved)'],
      ['scheduled_date', `gte.${start_date}`],
      ['scheduled_date', `lte.${end_date}`],
      ['order', 'scheduled_date.asc'],
      ['limit', '100'],
    ]),
    fetchSupabaseRows('staff_profiles', [
      ['select', 'id,staff_name,skills,assigned_region,availability,current_workload,weekly_working_hours,max_weekly_hours,performance_rating,status,is_suspended'],
      ['host_admin_id', `eq.${hostAdminId}`],
      ['is_suspended', 'eq.false'],
      ['status', 'eq.active'],
      ['limit', '100'],
    ]),
    fetchSupabaseRows('system_parameters', [
      ['select', '*'],
      ['id', 'eq.1'],
      ['limit', '1'],
    ]),
    fetchApprovedTimeOffServer(hostAdminId),
  ])

  const params = systemParamsRows[0] || {}

  // Continuity: for any booking generated from a recurring booking, prefer whoever was
  // assigned most recently under that same recurring_booking_id (one batched query covering
  // every recurring booking in this proposal, not one query per booking).
  const recurringIds = [...new Set(bookings.filter((b) => b.recurring_booking_id).map((b) => b.recurring_booking_id))]
  const continuityStaffId = new Map()
  if (recurringIds.length) {
    const pastAssignments = await fetchSupabaseRows('bookings', [
      ['select', 'recurring_booking_id,assigned_staff_id,scheduled_date'],
      ['recurring_booking_id', `in.(${recurringIds.join(',')})`],
      ['assigned_staff_id', 'not.is.null'],
      ['order', 'scheduled_date.desc'],
    ])
    for (const row of pastAssignments) {
      if (!continuityStaffId.has(row.recurring_booking_id)) {
        continuityStaffId.set(row.recurring_booking_id, row.assigned_staff_id)
      }
    }
  }

  return bookings.map((booking) => {
    const base = {
      booking_id: booking.id,
      service_type: booking.service_type,
      location: booking.location,
      scheduled_date: booking.scheduled_date,
      scheduled_time: booking.scheduled_time,
      estimated_hours: booking.estimated_hours,
      status: booking.status,
      recurring_booking_id: booking.recurring_booking_id || null,
    }

    if (booking.assigned_staff_id) {
      return {
        ...base,
        already_assigned: true,
        recommended_staff_id: booking.assigned_staff_id,
        recommended_staff_name: booking.staff_profiles?.staff_name || 'Assigned staff',
        score: null,
        reason: 'Already scheduled',
      }
    }

    const recommendations = generateRecommendations(
      staffRows,
      {
        required_skill: booking.service_type,
        location: booking.location,
        estimated_hours: booking.estimated_hours,
        requested_text: `${booking.description || ''} ${booking.notes || ''}`,
        preferred_staff_id: booking.recurring_booking_id ? continuityStaffId.get(booking.recurring_booking_id) : null,
      },
      params,
      getExcludedStaffIdsForDate(booking.scheduled_date, approvedTimeOff)
    )
    const topMatch = recommendations[0]
    return {
      ...base,
      already_assigned: false,
      recommended_staff_id: topMatch?.staff_id || null,
      recommended_staff_name: topMatch?.staff_name || null,
      score: topMatch?.score ?? 0,
      reason: topMatch?.reason || 'No suitable staff found',
    }
  })
}

export function summarizeProposal(proposal, range) {
  if (proposal.length === 0) {
    return `No bookings were found between ${range.start_date} and ${range.end_date}.`
  }
  const alreadyAssigned = proposal.filter((row) => row.already_assigned).length
  const needsApproval = proposal.length - alreadyAssigned

  if (needsApproval === 0) {
    return `This week (${range.start_date} to ${range.end_date}) has ${proposal.length} booking${proposal.length === 1 ? '' : 's'}, all already scheduled — review below or reassign if needed.`
  }
  if (alreadyAssigned === 0) {
    return `Found ${proposal.length} booking${proposal.length === 1 ? '' : 's'} between ${range.start_date} and ${range.end_date}, none assigned yet — review the recommendations below.`
  }
  return `This week (${range.start_date} to ${range.end_date}) has ${proposal.length} bookings: ${alreadyAssigned} already scheduled, ${needsApproval} need${needsApproval === 1 ? 's' : ''} approval — review below.`
}
