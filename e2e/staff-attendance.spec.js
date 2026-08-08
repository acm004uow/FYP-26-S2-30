const path = require('path')
const { test, expect } = require('@playwright/test')
const fixtures = require('./helpers/fixtures')
const { signIn, todayIso } = require('./helpers/db')

test.use({ storageState: 'e2e/.auth/staff.json' })

let ownerClient
let bookingIds = {}

test.beforeAll(async () => {
  ownerClient = await signIn(fixtures.companyA.ownerEmail, fixtures.password)

  const base = {
    host_admin_id: fixtures.companyA.ownerId,
    customer_id: fixtures.companyA.customerId,
    service_type: 'Home Cleaning',
    scheduled_date: todayIso(0),
    source: 'customer',
    assigned_staff_id: fixtures.companyA.staff.staffProfileId,
    latitude: fixtures.companyA.siteLat,
    longitude: fixtures.companyA.siteLon,
    estimated_hours: 23, // keeps the task "assigned today" without also flipping to Overdue partway through the day
  }

  const { data: geoBooking } = await ownerClient.from('bookings')
    .insert({ ...base, location: 'E2E-STF-Geo, Singapore', status: 'approved' })
    .select('id').single()

  const { data: proofBooking } = await ownerClient.from('bookings')
    .insert({ ...base, location: 'E2E-STF-Proof, Singapore', status: 'in_progress', checked_in_at: new Date().toISOString() })
    .select('id').single()

  bookingIds = { geo: geoBooking.id, proof: proofBooking.id }
})

test.afterAll(async () => {
  const ids = Object.values(bookingIds)
  if (ids.length) await ownerClient.from('bookings').delete().in('id', ids)
})

test('STF-03/04/06: geolocation check-in is rejected outside the radius and succeeds on site', async ({ page, context }) => {
  await context.grantPermissions(['geolocation'])
  await page.goto('/staffMember')

  // The calendar sidebar can also echo a task's location as plain text for "today", so scope
  // this click to the task card's own button rather than a bare getByText.
  await page.getByRole('button', { name: /E2E-STF-Geo/ }).click() // expand the card

  // ~5.5km away — well outside the 300m radius.
  await context.setGeolocation({ latitude: fixtures.companyA.siteLat + 0.05, longitude: fixtures.companyA.siteLon })
  await page.getByRole('button', { name: 'Check In' }).click()
  await expect(page.getByText(/from the job site/i)).toBeVisible()

  // Now on site — well within 300m. (Not asserting on the transient "Task started." toast — it
  // can auto-dismiss before this line runs under dev-server load; the Check Out button appearing
  // is the durable signal that check-in actually succeeded.)
  await context.setGeolocation({ latitude: fixtures.companyA.siteLat, longitude: fixtures.companyA.siteLon })
  await page.getByRole('button', { name: 'Check In' }).click()
  await expect(page.getByRole('button', { name: /Check Out/ })).toBeVisible()
})

test('STF-07: staff checks out with a proof-of-completion upload', async ({ page }) => {
  await page.goto('/staffMember')
  await page.getByRole('button', { name: /E2E-STF-Proof/ }).click() // expand the card

  await page.getByRole('button', { name: /Check Out & Complete/ }).click()
  const fileInput = page.locator('input[type="file"]')
  await fileInput.setInputFiles(path.join(__dirname, 'fixtures', 'proof.png'))
  // Scope to the upload modal — its submit button shares the same label as the card's trigger
  // button, which is still present (covered) behind the modal overlay.
  const modal = fileInput.locator('xpath=ancestor::div[1]')
  await modal.getByRole('button', { name: 'Check Out & Complete' }).click()

  await expect(page.getByText('Booking completed.')).toBeVisible()

  const { data } = await ownerClient.from('bookings').select('status').eq('id', bookingIds.proof).single()
  expect(data.status).toBe('completed')
  const { data: proofRow } = await ownerClient.from('task_proofs').select('id').eq('booking_id', bookingIds.proof).maybeSingle()
  expect(proofRow).toBeTruthy()
})
