// Shared Daily/Weekly/Monthly period math for the manager and owner report pages.
// All arithmetic stays in UTC (parse/build with getUTC*/setUTC*) so period boundaries don't
// silently shift by a day in timezones ahead of UTC — see lib/attendance.js for the same rule.

function startOfUtcDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

function mondayOnOrBefore(date) {
  const anchor = startOfUtcDay(date)
  const day = anchor.getUTCDay()
  const diffToMonday = day === 0 ? -6 : 1 - day
  anchor.setUTCDate(anchor.getUTCDate() + diffToMonday)
  return anchor
}

function formatDay(date, withYear = true) {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: withYear ? 'numeric' : undefined, timeZone: 'UTC' })
}

// offset counts whole periods back from the current one (0 = current, 1 = previous, ...).
export function getPeriodRange(reportType, offset = 0) {
  const now = new Date()

  if (reportType === 'daily') {
    const start = startOfUtcDay(now)
    start.setUTCDate(start.getUTCDate() - offset)
    const end = new Date(start)
    end.setUTCDate(end.getUTCDate() + 1)
    return { start, end, label: formatDay(start) }
  }

  if (reportType === 'monthly') {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1))
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1))
    const label = start.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    return { start, end, label }
  }

  // weekly (default)
  const start = mondayOnOrBefore(now)
  start.setUTCDate(start.getUTCDate() - offset * 7)
  const end = new Date(start)
  end.setUTCDate(end.getUTCDate() + 7)
  const lastDay = new Date(end)
  lastDay.setUTCDate(lastDay.getUTCDate() - 1)
  const sameYear = start.getUTCFullYear() === lastDay.getUTCFullYear()
  const label = `${formatDay(start, !sameYear)} – ${formatDay(lastDay)}`
  return { start, end, label }
}

export function getPreviousPeriodRange(reportType, offset = 0) {
  return getPeriodRange(reportType, offset + 1)
}

// The calendar week (Mon-Sun) that contains a given period's start date — used to anchor the
// "completions per day" chart so it tracks whichever period the user has navigated to.
export function getChartWeekDates(periodStart) {
  const monday = mondayOnOrBefore(periodStart)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setUTCDate(monday.getUTCDate() + i)
    return d.toISOString().slice(0, 10)
  })
}
