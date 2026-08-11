// Dates are kept entirely in UTC arithmetic (parse with a "Z" suffix, use getUTC*/setUTC*).
// Mixing local-time parsing with .toISOString() (always UTC) would silently shift every
// date back a day for any timezone ahead of UTC — e.g. Singapore (UTC+8). Shared by every
// weekly-grid view (src/actors/manager/schedule, src/actors/manager/ai-agent) so they can
// never disagree about which dates belong to "this week".
export function getWeekDates(anchorIso) {
  const anchor = new Date(`${anchorIso}T00:00:00Z`)
  const day = anchor.getUTCDay()
  const diffToMonday = day === 0 ? -6 : 1 - day
  const monday = new Date(anchor)
  monday.setUTCDate(anchor.getUTCDate() + diffToMonday)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setUTCDate(monday.getUTCDate() + i)
    return d.toISOString().slice(0, 10)
  })
}

export function shiftWeek(anchorIso, days) {
  const d = new Date(`${anchorIso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function formatTime12h(time) {
  if (!time) return ''
  const [h, m] = time.split(':').map(Number)
  if (Number.isNaN(h)) return time
  const period = h >= 12 ? 'PM' : 'AM'
  const hour12 = h % 12 || 12
  return m ? `${hour12}:${String(m).padStart(2, '0')}${period.toLowerCase()}` : `${hour12}${period.toLowerCase()}`
}
