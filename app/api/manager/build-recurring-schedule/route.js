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

// Called right after a manager approves a recurring booking request (see
// BookingsReviewPanel.js#handleReviewRecurring), or on demand via the "Build & Review Staff"
// button on an already-active one, so its visits — and their AI staff recommendations — show up
// immediately in a review drawer the manager can bulk-approve from, instead of only trickling in
// as the daily cron reaches this business's weekly cutoff each week. Covers the recurring
// booking's *entire remaining period* (clamped to today if it already started), not just the next
// week — the manager approved the whole period in one shot, so reviewing it should show the whole
// thing in one shot too. generateWeeklyVisits (lib/recurringBookings.js) is idempotent and caps at
// MAX_GENERATED_DATES, so calling this repeatedly (e.g. re-clicking "Build & Review Staff" later)
// is safe and just tops up whatever's missing.
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
      ['select', 'id,host_admin_id,status,service_type,start_date,end_date'],
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
    const start_date = maxIsoDate(today, recurring.start_date)
    const end_date = recurring.end_date

    if (start_date > end_date) {
      return NextResponse.json({ generated: false, message: 'This recurring booking does not have any visits scheduled yet.' })
    }

    // buildScheduleProposal returns every pending/approved booking for the business in this date
    // range, not just this recurring booking's — narrow it down before handing it back, since the
    // manager's review drawer (and its "Approve All") must only ever touch visits belonging to the
    // recurring booking they just approved.
    const fullProposal = await buildScheduleProposal(managerProfile.host_admin_id, { start_date, end_date })
    const proposal = fullProposal.filter((row) => row.recurring_booking_id === recurring_booking_id)
    return NextResponse.json({
      generated: true,
      proposal,
      range: { start_date, end_date },
      service_type: recurring.service_type,
    })
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
