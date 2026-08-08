const { test, expect } = require('@playwright/test')

// NFR-03: responsive layout on a mobile viewport, staff dashboard / customer booking in
// particular. Runs only under the 'mobile' project (see playwright.config.js), which sets the
// viewport/UA via devices['Pixel 7'] — no manual resizing needed here. Read-only navigation only
// (no bookings created/mutated), so it's safe to reuse the shared storageState files rather than
// needing its own seeded fixtures.

async function expectNoHorizontalOverflow(page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1) // +1 for sub-pixel rounding
}

test.describe('staff dashboard', () => {
  test.use({ storageState: 'e2e/.auth/staff.json' })

  test('fits the viewport width and exposes the check-in controls', async ({ page }) => {
    await page.goto('/staffMember')
    await expect(page.getByRole('heading', { name: 'E2E Staff' })).toBeVisible()
    await expectNoHorizontalOverflow(page)

    // The sidebar nav (Attendance, where the QR scan/check-in lives) is collapsed behind a
    // hamburger button below the 'lg' breakpoint (Layout.js) — it has no accessible name of its
    // own, but it's always the first button in the sticky top nav for non-customer roles.
    await page.locator('nav.sticky button').first().click()
    const attendanceLink = page.getByRole('link', { name: 'Attendance' })
    await expect(attendanceLink).toBeVisible()
    await expectNoHorizontalOverflow(page)
  })
})

test.describe('customer booking form', () => {
  test.use({ storageState: 'e2e/.auth/customer.json' })

  test('fits the viewport width and the submit button is reachable', async ({ page }) => {
    await page.goto('/customer-book')
    await expect(page.getByRole('heading', { name: 'Book a Cleaning Service' })).toBeVisible()
    await expectNoHorizontalOverflow(page)

    const submit = page.getByRole('button', { name: 'Submit Booking' })
    await submit.scrollIntoViewIfNeeded()
    await expect(submit).toBeVisible()
  })
})

test.describe('customer dashboard', () => {
  test.use({ storageState: 'e2e/.auth/customer.json' })

  test('fits the viewport width and the bottom nav is usable', async ({ page }) => {
    await page.goto('/customer')
    await expect(page.getByRole('heading', { name: 'My Bookings' })).toBeVisible()
    await expectNoHorizontalOverflow(page)

    const newBookingLink = page.getByRole('link', { name: 'New Booking' })
    await expect(newBookingLink).toBeVisible()
  })
})
