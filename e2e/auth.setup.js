const { test: setup } = require('@playwright/test')

// The login form's <label> elements aren't wired to their inputs via htmlFor/id
// (see src/pages/login.js), so getByLabel() won't find them — select by input type instead.
const roles = [
  { name: 'owner', email: process.env.E2E_OWNER_EMAIL, waitUrl: /\/admin/, file: 'e2e/.auth/owner.json' },
  { name: 'manager', email: process.env.E2E_MANAGER_EMAIL, waitUrl: /\/manager/, file: 'e2e/.auth/manager.json' },
  { name: 'staff', email: process.env.E2E_STAFF_EMAIL, waitUrl: /\/staffMember/, file: 'e2e/.auth/staff.json' },
  { name: 'customer', email: process.env.E2E_CUSTOMER_EMAIL, waitUrl: /\/customer/, file: 'e2e/.auth/customer.json' },
]

for (const role of roles) {
  setup(`authenticate as ${role.name}`, async ({ page }) => {
    await page.goto('/login')
    await page.locator('input[type="email"]').fill(role.email)
    await page.locator('input[type="password"]').fill(process.env.E2E_TEST_PASSWORD)
    await page.getByRole('button', { name: 'Log in' }).click()
    await page.waitForURL(role.waitUrl)
    await page.context().storageState({ path: role.file })
  })
}
