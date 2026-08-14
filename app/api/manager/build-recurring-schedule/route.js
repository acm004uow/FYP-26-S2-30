import { NextResponse } from 'next/server'
import { buildScheduleProposal, fetchSupabaseRows, getSupabaseConfig } from '../../../../lib/scheduleProposal'

async function getManagerProfile(token) {
  if (!token) return null
  const { url, key } = getSupabaseConfig()
  const userResponse = await fetch(`${url}/auth/v1/user`, {
    cache: 'no-store',
    headers: { apikey: key, Authorization: `Bearer ${token}` },
  })
  const userData = await userResponse.json().catch(() => null)
  const userId = userResponse.ok ? userData?.id || null : null
  if (!userId) return null

  const profiles = await fetchSupabaseRows('profiles', [
    ['select', 'id,role,status,host_admin_id'],
    ['id', `eq.${userId}`],
    ['limit', '1'],
  ])
  return profiles[0] || null
}

function maxIsoDate(a, b) {
  return a > b ? a : b
}

function minIsoDate(a, b) {
  return a < b ? a : b
}

// Called right after a manager approves a recurring booking request (see
// BookingsReviewPanel.js#handleReviewRecurring) so its first upcoming visits — and their AI staff
// recommendations — show up immediately in Bookings for Review, instead of only appearing once the
// daily cron next reaches this business's weekly cutoff (which could be days away). Deliberately
// only builds today-through-7-days-out (same default window used by the AI Scheduling Agent's
// propose_weekly_schedule, see app/api/agent/route.js#defaultDateRange), not the whole recurring
// period — visits still get generated incrementally, one week at a time, matching the existing
// architecture (see lib/recurringBookings.js#generateWeeklyVisits).
export async function POST(request) {
  try {
    const { recurring_booking_id } = await request.json()
    if (!recurring_booking_id) return NextResponse.json({ error: 'recurring_booking_id is required.' }, { status: 400 })

    const token = request.headers.get('authorization')?.replace('Bearer ', '')
    const managerProfile = await getManagerProfile(token)
    if (!managerProfile) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })
    if (!['manager', 'system_admin'].includes(managerProfile.role) || managerProfile.status !== 'active' || !managerProfile.host_admin_id) {
      return NextResponse.json({ error: 'Only an active manager or owner can build a schedule.' }, { status: 403 })
    }

    const recurringRows = await fetchSupabaseRows('recurring_bookings', [
      ['select', 'id,host_admin_id,status,start_date,end_date'],
      ['id', `eq.${recurring_booking_id}`],
      ['limit', '1'],
    ])
    const recurring = recurringRows[0]
    if (!recurring || recurring.host_admin_id !== managerProfile.host_admin_id) {
      return NextResponse.json({ error: 'Recurring booking not found.' }, { status: 404 })
    }
    if (recurring.status !== 'active') {
      return NextResponse.json({ error: 'This recurring booking is not active.' }, { status: 400 })
    }

    const today = new Date().toISOString().slice(0, 10)
    const weekOut = new Date()
    weekOut.setDate(weekOut.getDate() + 7)
    const start_date = maxIsoDate(today, recurring.start_date)
    const end_date = minIsoDate(weekOut.toISOString().slice(0, 10), recurring.end_date)

    if (start_date > end_date) {
      return NextResponse.json({ generated: false, message: 'This recurring booking does not have any visits in the next 7 days yet.' })
    }

    const proposal = await buildScheduleProposal(managerProfile.host_admin_id, { start_date, end_date })
    return NextResponse.json({ generated: true, proposal, range: { start_date, end_date } })
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
