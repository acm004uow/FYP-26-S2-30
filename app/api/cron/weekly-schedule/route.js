import { NextResponse } from 'next/server'
import { getUpcomingScheduleWeek, hasCutoffPassedToday } from '../../../../lib/businessWeek'
import { buildScheduleProposal, fetchSupabaseRows, insertSupabaseRow, insertSupabaseRows, patchSupabaseRows, summarizeProposal } from '../../../../lib/scheduleProposal'
import { fetchSchedulingSettingsServer } from '../../../../lib/scheduleSettings'

// Runs daily (see vercel.json) rather than once a week, since each business can configure its own
// weekly cutoff (day + time) via scheduling_settings — this checks every business's cutoff on
// every run and only acts on the day it actually falls on. The date range generated for is always
// "next Monday to Sunday" regardless of which day within the week the cutoff itself lands on.
export async function GET(request) {
  try {
    const secret = process.env.CRON_SECRET
    if (!secret) return NextResponse.json({ error: 'CRON_SECRET is not configured.' }, { status: 500 })

    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${secret}`) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })

    const now = new Date()
    const range = getUpcomingScheduleWeek(now)

    const businesses = await fetchSupabaseRows('profiles', [
      ['select', 'id'],
      ['role', 'eq.system_admin'],
      ['status', 'eq.active'],
      ['business_name', 'not.is.null'],
    ])

    let notified = 0
    const results = []

    for (const business of businesses) {
      const cutoff = await fetchSchedulingSettingsServer(business.id)
      if (!hasCutoffPassedToday(now, cutoff)) {
        results.push({ host_admin_id: business.id, skipped: 'cutoff_not_reached' })
        continue
      }

      // Resets each business's weekly hours-worked counter (staff_profiles.weekly_working_hours,
      // incremented per completed booking — see the staff dashboard's complete-task handler) the
      // moment that business's own weekly cutoff passes, same cadence as schedule generation
      // below. Setting to 0 is naturally idempotent, so no separate guard is needed even if this
      // route is invoked more than once on the cutoff day.
      await patchSupabaseRows('staff_profiles', [['host_admin_id', `eq.${business.id}`]], { weekly_working_hours: 0 })

      const existingProposal = await fetchSupabaseRows('schedule_proposals', [
        ['select', 'id'],
        ['host_admin_id', `eq.${business.id}`],
        ['week_start', `eq.${range.start_date}`],
        ['limit', '1'],
      ])
      if (existingProposal.length > 0) {
        results.push({ host_admin_id: business.id, skipped: 'already_generated' })
        continue
      }

      const proposal = await buildScheduleProposal(business.id, range)
      const needsReview = proposal.some((row) => !row.already_assigned)
      if (!needsReview) {
        results.push({ host_admin_id: business.id, skipped: true })
        continue
      }

      await insertSupabaseRow('schedule_proposals', {
        host_admin_id: business.id,
        week_start: range.start_date,
        week_end: range.end_date,
        proposal,
        status: 'pending',
      })

      const managers = await fetchSupabaseRows('profiles', [
        ['select', 'id'],
        ['role', 'eq.manager'],
        ['status', 'eq.active'],
        ['host_admin_id', `eq.${business.id}`],
      ])

      await insertSupabaseRows('notifications', managers.map((manager) => ({
        user_id: manager.id,
        title: 'Weekly schedule ready for review',
        message: `${summarizeProposal(proposal, range)} Open AI Agent to review and approve.`,
      })))

      notified += managers.length
      results.push({ host_admin_id: business.id, bookings: proposal.length, managers_notified: managers.length })
    }

    return NextResponse.json({ ok: true, week: range, processed: businesses.length, notified, results })
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
