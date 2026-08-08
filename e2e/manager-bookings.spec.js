const { test, expect } = require('@playwright/test')
const fixtures = require('./helpers/fixtures')
const { signIn, todayIso } = require('./helpers/db')

test.use({ storageState: 'e2e/.auth/manager.json' })

let ownerClient
let bookingIds = {}

test.beforeAll(async () => {
  ownerClient = await signIn(fixtures.companyA.ownerEmail, fixtures.password)

  const base = {
    host_admin_id: fixtures.companyA.ownerId,
    customer_id: fixtures.companyA.customerId,
    service_type: 'Home Cleaning',
    scheduled_date: todayIso(2),
    source: 'customer',
  }

  const { data: pendingApprove } = await ownerClient.from('bookings')
    .insert({ ...base, location: 'E2E-MGR-Approve, Singapore', status: 'pending' })
    .select('id').single()
  const { data: pendingReject } = await ownerClient.from('bookings')
    .insert({ ...base, location: 'E2E-MGR-Reject, Singapore', status: 'pending' })
    .select('id').single()
  const { data: approvedForReassign } = await ownerClient.from('bookings')
    .insert({ ...base, location: 'E2E-MGR-Reassign, Singapore', status: 'approved', assigned_staff_id: fixtures.companyA.staff.staffProfileId })
    .select('id').single()
  const { data: filterFixture } = await ownerClient.from('bookings')
    .insert({ ...base, location: 'E2E-MGR-Filter, Singapore', status: 'pending' })
    .select('id').single()

  bookingIds = {
    approve: pendingApprove.id,
    reject: pendingReject.id,
    reassign: approvedForReassign.id,
    filter: filterFixture.id,
  }

  // Both staff start each run with a known workload baseline.
  await ownerClient.from('staff_profiles').update({ current_workload: 0 }).eq('id', fixtures.companyA.staff.staffProfileId)
  await ownerClient.from('staff_profiles').update({ current_workload: 0 }).eq('id', fixtures.companyA.staff2.staffProfileId)
})

test.afterAll(async () => {
  const ids = Object.values(bookingIds)
  if (ids.length) await ownerClient.from('bookings').delete().in('id', ids)
})

function rowFor(page, location) {
  return page.locator('tr', { hasText: location })
}

async function openDetail(page, location) {
  await rowFor(page, location).getByRole('button', { name: 'View booking' }).click()
}

test('MGR-01: manager approves a pending booking', async ({ page }) => {
  await page.goto('/manager-bookings')
  await openDetail(page, 'E2E-MGR-Approve')
  await page.getByRole('button', { name: 'Approve', exact: true }).click()
  await page.getByRole('button', { name: 'Close' }).click()
  await expect(rowFor(page, 'E2E-MGR-Approve').getByText('Approved')).toBeVisible()
})

test('MGR-02: manager rejects a pending booking', async ({ page }) => {
  await page.goto('/manager-bookings')
  await openDetail(page, 'E2E-MGR-Reject')
  await page.getByRole('button', { name: 'Reject', exact: true }).click()
  await page.getByRole('button', { name: 'Close' }).click()
  await expect(rowFor(page, 'E2E-MGR-Reject').getByText('Rejected')).toBeVisible()
})

test('MGR-03: manager reassigns an approved booking to a different staff member', async ({ page }) => {
  await page.goto('/manager-bookings')
  await expect(rowFor(page, 'E2E-MGR-Reassign').getByText(fixtures.companyA.staff.name)).toBeVisible()

  await openDetail(page, 'E2E-MGR-Reassign')
  await page.getByRole('button', { name: 'Reassign staff' }).click()
  await page.getByRole('combobox').selectOption({ label: fixtures.companyA.staff2.name })
  await page.getByRole('button', { name: 'Confirm' }).click()
  await page.getByRole('button', { name: 'Close' }).click()

  await expect(rowFor(page, 'E2E-MGR-Reassign').getByText(fixtures.companyA.staff2.name)).toBeVisible()
})

test('MGR-04: search and status filters narrow the bookings queue', async ({ page }) => {
  await page.goto('/manager-bookings')
  await page.getByPlaceholder('Search bookings...').fill('E2E-MGR-Filter')
  await expect(rowFor(page, 'E2E-MGR-Filter')).toBeVisible()
  await expect(rowFor(page, 'E2E-MGR-Approve')).toHaveCount(0)

  await page.getByRole('button', { name: 'Rejected', exact: true }).click()
  await expect(rowFor(page, 'E2E-MGR-Filter')).toHaveCount(0) // it's pending, not rejected

  await page.getByRole('button', { name: 'Pending', exact: true }).click()
  await expect(rowFor(page, 'E2E-MGR-Filter')).toBeVisible()
})
