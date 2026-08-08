const { test, expect } = require('@playwright/test')
const fixtures = require('./helpers/fixtures')
const { signIn, getAccessToken } = require('./helpers/db')

// AI-04: when the model returns tool calls for both propose_weekly_schedule and
// create_recurring_contract in the same turn, app/api/agent/route.js must prefer the contract
// call (it already builds and returns the schedule for the covered range itself). Calls the API
// route directly with a manager's real access token (normal signInWithPassword session, not a
// minted/injected one) — no browser/UI needed for what's fundamentally a server-side precedence
// check. The model's real day-name/time-parsing and intent-recognition behavior is out of scope
// here (manual-only, per the coverage map) — e2e/mocks/azure-openai-mock.js always returns the
// same fixed pair of tool calls regardless of the prompt.

const GUEST_NAME = 'AI-ROUTING-TEST Customer'

let ownerClient

test.beforeAll(async () => {
  ownerClient = await signIn(fixtures.companyA.ownerEmail, fixtures.password)
})

test.afterEach(async () => {
  const { data: recurring } = await ownerClient.from('recurring_bookings').select('id')
    .eq('host_admin_id', fixtures.companyA.ownerId).eq('guest_name', GUEST_NAME)
  for (const row of recurring || []) {
    await ownerClient.from('bookings').delete().eq('recurring_booking_id', row.id)
  }
  await ownerClient.from('recurring_bookings').delete()
    .eq('host_admin_id', fixtures.companyA.ownerId).eq('guest_name', GUEST_NAME)
})

test('AI-04: an ambiguous prompt that trips both tools resolves to contract creation', async ({ request }) => {
  const managerClient = await signIn(fixtures.companyA.managerEmail, fixtures.password)
  const token = await getAccessToken(managerClient)
  expect(token).toBeTruthy()

  const response = await request.post('/api/agent', {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      message: 'Ambiguous message that could plausibly match either tool.',
      history: [],
    },
  })

  const body = await response.json()
  if (response.status() !== 200) console.log('AGENT ROUTE ERROR:', response.status(), JSON.stringify(body))
  expect(response.status()).toBe(200)
  expect(body.error).toBeUndefined()
  expect(body.reply).toContain('Created 1 recurring contract')
  expect(body.reply).toContain(GUEST_NAME)
  expect(body.proposal).toBeTruthy()

  const { data: created } = await ownerClient.from('recurring_bookings')
    .select('id,status,source,days_of_week')
    .eq('host_admin_id', fixtures.companyA.ownerId)
    .eq('guest_name', GUEST_NAME)
    .single()
  expect(created.status).toBe('active') // self-authorized, no separate approval step
  expect(created.source).toBe('manager')
  expect(created.days_of_week).toEqual([1]) // monday
})
