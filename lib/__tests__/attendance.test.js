import { getAttendanceStatus, shiftDate, formatDuration, ATTENDANCE_WINDOW_MINUTES } from '../attendance'

// getScheduledDateTime() builds "${date}T${time}:00" WITHOUT a "Z" suffix, so it's parsed in the
// runtime's local timezone, not UTC (unlike lib/businessWeek.js and lib/attendance.js's own
// shiftDate, which are deliberately UTC-safe). Comparison times below are written the same way
// (no "Z") so the test is correct regardless of which timezone it runs in.
test('check-in exactly on the scheduled time is present', () => {
  const checkIn = new Date('2026-08-10T09:00:00')
  expect(getAttendanceStatus('2026-08-10', '09:00', checkIn)).toBe('present')
})

test('check-in at the edge of the window (5 minutes) is still present', () => {
  const checkIn = new Date(`2026-08-10T09:0${ATTENDANCE_WINDOW_MINUTES}:00`)
  expect(getAttendanceStatus('2026-08-10', '09:00', checkIn)).toBe('present')
})

test('check-in just past the window is late', () => {
  const checkIn = new Date('2026-08-10T09:05:01')
  expect(getAttendanceStatus('2026-08-10', '09:00', checkIn)).toBe('late')
})

test('missing scheduled date returns null rather than throwing', () => {
  expect(getAttendanceStatus(null, '09:00', new Date())).toBeNull()
})

test('shiftDate stays UTC-safe across a month boundary', () => {
  expect(shiftDate('2026-08-31', 1)).toBe('2026-09-01')
  expect(shiftDate('2026-09-01', -1)).toBe('2026-08-31')
})

test('formatDuration formats hours and minutes, and rejects negative/invalid input', () => {
  expect(formatDuration(90 * 60000)).toBe('1h 30m')
  expect(formatDuration(45 * 60000)).toBe('45m')
  expect(formatDuration(-5)).toBe('0m')
  expect(formatDuration(NaN)).toBe('0m')
})
