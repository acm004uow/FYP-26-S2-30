import { CHECK_IN_LEAD_MINUTES, isTaskCheckInOpen } from '../staffTasks'

const taskAt = (iso) => ({ scheduledStartRaw: iso })

describe('isTaskCheckInOpen', () => {
  test('closed more than the lead time before the scheduled start', () => {
    const now = new Date('2026-08-12T09:00:00')
    const task = taskAt('2026-08-12T09:31:00')
    expect(isTaskCheckInOpen(task, now)).toBe(false)
  })

  test('open exactly at the lead-time boundary', () => {
    const now = new Date('2026-08-12T09:00:00')
    const task = taskAt(`2026-08-12T09:${String(CHECK_IN_LEAD_MINUTES).padStart(2, '0')}:00`)
    expect(isTaskCheckInOpen(task, now)).toBe(true)
  })

  test('open right up to the scheduled start', () => {
    const now = new Date('2026-08-12T09:00:00')
    const task = taskAt('2026-08-12T09:00:00')
    expect(isTaskCheckInOpen(task, now)).toBe(true)
  })

  test('stays open after the scheduled start (a late check-in is still valid)', () => {
    const now = new Date('2026-08-12T10:30:00')
    const task = taskAt('2026-08-12T09:00:00')
    expect(isTaskCheckInOpen(task, now)).toBe(true)
  })

  test('no scheduled time means never open', () => {
    const now = new Date('2026-08-12T09:00:00')
    expect(isTaskCheckInOpen({}, now)).toBe(false)
  })
})
