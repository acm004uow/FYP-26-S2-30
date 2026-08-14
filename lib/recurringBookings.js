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

const MAX_STAFF_PER_VISIT = 50 // sanity cap; a real contract is never remotely close to this

// Day-name -> weekday-number and time-duration conversion is done here in code, not left to the
// AI model, after testing showed gpt-4o-mini unreliable at both: it mapped "Monday-Friday" to
// [0,1,2,3,4] (Sun-Thu) instead of [1,2,3,4,5], treating Monday as day 0 despite an explicit
// "Sunday=0" instruction in the prompt (the far more common Mon=0 convention from date libraries
// apparently won out), and computed wildly wrong estimated_hours from stated time ranges (e.g.
// "7 PM - 9 PM" -> 6 instead of 2). Asking the model only to recognize which day *names* were
// mentioned, and to copy start/end times verbatim in 24-hour format, is a much lower-risk ask than
// arithmetic — see app/api/agent/route.js's create_recurring_contract tool schema.
const DAY_NAME_TO_NUMBER = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4, thur: 4, thurs: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
}

function daysOfWeekFromNames(days) {
  if (!Array.isArray(days)) return []
  return [...new Set(
    days
      .map((day) => DAY_NAME_TO_NUMBER[String(day).trim().toLowerCase()])
      .filter((day) => Number.isInteger(day))
  )]
}

function parseTimeToMinutes(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || '').trim())
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null
  return hours * 60 + minutes
}

// Computes visit length from 24-hour start/end times, wrapping past midnight if end <= start
// (e.g. 22:00 -> 01:00 is a 3-hour visit, not negative).
function estimatedHoursFromTimeRange(startTime, endTime) {
  const startMinutes = parseTimeToMinutes(startTime)
  const endMinutes = parseTimeToMinutes(endTime)
  if (startMinutes == null || endMinutes == null) return null
  const diffMinutes = endMinutes > startMinutes ? endMinutes - startMinutes : (endMinutes + 24 * 60) - startMinutes
  return Math.round((diffMinutes / 60) * 100) / 100
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

  const staffCount = Number.isInteger(Number(args.staff_count)) && Number(args.staff_count) > 0
    ? Math.min(Number(args.staff_count), MAX_STAFF_PER_VISIT)
    : 1

  return { ...args, days_of_week: daysOfWeek, staff_count: staffCount }
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
    staff_count: args.staff_count,
    start_date: args.start_date,
    end_date: args.end_date,
    status: 'pending',
  }).select('id').single()

  if (error) throw new Error(error.message)
  return data
}

// Used by the AI Scheduling Agent chat (app/api/agent/route.js) when a manager describes a new
// contract in natural language (e.g. "ABC Office Tower signed a contract for daily cleaning").
// Runs server-side with the service-role REST helpers, unlike createRecurringBookingRequest
// above. Self-authorized like a manager-created one-off booking (src/actors/manager/bookings/
// BookingsReviewPanel.js#handleCreateBooking) — status starts 'active' immediately, no separate
// review step, since the manager themselves is the one asking for it to exist. If customer_email
// matches an existing customer profile it's linked via customer_id; otherwise the contract is
// recorded against guest_name/guest_contact, same guest pattern already used for one-off bookings
// (a B2B contract customer doesn't necessarily have a portal login).
export async function createManagerRecurringBooking(hostAdminId, managerId, rawArgs) {
  const location = String(rawArgs.location || rawArgs.customer_name || '').trim()
  const estimatedHours = estimatedHoursFromTimeRange(rawArgs.start_time, rawArgs.end_time)
  const args = validateArgs({
    ...rawArgs,
    location,
    days_of_week: daysOfWeekFromNames(rawArgs.days_of_week),
    scheduled_time: rawArgs.start_time || null,
    estimated_hours: estimatedHours,
  })

  const customerName = String(rawArgs.customer_name || '').trim()
  if (!customerName) throw new Error('A customer name is required.')

  const email = String(rawArgs.customer_email || '').trim().toLowerCase()
  let customerId = null
  if (email) {
    const matches = await fetchSupabaseRows('profiles', [
      ['select', 'id'],
      ['role', 'eq.customer'],
      ['email', `eq.${email}`],
      ['limit', '1'],
    ])
    customerId = matches[0]?.id || null
  }

  return insertSupabaseRow('recurring_bookings', {
    host_admin_id: hostAdminId,
    customer_id: customerId,
    guest_name: customerId ? null : customerName,
    guest_contact: customerId ? null : (rawArgs.customer_email || null),
    source: 'manager',
    service_type: args.service_type,
    location: args.location,
    description: args.description || null,
    days_of_week: args.days_of_week,
    scheduled_time: args.scheduled_time || null,
    estimated_hours: args.estimated_hours || 2,
    staff_count: args.staff_count,
    start_date: args.start_date,
    end_date: args.end_date,
    status: 'active',
    reviewed_by: managerId,
    created_by: managerId,
  })
}

// Called from the top of buildScheduleProposal (lib/scheduleProposal.js) so both the weekly
// cron and a manager's manual "build a schedule" chat request pick up recurring bookings the
// same way. For every active recurring booking whose period overlaps `range`, generates the
// missing bookings rows for matching weekdays within the overlap — idempotent (tops each date up
// to staff_count rows rather than skipping it outright, so it's safe to call repeatedly, including
// after staff_count changes). No staff is assigned here; buildScheduleProposal's own recommendation
// step handles that immediately after, same as any other pending booking.
export async function generateWeeklyVisits(hostAdminId, range) {
  const [activeRecurring, closures] = await Promise.all([
    fetchSupabaseRows('recurring_bookings', [
      ['select', 'id,customer_id,guest_name,guest_contact,source,staff_count,service_type,location,latitude,longitude,description,days_of_week,scheduled_time,estimated_hours,start_date,end_date'],
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
    const existingCountByDate = new Map()
    for (const row of existing) {
      existingCountByDate.set(row.scheduled_date, (existingCountByDate.get(row.scheduled_date) || 0) + 1)
    }

    const staffCount = Math.max(1, Number(recurring.staff_count) || 1)
    const rowsToInsert = []
    for (const date of candidateDates) {
      const deficit = staffCount - (existingCountByDate.get(date) || 0)
      for (let i = 0; i < deficit; i++) rowsToInsert.push(date)
    }
    if (rowsToInsert.length === 0) continue

    await insertSupabaseRows('bookings', rowsToInsert.map((date) => ({
      host_admin_id: hostAdminId,
      customer_id: recurring.customer_id,
      guest_name: recurring.guest_name || null,
      guest_contact: recurring.guest_contact || null,
      recurring_booking_id: recurring.id,
      source: recurring.source || 'customer',
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
