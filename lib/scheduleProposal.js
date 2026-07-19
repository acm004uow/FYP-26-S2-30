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

  // Continuity: for any booking generated from a recurring booking, prefer whoever worked its
  // most recent past date — collecting every staff member from that date (not just one), since a
  // recurring booking with staff_count > 1 can have several people on the same day. Slot N below
  // draws candidate N from this list, so parallel same-day slots each get a different continuity
  // preference instead of all competing for the same person.
  const recurringIds = [...new Set(bookings.filter((b) => b.recurring_booking_id).map((b) => b.recurring_booking_id))]
  const continuityStaffIds = new Map()
  if (recurringIds.length) {
    const pastAssignments = await fetchSupabaseRows('bookings', [
      ['select', 'recurring_booking_id,assigned_staff_id,scheduled_date'],
      ['recurring_booking_id', `in.(${recurringIds.join(',')})`],
      ['assigned_staff_id', 'not.is.null'],
      ['order', 'scheduled_date.desc'],
    ])
    const latestDateByRecurring = new Map()
    for (const row of pastAssignments) {
      if (!latestDateByRecurring.has(row.recurring_booking_id)) {
        latestDateByRecurring.set(row.recurring_booking_id, row.scheduled_date)
      }
      if (row.scheduled_date === latestDateByRecurring.get(row.recurring_booking_id)) {
        const list = continuityStaffIds.get(row.recurring_booking_id) || []
        list.push(row.assigned_staff_id)
        continuityStaffIds.set(row.recurring_booking_id, list)
      }
    }
  }

  // Tracks, per (recurring_booking_id, scheduled_date), which staff have already been used by an
  // earlier slot in this same batch — so a recurring booking with staff_count > 1 gets distinct
  // people per day instead of the same top match repeated for every slot.
  const slotStateByKey = new Map()
  function getSlotState(key) {
    if (!slotStateByKey.has(key)) slotStateByKey.set(key, { used: new Set(), slotIndex: 0 })
    return slotStateByKey.get(key)
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

    const slotKey = booking.recurring_booking_id ? `${booking.recurring_booking_id}|${booking.scheduled_date}` : null
    const slotState = slotKey ? getSlotState(slotKey) : null

    if (booking.assigned_staff_id) {
      slotState?.used.add(booking.assigned_staff_id)
      return {
        ...base,
        already_assigned: true,
        recommended_staff_id: booking.assigned_staff_id,
        recommended_staff_name: booking.staff_profiles?.staff_name || 'Assigned staff',
        score: null,
        reason: 'Already scheduled',
      }
    }

    const excludedStaffIds = getExcludedStaffIdsForDate(booking.scheduled_date, approvedTimeOff)
    let preferredStaffId = null
    if (slotState) {
      for (const id of slotState.used) excludedStaffIds.add(id)
      const continuityList = continuityStaffIds.get(booking.recurring_booking_id) || []
      preferredStaffId = continuityList[slotState.slotIndex] || null
      slotState.slotIndex += 1
    }

    const recommendations = generateRecommendations(
      staffRows,
      {
        required_skill: booking.service_type,
        location: booking.location,
        estimated_hours: booking.estimated_hours,
        requested_text: `${booking.description || ''} ${booking.notes || ''}`,
        preferred_staff_id: preferredStaffId,
      },
      params,
      excludedStaffIds
    )
    const topMatch = recommendations[0]
    if (topMatch) slotState?.used.add(topMatch.staff_id)
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
