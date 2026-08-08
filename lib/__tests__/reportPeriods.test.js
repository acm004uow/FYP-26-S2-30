import { getPeriodRange, getPreviousPeriodRange, getChartWeekDates } from '../reportPeriods'

// Fixed "now": Wednesday 2026-08-05, 15:30 UTC
const NOW = new Date('2026-08-05T15:30:00Z')

beforeEach(() => {
  jest.useFakeTimers()
  jest.setSystemTime(NOW)
})

afterEach(() => {
  jest.useRealTimers()
})

test('daily period is the current UTC day', () => {
  const { start, end } = getPeriodRange('daily', 0)
  expect(start.toISOString()).toBe('2026-08-05T00:00:00.000Z')
  expect(end.toISOString()).toBe('2026-08-06T00:00:00.000Z')
})

test('weekly period starts on Monday-on-or-before today', () => {
  const { start, end } = getPeriodRange('weekly', 0)
  expect(start.toISOString()).toBe('2026-08-03T00:00:00.000Z') // Monday of this week
  expect(end.toISOString()).toBe('2026-08-10T00:00:00.000Z')
})

test('monthly period spans the full calendar month', () => {
  const { start, end } = getPeriodRange('monthly', 0)
  expect(start.toISOString()).toBe('2026-08-01T00:00:00.000Z')
  expect(end.toISOString()).toBe('2026-09-01T00:00:00.000Z')
})

test('getPreviousPeriodRange is exactly one period further back', () => {
  const prevWeekly = getPreviousPeriodRange('weekly', 0)
  expect(prevWeekly.start.toISOString()).toBe('2026-07-27T00:00:00.000Z')
  expect(prevWeekly.end.toISOString()).toBe('2026-08-03T00:00:00.000Z')
})

test('getChartWeekDates returns the Mon-Sun week containing the period start', () => {
  const { start } = getPeriodRange('weekly', 0)
  expect(getChartWeekDates(start)).toEqual([
    '2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06',
    '2026-08-07', '2026-08-08', '2026-08-09',
  ])
})
