import { NextResponse } from 'next/server'
import { getUpcomingScheduleWeek } from '../../../../lib/businessWeek'
import { buildScheduleProposal, fetchSupabaseRows, insertSupabaseRow, insertSupabaseRows, summarizeProposal } from '../../../../lib/scheduleProposal'

export async function GET(request) {
  try {
    const secret = process.env.CRON_SECRET
    if (!secret) return NextResponse.json({ error: 'CRON_SECRET is not configured.' }, { status: 500 })

    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${secret}`) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })

    const range = getUpcomingScheduleWeek()

    const businesses = await fetchSupabaseRows('profiles', [
      ['select', 'id'],
      ['role', 'eq.system_admin'],
      ['status', 'eq.active'],
      ['business_name', 'not.is.null'],
    ])

    let notified = 0
    const results = []

    for (const business of businesses) {
      const proposal = await buildScheduleProposal(business.id, range)
      if (proposal.length === 0) {
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
