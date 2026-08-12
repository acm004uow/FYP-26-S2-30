const { test, expect } = require('@playwright/test')
const fixtures = require('./helpers/fixtures')
const { signIn } = require('./helpers/db')

test.use({ storageState: 'e2e/.auth/customer.json' })

// These tests submit real bookings/recurring-booking-requests through the UI (that's the point —
// it exercises the actual insert path), so unlike the other specs they can't pre-seed and delete
// by a known id. Track what each test creates and delete it in afterEach, so repeated runs don't
// pile up pending recurring_bookings that later collide with manager-bookings.spec.js's "Approve"
// button (an exact-text match against every pending recurring request's own Approve button too).
let ownerClient
let createdBookingIds = []
let createdRecurringBookingIds = []

test.beforeAll(async () => {
  ownerClient = await signIn(fixtures.companyA.ownerEmail, fixtures.password)
})

test.afterEach(async () => {
  if (createdBookingIds.length) await ownerClient.from('bookings').delete().in('id', createdBookingIds)
  if (createdRecurringBookingIds.length) await ownerClient.from('recurring_bookings').delete().in('id', createdRecurringBookingIds)
  createdBookingIds = []
  createdRecurringBookingIds = []
})

// Postal code lookup hits the real OneMap (Singapore gov) API — give it a moment, then fall back
// to typing block/street manually if it didn't resolve, so the test never depends on external
// network timing to produce a valid composedLocation.
async function fillAddress(page) {
  await page.getByPlaceholder('e.g. 129588').fill('018956')
  await page.waitForTimeout(2500)
  const blockInput = page.getByPlaceholder('e.g. 693')
  if (!(await blockInput.inputValue())) {
    await blockInput.fill('1')
    await page.getByPlaceholder('e.g. Hougang Street 61').fill('Raffles Place')
  }
}

// Step 1 -> Step 2: picking a service card directly (rather than the free-text "Find matching
// companies" path) keeps the test deterministic and independent of the OpenAI-backed parse API.
// Two companies share every seeded category, so Step 2's card is targeted by its accessible group
// name (exact match — "E2E Test Co" is otherwise a substring of "E2E Test Co B").
async function selectCompanyA(page) {
  await page.goto('/customer-book')
  await page.getByRole('button', { name: 'Home Cleaning' }).click()
  const companyCard = page.getByRole('group', { name: 'E2E Test Co', exact: true })
  await companyCard.getByRole('button', { name: 'Select' }).click()
}

test('CUST-02: customer creates a one-time booking', async ({ page }) => {
  await selectCompanyA(page)
  await fillAddress(page)

  const dateInput = page.locator('input[type="date"]').first()
  const minDate = await dateInput.getAttribute('min')
  await dateInput.fill(minDate)
  await page.getByRole('button', { name: '09:00', exact: true }).click()

  await page.getByRole('button', { name: 'CONFIRM BOOKING' }).click()
  await expect(page.getByText('Booking Submitted!')).toBeVisible()

  const { data } = await ownerClient.from('bookings').select('id').eq('customer_id', fixtures.companyA.customerId).order('created_at', { ascending: false }).limit(1)
  if (data?.[0]?.id) createdBookingIds.push(data[0].id)
})

test('CUST-03: customer creates a recurring booking', async ({ page }) => {
  await selectCompanyA(page)
  await fillAddress(page)

  await page.getByRole('button', { name: 'Recurring' }).click()

  const startInput = page.locator('input[type="date"]').first()
  const minDate = await startInput.getAttribute('min')
  await startInput.fill(minDate)

  const endDate = new Date(`${minDate}T00:00:00Z`)
  endDate.setUTCDate(endDate.getUTCDate() + 6)
  const endInput = page.locator('input[type="date"]').nth(1)
  await endInput.fill(endDate.toISOString().slice(0, 10))

  await page.getByRole('button', { name: 'Select days' }).click()
  await page.getByRole('checkbox').first().check() // Mon
  await page.getByRole('button', { name: /Mon/ }).click() // close the dropdown (same trigger, now labelled "Mon")

  await page.getByRole('button', { name: 'CONFIRM BOOKING' }).click()
  await expect(page.getByText('Recurring Booking Requested!')).toBeVisible()

  const { data } = await ownerClient
    .from('recurring_bookings')
    .select('id,status')
    .eq('customer_id', fixtures.companyA.customerId)
    .order('created_at', { ascending: false })
    .limit(1)
  expect(data?.[0]?.status).toBe('pending')
  if (data?.[0]?.id) createdRecurringBookingIds.push(data[0].id)
})

test('CUST-05: booking form blocks a date inside an owner-declared closure', async ({ page }) => {
  await selectCompanyA(page)
  await fillAddress(page)

  const dateInput = page.locator('input[type="date"]').first()
  await dateInput.fill(fixtures.companyA.closedDate)
  await page.getByRole('button', { name: '09:00', exact: true }).click()

  await page.getByRole('button', { name: 'CONFIRM BOOKING' }).click()
  await expect(page.getByText(/closed/i)).toBeVisible()
})
