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

export function getMinBookableDate(now = new Date()) {
  const sgt = toSgt(now)
  const currentWeekMonday = mondayOf(sgt)
  const nextWeekMonday = addDays(currentWeekMonday, 7)
  const cutoff = addDays(currentWeekMonday, 6)
  cutoff.setUTCHours(14, 0, 0, 0)

  const minMonday = sgt < cutoff ? nextWeekMonday : addDays(nextWeekMonday, 7)
  return toIsoDate(minMonday)
}

export function getUpcomingScheduleWeek(now = new Date()) {
  const sgt = toSgt(now)
  const currentWeekMonday = mondayOf(sgt)
  const nextWeekMonday = addDays(currentWeekMonday, 7)
  const weekEnd = addDays(nextWeekMonday, 6)
  return { start_date: toIsoDate(nextWeekMonday), end_date: toIsoDate(weekEnd) }
}
