import { getMinBookableDate, hasCutoffPassedToday, DEFAULT_CUTOFF } from '../businessWeek'

// Default cutoff: Sunday 14:00 SGT (06:00 UTC)
test('booking just before Sunday cutoff opens next week only', () => {
  const before = new Date('2026-08-09T05:59:00Z') // Sun 13:59 SGT
  expect(hasCutoffPassedToday(before, DEFAULT_CUTOFF)).toBe(false)
})

test('booking just after Sunday cutoff pushes to the week after', () => {
  const after = new Date('2026-08-09T06:01:00Z') // Sun 14:01 SGT
  expect(hasCutoffPassedToday(after, DEFAULT_CUTOFF)).toBe(true)
  expect(getMinBookableDate(after, DEFAULT_CUTOFF)).toBe('2026-08-17') // the Monday after next
})
