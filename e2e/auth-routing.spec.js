const { test, expect } = require('@playwright/test')

test.describe('login lands each role on its own dashboard', () => {
  test('owner lands on /admin', async ({ browser }) => {
    const context = await browser.newContext({ storageState: 'e2e/.auth/owner.json' })
    const page = await context.newPage()
    await page.goto('/admin')
    await expect(page).toHaveURL(/\/admin/)
    await context.close()
  })

  test('manager lands on /manager', async ({ browser }) => {
    const context = await browser.newContext({ storageState: 'e2e/.auth/manager.json' })
    const page = await context.newPage()
    await page.goto('/manager')
    await expect(page).toHaveURL(/\/manager/)
    await context.close()
  })

  test('staff member lands on /staffMember', async ({ browser }) => {
    const context = await browser.newContext({ storageState: 'e2e/.auth/staff.json' })
    const page = await context.newPage()
    await page.goto('/staffMember')
    await expect(page).toHaveURL(/\/staffMember/)
    await context.close()
  })

  test('customer lands on /customer', async ({ browser }) => {
    const context = await browser.newContext({ storageState: 'e2e/.auth/customer.json' })
    const page = await context.newPage()
    await page.goto('/customer')
    await expect(page).toHaveURL(/\/customer/)
    await context.close()
  })
})

test.describe('cross-role access is blocked', () => {
  test('a staff-member session cannot reach the manager dashboard', async ({ browser }) => {
    const context = await browser.newContext({ storageState: 'e2e/.auth/staff.json' })
    const page = await context.newPage()
    await page.goto('/manager')
    await page.waitForURL(/\/login/)
    await context.close()
  })

  test('a customer session cannot reach the owner admin panel', async ({ browser }) => {
    const context = await browser.newContext({ storageState: 'e2e/.auth/customer.json' })
    const page = await context.newPage()
    await page.goto('/admin')
    await page.waitForURL(/\/login/)
    await context.close()
  })
})

test('failed login shows an error and stays on /login', async ({ page }) => {
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(process.env.E2E_MANAGER_EMAIL)
  await page.locator('input[type="password"]').fill('definitely-the-wrong-password')
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page.locator('text=/invalid/i')).toBeVisible()
  await expect(page).toHaveURL(/\/login/)
})
