import { minuteBucket, deriveToken } from '../attendanceQr'

const SECRET = 'test-secret-abc123'

test('minuteBucket tracks the current 60-second window and offsets cleanly', () => {
  jest.useFakeTimers()
  jest.setSystemTime(new Date('2026-08-10T09:00:30Z')) // mid-minute
  const current = minuteBucket(0)
  const previous = minuteBucket(-1)
  expect(current - previous).toBe(1)
  jest.useRealTimers()
})

test('deriveToken is deterministic for the same secret + bucket', () => {
  const bucket = 123456
  expect(deriveToken(SECRET, bucket)).toBe(deriveToken(SECRET, bucket))
})

test('deriveToken changes when the bucket (minute) changes', () => {
  const bucket = 123456
  expect(deriveToken(SECRET, bucket)).not.toBe(deriveToken(SECRET, bucket + 1))
})

test('deriveToken changes when the secret is rotated (old tokens invalidated)', () => {
  const bucket = 123456
  expect(deriveToken(SECRET, bucket)).not.toBe(deriveToken('a-new-rotated-secret', bucket))
})

test('a token scanned mid-grace-window is still accepted against current or previous bucket', () => {
  // Simulates the API route's acceptance check: token is valid if it matches
  // either the current minute's token or the previous minute's (grace window).
  const currentBucket = minuteBucket(0)
  const scannedToken = deriveToken(SECRET, currentBucket - 1) // scanned just before the minute rolled over
  const accepted = [deriveToken(SECRET, currentBucket), deriveToken(SECRET, currentBucket - 1)]
  expect(accepted).toContain(scannedToken)
})

test('a token older than the grace window is rejected', () => {
  const currentBucket = minuteBucket(0)
  const staleToken = deriveToken(SECRET, currentBucket - 5)
  const accepted = [deriveToken(SECRET, currentBucket), deriveToken(SECRET, currentBucket - 1)]
  expect(accepted).not.toContain(staleToken)
})
