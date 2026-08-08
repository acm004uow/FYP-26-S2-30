import { expandRecurrenceDates } from '../recurringBookings'

test('Monday-Friday maps to weekday numbers 1-5, not 0-4', () => {
  const dates = expandRecurrenceDates({
    start_date: '2026-08-03', end_date: '2026-08-09', // one full week
    days_of_week: [1, 2, 3, 4, 5],
  })
  // regression guard for the exact off-by-one the AI model produced — see REC-04
  expect(dates).toEqual(['2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06', '2026-08-07'])
})
