// Singapore has no daylight saving (fixed UTC+8 year-round), so "now in SGT" can be
// computed by shifting the instant and reading it back with UTC getters/setters,
// without needing a timezone library.
const SGT_OFFSET_MS = 8 * 60 * 60 * 1000

function toSgt(date) {
  return new Date(date.getTime() + SGT_OFFSET_MS)
}

function addDays(date, days) {
  const d = new Date(date)
  d.setUTCDate(d.getUTCDate() + days)
  return d
}

function mondayOf(sgtDate) {
  const day = sgtDate.getUTCDay() // 0=Sun..6=Sat
  const diff = day === 0 ? -6 : 1 - day
  return addDays(sgtDate, diff)
}

function toIsoDate(date) {
  return date.toISOString().slice(0, 10)
}

export const DEFAULT_CUTOFF = { cutoff_day_of_week: 0, cutoff_time: '14:00' }

// Converts a 0=Sun..6=Sat day-of-week (same convention as recurring_bookings.days_of_week) into
// "days after this week's Monday" (Monday itself = 0, Sunday = 6).
function daysAfterMonday(dayOfWeek) {
  return (dayOfWeek + 6) % 7
}

// Computes the exact cutoff instant (in SGT) for the current calendar week from a
// { cutoff_day_of_week, cutoff_time } setting — e.g. lib/scheduleSettings.js's stored/default value.
function cutoffInstantThisWeek(currentWeekMonday, cutoff) {
  const [hh, mm] = (cutoff.cutoff_time || DEFAULT_CUTOFF.cutoff_time).split(':').map(Number)
  const instant = addDays(currentWeekMonday, daysAfterMonday(cutoff.cutoff_day_of_week ?? DEFAULT_CUTOFF.cutoff_day_of_week))
  instant.setUTCHours(hh, mm || 0, 0, 0)
  return instant
}

export function getMinBookableDate(now = new Date(), cutoff = DEFAULT_CUTOFF) {
  const sgt = toSgt(now)
  const currentWeekMonday = mondayOf(sgt)
  const nextWeekMonday = addDays(currentWeekMonday, 7)
  const cutoffInstant = cutoffInstantThisWeek(currentWeekMonday, cutoff)

  const minMonday = sgt < cutoffInstant ? nextWeekMonday : addDays(nextWeekMonday, 7)
  return toIsoDate(minMonday)
}

// Used by the daily cron (app/api/cron/weekly-schedule/route.js) to decide whether today is the
// day a given business's configured cutoff falls on, and whether its time has passed yet.
export function hasCutoffPassedToday(now = new Date(), cutoff = DEFAULT_CUTOFF) {
  const sgt = toSgt(now)
  const currentWeekMonday = mondayOf(sgt)
  const cutoffInstant = cutoffInstantThisWeek(currentWeekMonday, cutoff)
  const isSameDay = sgt.getUTCFullYear() === cutoffInstant.getUTCFullYear()
    && sgt.getUTCMonth() === cutoffInstant.getUTCMonth()
    && sgt.getUTCDate() === cutoffInstant.getUTCDate()
  return isSameDay && sgt.getTime() >= cutoffInstant.getTime()
}

export function getUpcomingScheduleWeek(now = new Date()) {
  const sgt = toSgt(now)
  const currentWeekMonday = mondayOf(sgt)
  const nextWeekMonday = addDays(currentWeekMonday, 7)
  const weekEnd = addDays(nextWeekMonday, 6)
  return { start_date: toIsoDate(nextWeekMonday), end_date: toIsoDate(weekEnd) }
}
