const { test, expect } = require('@playwright/test')
const fixtures = require('./helpers/fixtures')
const { signIn, getAccessToken, getServiceRoleClient } = require('./helpers/db')

// Owner/User Admin subset: inviting a user (ADM-08) and the role-change guards (ADM-09/ADM-10) —
// app/api/admin/create-user and app/api/admin/update-role, called directly with real access
// tokens. The "last active owner" guard is deliberately not covered here: the code's count query
// is global across the whole platform, not scoped per company (see the note on that test below),
// so exercising it safely would mean touching another spec's company-B owner fixture — flagged as
// a finding rather than forced into a fragile test.

let ownerToken
let staff2Token

test.beforeAll(async () => {
  const ownerClient = await signIn(fixtures.companyA.ownerEmail, fixtures.password)
  ownerToken = await getAccessToken(ownerClient)
  const staff2Client = await signIn(fixtures.companyA.staff2.email, fixtures.password)
  staff2Token = await getAccessToken(staff2Client)
})

test('ADM-08: owner invites a new manager account into their own company', async ({ request }) => {
  // inviteUserByEmail validates the address for real deliverability — the .local TLD used by the
  // other seed accounts (created by direct SQL insert, which skips that check) is rejected here.
  const email = `e2e-invited-${Date.now()}@example.com`
  const response = await request.post('/api/admin/create-user', {
    headers: { Authorization: `Bearer ${ownerToken}` },
    data: { email, full_name: 'E2E Invited Manager', role: 'manager' },
  })
  const body = await response.json()

  // Supabase's built-in (no custom SMTP configured) email sender on a free-tier project allows
  // only a handful of sends per hour — a real constraint of this test project, not a defect in
  // the route. Skip rather than fail when it's hit, so repeated runs stay meaningful without
  // needing real SMTP wired up just for this one test.
  test.skip(response.status() === 400 && /rate limit/i.test(body.error || ''), 'Supabase invite-email rate limit hit for this project — not a defect, skipping')

  expect(response.status()).toBe(200)
  expect(body.ok).toBe(true)
  expect(body.user_id).toBeTruthy()

  const ownerClient = await signIn(fixtures.companyA.ownerEmail, fixtures.password)
  const { data: profile } = await ownerClient.from('profiles').select('role,status,host_admin_id').eq('id', body.user_id).single()
  expect(profile.role).toBe('manager')
  expect(profile.status).toBe('active')
  expect(profile.host_admin_id).toBe(fixtures.companyA.ownerId)

  const admin = getServiceRoleClient()
  await admin.from('profiles').delete().eq('id', body.user_id)
  await admin.auth.admin.deleteUser(body.user_id)
})

test('ADM-09: an owner cannot grant the user_admin role', async ({ request }) => {
  const response = await request.post('/api/admin/update-role', {
    headers: { Authorization: `Bearer ${ownerToken}` },
    data: { user_id: fixtures.companyA.staff2.userId, role: 'user_admin' },
  })
  expect(response.status()).toBe(403)
  const body = await response.json()
  expect(body.error).toMatch(/platform admin access/i)

  const ownerClient = await signIn(fixtures.companyA.ownerEmail, fixtures.password)
  const { data: profile } = await ownerClient.from('profiles').select('role').eq('id', fixtures.companyA.staff2.userId).single()
  expect(profile.role).toBe('staff_member') // unchanged
})

test('ADM-10: an owner cannot change or deactivate their own account', async ({ request }) => {
  const roleAttempt = await request.post('/api/admin/update-role', {
    headers: { Authorization: `Bearer ${ownerToken}` },
    data: { user_id: fixtures.companyA.ownerId, role: 'manager' },
  })
  expect(roleAttempt.status()).toBe(400)
  expect((await roleAttempt.json()).error).toMatch(/cannot change or deactivate your own access/i)

  const deactivateAttempt = await request.post('/api/admin/update-role', {
    headers: { Authorization: `Bearer ${ownerToken}` },
    data: { user_id: fixtures.companyA.ownerId, status: 'inactive' },
  })
  expect(deactivateAttempt.status()).toBe(400)
})

test('an owner cannot manage a user outside their own company', async ({ request }) => {
  const response = await request.post('/api/admin/update-role', {
    headers: { Authorization: `Bearer ${ownerToken}` },
    data: { user_id: fixtures.companyB.managerId, status: 'inactive' },
  })
  expect(response.status()).toBe(403)
  expect((await response.json()).error).toMatch(/not under your organisation/i)
})
