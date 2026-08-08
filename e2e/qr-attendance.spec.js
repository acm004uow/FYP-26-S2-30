const crypto = require('crypto')
const { test, expect } = require('@playwright/test')
const fixtures = require('./helpers/fixtures')
const { signIn, getAccessToken } = require('./helpers/db')

// ATT-02..07 — office QR clock-in/out (app/api/attendance/check-in, qr-token). Hits the API
// directly rather than through a real camera/jsQR scan (that part stays manual, per the coverage
// map) — the interesting logic (grace window, expiry, toggle, idempotency, rotation) lives
// entirely in the token math and the route, both reachable without one.
//
// minuteBucket/deriveToken are duplicated from lib/attendanceQr.js rather than imported: that file
// uses ESM `export`, which a plain CommonJS `require()` here can't load without a transpile step
// Next.js normally provides. Already covered independently by lib/__tests__/attendanceQr.test.js —
// this is just reusing the same two-line formula to construct request payloads.
function minuteBucket(offset = 0) {
  return Math.floor(Date.now() / 60000) + offset
}
function deriveToken(secret, bucket) {
  return crypto.createHmac('sha256', secret).update(String(bucket)).digest('hex').slice(0, 16)
}

let ownerToken
let staffToken
let secret

test.beforeAll(async () => {
  const ownerClient = await signIn(fixtures.companyA.ownerEmail, fixtures.password)
  ownerToken = await getAccessToken(ownerClient)
  const staffClient = await signIn(fixtures.companyA.staff.email, fixtures.password)
  staffToken = await getAccessToken(staffClient)
})

test.beforeEach(async ({ request }) => {
  // Fresh secret + a clean attendance_records slate for today, so every test starts from "not
  // clocked in yet" regardless of what earlier runs left behind.
  const rotate = await request.post('/api/attendance/qr-token', { headers: { Authorization: `Bearer ${ownerToken}` } })
  expect(rotate.status()).toBe(200)
  const ownerClient = await signIn(fixtures.companyA.ownerEmail, fixtures.password)
  const { data } = await ownerClient.from('profiles').select('attendance_qr_token').eq('id', fixtures.companyA.ownerId).single()
  secret = data.attendance_qr_token
  await ownerClient.from('attendance_records').delete().eq('profile_id', fixtures.companyA.staff.userId)
})

async function checkIn(request, token) {
  return request.post('/api/attendance/check-in', {
    headers: { Authorization: `Bearer ${staffToken}` },
    data: { token },
  })
}

test('ATT-02: scanning a current token clocks the staff member in', async ({ request }) => {
  const response = await checkIn(request, deriveToken(secret, minuteBucket()))
  expect(response.status()).toBe(200)
  const body = await response.json()
  expect(body.status).toBe('clocked_in')
  expect(body.record.clocked_in_at).toBeTruthy()
  expect(body.record.clocked_out_at).toBeFalsy()
})

test('ATT-03: the previous minute\'s token is still accepted (grace window)', async ({ request }) => {
  const response = await checkIn(request, deriveToken(secret, minuteBucket(-1)))
  expect(response.status()).toBe(200)
  const body = await response.json()
  expect(body.status).toBe('clocked_in')
})

test('ATT-04: a token older than the grace window is rejected', async ({ request }) => {
  const response = await checkIn(request, deriveToken(secret, minuteBucket(-5)))
  expect(response.status()).toBe(400)
  const body = await response.json()
  expect(body.error).toMatch(/invalid or expired/i)
})

test('ATT-05 & ATT-06: scanning again clocks out; a third scan is an idempotent no-op', async ({ request }) => {
  const first = await checkIn(request, deriveToken(secret, minuteBucket()))
  expect((await first.json()).status).toBe('clocked_in')

  const second = await checkIn(request, deriveToken(secret, minuteBucket()))
  const secondBody = await second.json()
  expect(secondBody.status).toBe('clocked_out')
  expect(secondBody.record.clocked_in_at).toBeTruthy()
  expect(secondBody.record.clocked_out_at).toBeTruthy()

  const third = await checkIn(request, deriveToken(secret, minuteBucket()))
  const thirdBody = await third.json()
  expect(thirdBody.status).toBe('already_completed')
  expect(thirdBody.record.clocked_out_at).toBe(secondBody.record.clocked_out_at) // unchanged, not re-toggled
})

test('ATT-07: rotating the secret invalidates every token derived from the old one', async ({ request }) => {
  const staleToken = deriveToken(secret, minuteBucket())

  const rotate = await request.post('/api/attendance/qr-token', { headers: { Authorization: `Bearer ${ownerToken}` } })
  expect(rotate.status()).toBe(200)

  const response = await checkIn(request, staleToken)
  expect(response.status()).toBe(400)
})
