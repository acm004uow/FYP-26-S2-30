import { fetchSupabaseRows, insertSupabaseRow, insertSupabaseRows } from './supabaseRest'
import { fetchClosuresServer, isDateClosed } from './businessClosures'

const MAX_SERVICE_PERIOD_DAYS = 180 // ~ six months
const MAX_GENERATED_DATES = 60 // safety net; a single week's overlap never gets close to this

function isValidIsoDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function daysBetween(startIso, endIso) {
  const start = new Date(`${startIso}T00:00:00Z`)
  const end = new Date(`${endIso}T00:00:00Z`)
  return Math.round((end.getTime() - start.getTime()) / 86400000)
}

function maxIsoDate(a, b) {
  return a > b ? a : b
}

function minIsoDate(a, b) {
  return a < b ? a : b
}

// Walks every date from start_date to end_date (inclusive) and keeps the ones whose weekday
// (0=Sun..6=Sat, matching JS getUTCDay()) is in days_of_week. Dates are handled entirely in UTC
// arithmetic — same convention as lib/businessWeek.js.
export function expandRecurrenceDates({ start_date, end_date, days_of_week }) {
  const wantedDays = new Set(days_of_week)
  const dates = []
  const cursor = new Date(`${start_date}T00:00:00Z`)
  const end = new Date(`${end_date}T00:00:00Z`)

  while (cursor.getTime() <= end.getTime()) {
    if (wantedDays.has(cursor.getUTCDay())) {
      dates.push(cursor.toISOString().slice(0, 10))
      if (dates.length > MAX_GENERATED_DATES) break
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }

  return dates
}

function validateArgs(args) {
  if (!args.service_type || !args.location) {
    throw new Error('A service type and location are required.')
  }
  if (!isValidIsoDate(args.start_date) || !isValidIsoDate(args.end_date)) {
    throw new Error('A valid service period start and end date are required.')
  }
  if (args.end_date < args.start_date) {
    throw new Error('The service period end date is before its start date.')
  }
  if (daysBetween(args.start_date, args.end_date) > MAX_SERVICE_PERIOD_DAYS) {
    throw new Error(`The service period can be at most ${MAX_SERVICE_PERIOD_DAYS} days.`)
  }

  const daysOfWeek = Array.isArray(args.days_of_week)
    ? [...new Set(args.days_of_week.map(Number))].filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    : []
  if (daysOfWeek.length === 0) {
    throw new Error('Select at least one day of the week for the visits.')
  }

  return { ...args, days_of_week: daysOfWeek }
}

// Used by the customer booking form — runs client-side against the regular (anon-key) Supabase
// client, same as every other insert in that form, so it takes `supabase` as a parameter rather
// than using the service-role REST helpers below (those only work server-side). Just records the
// request — no bookings or staff recommendations are created here; that happens incrementally,
// one week at a time, once a manager has approved it (see generateWeeklyVisits below).
export async function createRecurringBookingRequest(supabase, hostAdminId, customerId, rawArgs) {
  const args = validateArgs(rawArgs)

  const { data, error } = await supabase.from('recurring_bookings').insert({
    host_admin_id: hostAdminId,
    customer_id: customerId,
    service_type: args.service_type,
    location: args.location,
    latitude: args.latitude ?? null,
    longitude: args.longitude ?? null,
    description: args.description || null,
    days_of_week: args.days_of_week,
    scheduled_time: args.scheduled_time || null,
    estimated_hours: args.estimated_hours || 2,
    start_date: args.start_date,
    end_date: args.end_date,
    status: 'pending',
  }).select('id').single()

  if (error) throw new Error(error.message)
  return data
}

// Called from the top of buildScheduleProposal (lib/scheduleProposal.js) so both the weekly
// cron and a manager's manual "build a schedule" chat request pick up recurring bookings the
// same way. For every active recurring booking whose period overlaps `range`, generates the
// missing bookings rows for matching weekdays within the overlap — idempotent (skips dates that
// already have a booking under that recurring_booking_id), so it's safe to call repeatedly for
// the same week. No staff is assigned here; buildScheduleProposal's own recommendation step
// handles that immediately after, same as any other pending booking.
export async function generateWeeklyVisits(hostAdminId, range) {
  const [activeRecurring, closures] = await Promise.all([
    fetchSupabaseRows('recurring_bookings', [
      ['select', 'id,customer_id,service_type,location,latitude,longitude,description,days_of_week,scheduled_time,estimated_hours,start_date,end_date'],
      ['host_admin_id', `eq.${hostAdminId}`],
      ['status', 'eq.active'],
      ['start_date', `lte.${range.end_date}`],
      ['end_date', `gte.${range.start_date}`],
    ]),
    fetchClosuresServer(hostAdminId, range),
  ])

  for (const recurring of activeRecurring) {
    const overlapStart = maxIsoDate(recurring.start_date, range.start_date)
    const overlapEnd = minIsoDate(recurring.end_date, range.end_date)
    if (overlapStart > overlapEnd) continue

    const candidateDates = expandRecurrenceDates({
      start_date: overlapStart,
      end_date: overlapEnd,
      days_of_week: recurring.days_of_week,
    }).filter((date) => !isDateClosed(date, closures))
    if (candidateDates.length === 0) continue

    const existing = await fetchSupabaseRows('bookings', [
      ['select', 'scheduled_date'],
      ['recurring_booking_id', `eq.${recurring.id}`],
      ['scheduled_date', `gte.${overlapStart}`],
      ['scheduled_date', `lte.${overlapEnd}`],
    ])
    const existingDates = new Set(existing.map((row) => row.scheduled_date))
    const missingDates = candidateDates.filter((date) => !existingDates.has(date))
    if (missingDates.length === 0) continue

    await insertSupabaseRows('bookings', missingDates.map((date) => ({
      host_admin_id: hostAdminId,
      customer_id: recurring.customer_id,
      recurring_booking_id: recurring.id,
      source: 'customer',
      creation_method: 'recurring',
      service_type: recurring.service_type,
      location: recurring.location,
      latitude: recurring.latitude,
      longitude: recurring.longitude,
      description: recurring.description,
      scheduled_date: date,
      scheduled_time: recurring.scheduled_time,
      estimated_hours: recurring.estimated_hours,
      status: 'pending',
    })))
  }
}
