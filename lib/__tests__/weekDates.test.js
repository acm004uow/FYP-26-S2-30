import { getWeekDates, shiftWeek, formatTime12h } from '../weekDates'

describe('getWeekDates', () => {
  test('Monday anchor returns itself as the first date', () => {
    expect(getWeekDates('2026-08-17')).toEqual([
      '2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20', '2026-08-21', '2026-08-22', '2026-08-23',
    ])
  })

  test('Sunday anchor wraps back to the preceding Monday, not forward', () => {
    expect(getWeekDates('2026-08-23')).toEqual([
      '2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20', '2026-08-21', '2026-08-22', '2026-08-23',
    ])
  })

  test('mid-week anchor (Wednesday) resolves to the same Monday-start week', () => {
    expect(getWeekDates('2026-08-19')).toEqual([
      '2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20', '2026-08-21', '2026-08-22', '2026-08-23',
    ])
  })

  test('week spanning a month boundary', () => {
    expect(getWeekDates('2026-08-31')).toEqual([
      '2026-08-31', '2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05', '2026-09-06',
    ])
  })

  test('week spanning a year boundary', () => {
    expect(getWeekDates('2026-12-31')).toEqual([
      '2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03',
    ])
  })
})

describe('shiftWeek', () => {
  test('shifts forward by 7 days', () => {
    expect(shiftWeek('2026-08-17', 7)).toBe('2026-08-24')
  })

  test('shifts backward by 7 days', () => {
    expect(shiftWeek('2026-08-17', -7)).toBe('2026-08-10')
  })

  test('shifts backward across a year boundary', () => {
    expect(shiftWeek('2027-01-02', -7)).toBe('2026-12-26')
  })

  test('shifts forward across a year boundary', () => {
    expect(shiftWeek('2026-12-29', 7)).toBe('2027-01-05')
  })
})

describe('formatTime12h', () => {
  test('formats a plain hour with no minutes', () => {
    expect(formatTime12h('09:00')).toBe('9am')
  })

  test('formats an hour with minutes', () => {
    expect(formatTime12h('14:30')).toBe('2:30pm')
  })

  test('handles midnight and noon', () => {
    expect(formatTime12h('00:00')).toBe('12am')
    expect(formatTime12h('12:00')).toBe('12pm')
  })

  test('returns empty string for missing input', () => {
    expect(formatTime12h('')).toBe('')
    expect(formatTime12h(null)).toBe('')
  })
})
