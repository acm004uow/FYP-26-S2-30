const { test, expect } = require('@playwright/test')
const fixtures = require('./helpers/fixtures')

// SEC-04: a company-A session should never surface company-B data through the UI, even though
// current RLS policies are broadly "any authenticated user" (see SEC-01 in the manual test plan —
// a documented gap, not something this UI-level check is meant to catch on its own).
test.use({ storageState: 'e2e/.auth/manager.json' })

test('SEC-04: company-A manager never sees company-B bookings in the bookings queue', async ({ page }) => {
  await page.goto('/manager-bookings')
  await expect(page.getByText(fixtures.companyB.secretBookingLocation)).toHaveCount(0)
  await expect(page.getByText(fixtures.companyB.secretCustomerName)).toHaveCount(0)
})

test('SEC-04: company-A manager never sees company-B staff or customers', async ({ page }) => {
  await page.goto('/manager-customers')
  await expect(page.getByText('manager2@e2e-test.local')).toHaveCount(0)

  await page.goto('/manager-staff')
  await expect(page.getByText('E2E Owner B')).toHaveCount(0)
  await expect(page.getByText('E2E Manager B')).toHaveCount(0)
})
