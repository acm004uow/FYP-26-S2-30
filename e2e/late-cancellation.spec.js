const { test, expect } = require('@playwright/test')
const fixtures = require('./helpers/fixtures')
const { signIn, todayIso } = require('./helpers/db')

// Uses a dedicated customer account (fixtures.companyA.lockableCustomer*), not the shared one, and
// logs in fresh via the UI rather than e2e/.auth/customer.json: this test locks the account it
// cancels with, and Layout.js's status guard bounces *any* open session for that profile row the
// moment it locks — including customer-booking.spec.js's session, if it were the same account and
// happened to run concurrently. The afterAll hook restores the account either way, so a lock never
// leaks into another test run even if this one fails partway through.

let ownerClient
let bookingIds = []

test.beforeAll(async () => {
  ownerClient = await signIn(fixtures.companyA.ownerEmail, fixtures.password)
  // Known baseline, in case a previous run was interrupted before its own cleanup ran.
  await ownerClient.from('profiles').update({ status: 'active', late_cancellation_count: 0 }).eq('id', fixtures.companyA.lockableCustomerId)

  const base = {
    host_admin_id: fixtures.companyA.ownerId,
    customer_id: fixtures.companyA.lockableCustomerId,
    service_type: 'Home Cleaning',
    status: 'approved',
    scheduled_date: todayIso(0),
    scheduled_time: '00:00', // always "within 24h" (often already past) regardless of when the suite runs
  }

  const { data: b1 } = await ownerClient.from('bookings').insert({ ...base, location: 'E2E-LATE-1, Singapore' }).select('id').single()
  const { data: b2 } = await ownerClient.from('bookings').insert({ ...base, location: 'E2E-LATE-2, Singapore' }).select('id').single()
  bookingIds = [b1.id, b2.id]
})

test.afterAll(async () => {
  if (bookingIds.length) await ownerClient.from('bookings').delete().in('id', bookingIds)
  await ownerClient.from('profiles').update({ status: 'active', late_cancellation_count: 0 }).eq('id', fixtures.companyA.lockableCustomerId)
})

async function loginAsCustomer(page) {
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(fixtures.companyA.lockableCustomerEmail)
  await page.locator('input[type="password"]').fill(fixtures.password)
  await page.getByRole('button', { name: 'Log in' }).click()
  await page.waitForURL(/\/customer/)
  // Landing on /customer only means the URL changed — AuthUserContext's session/user still
  // settles a beat after that. Clicking Cancel before it does silently drops the strike-count
  // update (the bookings PATCH still fires, but the follow-up profiles read+write never does) —
  // reproduced consistently without this pause, gone consistently with it.
  await page.waitForTimeout(1000)
}

async function cancelBooking(page, location) {
  // Search narrows the list to exactly this booking, so the row locator below can't accidentally
  // match a container div wrapping several bookings (and several Cancel buttons) at once.
  await page.getByPlaceholder('Search by service, ID, or address...').fill(location)
  const row = page.locator('div.p-4.border-b', { hasText: location })
  await expect(row).toBeVisible()
  await row.getByRole('button', { name: 'Cancel' }).click()
  const confirmButton = page.getByRole('button', { name: 'Yes, Cancel Booking' })
  await expect(confirmButton).toBeVisible()
  await page.waitForTimeout(500)
  await confirmButton.click()
  await page.waitForTimeout(1500) // let performCancel's full async chain (bookings, audit log, profiles) finish
}

test('CUST-09 & MGR-08: two late cancellations lock the account, then a manager unlocks it', async ({ page, context, browser }) => {
  const customerPage = page
  await loginAsCustomer(customerPage)

  // First late cancellation: one strike, account stays active.
  await cancelBooking(customerPage, 'E2E-LATE-1')
  await expect(customerPage).toHaveURL(/\/customer/)
  const { data: afterFirst } = await ownerClient.from('profiles').select('status,late_cancellation_count').eq('id', fixtures.companyA.lockableCustomerId).single()
  expect(afterFirst.status).toBe('active')
  expect(afterFirst.late_cancellation_count).toBe(1)

  // Second late cancellation: reaches the threshold — signed out and redirected to /login?locked=1.
  await cancelBooking(customerPage, 'E2E-LATE-2')
  await customerPage.waitForURL(/\/login\?locked=1/)
  await expect(customerPage.getByText(/locked after repeated last-minute/i)).toBeVisible()
  await context.close()

  const { data: lockedProfile } = await ownerClient.from('profiles').select('status,late_cancellation_count').eq('id', fixtures.companyA.lockableCustomerId).single()
  expect(lockedProfile.status).toBe('locked')
  expect(lockedProfile.late_cancellation_count).toBe(2)

  // Locked customer can no longer log in.
  const relockAttempt = await browser.newContext()
  const relockPage = await relockAttempt.newPage()
  await relockPage.goto('/login')
  await relockPage.locator('input[type="email"]').fill(fixtures.companyA.lockableCustomerEmail)
  await relockPage.locator('input[type="password"]').fill(fixtures.password)
  await relockPage.getByRole('button', { name: 'Log in' }).click()
  await expect(relockPage.getByText(/locked after repeated last-minute/i)).toBeVisible()
  await relockAttempt.close()

  // Manager unlocks the account from Manager > Customers.
  const managerContext = await browser.newContext({ storageState: 'e2e/.auth/manager.json' })
  const managerPage = await managerContext.newPage()
  await managerPage.goto('/manager-customers')
  const customerCard = managerPage.locator('div.rounded-xl.border.p-4', { hasText: fixtures.companyA.lockableCustomerEmail })
  await customerCard.getByRole('button', { name: 'Unlock' }).click()
  await managerPage.getByRole('button', { name: 'Unlock Account' }).click()
  await expect(managerPage.getByText(/unlocked/i)).toBeVisible()
  await managerContext.close()

  const { data: unlockedProfile } = await ownerClient.from('profiles').select('status,late_cancellation_count').eq('id', fixtures.companyA.lockableCustomerId).single()
  expect(unlockedProfile.status).toBe('active')
  expect(unlockedProfile.late_cancellation_count).toBe(0)
})
