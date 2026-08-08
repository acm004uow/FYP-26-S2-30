const { test, expect } = require('@playwright/test')
const fixtures = require('./helpers/fixtures')
const { signIn, todayIso, weekdayOf, getAccessToken } = require('./helpers/db')

// REC-06/07/09/10/11 — generateWeeklyVisits / buildScheduleProposal (lib/scheduleProposal.js,
// lib/recurringBookings.js), triggered via the AI agent's propose_weekly_schedule tool using the
// SCHEDULE_RANGE: mock mode (e2e/mocks/azure-openai-mock.js) so the exact date range is
// test-controlled rather than left to a real model's judgement. Each test picks its own target
// date (today + a fixed offset) and a dedicated recurring_bookings row so they don't interfere
// with each other or with other spec files sharing company A.

let ownerClient
let managerToken
const cleanupRecurringIds = []

test.beforeAll(async () => {
  ownerClient = await signIn(fixtures.companyA.ownerEmail, fixtures.password)
  const managerClient = await signIn(fixtures.companyA.managerEmail, fixtures.password)
  managerToken = await getAccessToken(managerClient)
})

test.afterEach(async () => {
  for (const id of cleanupRecurringIds.splice(0)) {
    await ownerClient.from('bookings').delete().eq('recurring_booking_id', id)
    await ownerClient.from('recurring_bookings').delete().eq('id', id)
  }
  await ownerClient.from('staff_time_off_requests').delete().eq('host_admin_id', fixtures.companyA.ownerId).eq('reason', 'REC-GEN-TEST')
  await ownerClient.from('business_closures').delete().eq('host_admin_id', fixtures.companyA.ownerId).eq('reason', 'REC-GEN-TEST')
})

async function seedRecurring(overrides, targetDate) {
  const { data, error } = await ownerClient.from('recurring_bookings').insert({
    host_admin_id: fixtures.companyA.ownerId,
    service_type: 'Home Cleaning',
    location: 'REC-GEN-TEST, Singapore',
    scheduled_time: '19:00',
    estimated_hours: 2,
    days_of_week: [weekdayOf(targetDate)],
    start_date: targetDate,
    end_date: targetDate,
    status: 'active',
    source: 'manager',
    guest_name: 'REC-GEN-TEST Guest',
    staff_count: 1,
    ...overrides,
  }).select('id').single()
  if (error) throw new Error(error.message)
  cleanupRecurringIds.push(data.id)
  return data.id
}

async function triggerSchedule(request, range) {
  const response = await request.post('/api/agent', {
    headers: { Authorization: `Bearer ${managerToken}` },
    data: { message: `SCHEDULE_RANGE:${JSON.stringify(range)}`, history: [] },
  })
  const body = await response.json()
  if (response.status() !== 200) throw new Error(`propose_weekly_schedule failed: ${JSON.stringify(body)}`)
  return body
}

async function bookingsForDate(recurringId, date) {
  const { data } = await ownerClient.from('bookings').select('id,assigned_staff_id')
    .eq('recurring_booking_id', recurringId).eq('scheduled_date', date)
  return data || []
}

test('REC-06 & REC-07: generation is idempotent and multi-staff slots get distinct staff', async ({ request }) => {
  const targetDate = todayIso(10)
  const recurringId = await seedRecurring({ staff_count: 2 }, targetDate)
  const range = { start_date: targetDate, end_date: targetDate }

  const first = await triggerSchedule(request, range)
  const firstRows = first.proposal.filter((row) => row.recurring_booking_id === recurringId)
  expect(firstRows).toHaveLength(2)
  const recommendedIds = firstRows.map((row) => row.recommended_staff_id).filter(Boolean)
  expect(new Set(recommendedIds).size).toBe(recommendedIds.length) // distinct — no slot repeats the same staff

  const afterFirst = await bookingsForDate(recurringId, targetDate)
  expect(afterFirst).toHaveLength(2)

  await triggerSchedule(request, range) // repeat — must not duplicate
  const afterSecond = await bookingsForDate(recurringId, targetDate)
  expect(afterSecond).toHaveLength(2)
  expect(new Set(afterSecond.map((b) => b.id))).toEqual(new Set(afterFirst.map((b) => b.id))) // same rows, not new ones
})

test('REC-09: raising staff_count tops up rather than duplicating', async ({ request }) => {
  const targetDate = todayIso(11)
  const recurringId = await seedRecurring({ staff_count: 1 }, targetDate)
  const range = { start_date: targetDate, end_date: targetDate }

  await triggerSchedule(request, range)
  expect(await bookingsForDate(recurringId, targetDate)).toHaveLength(1)

  await ownerClient.from('recurring_bookings').update({ staff_count: 2 }).eq('id', recurringId)
  await triggerSchedule(request, range)
  expect(await bookingsForDate(recurringId, targetDate)).toHaveLength(2) // topped up, not 1+2=3
})

test('REC-10: approved time off hard-blocks that staff member from the recommendation', async ({ request }) => {
  const targetDate = todayIso(12)
  const recurringId = await seedRecurring({ staff_count: 1 }, targetDate)
  const range = { start_date: targetDate, end_date: targetDate }

  await ownerClient.from('staff_time_off_requests').insert({
    staff_profile_id: fixtures.companyA.staff.staffProfileId,
    host_admin_id: fixtures.companyA.ownerId,
    requested_by: fixtures.companyA.managerId,
    request_type: 'leave',
    start_date: targetDate,
    end_date: targetDate,
    status: 'approved',
    reason: 'REC-GEN-TEST',
  })

  const result = await triggerSchedule(request, range)
  const row = result.proposal.find((r) => r.recurring_booking_id === recurringId)
  expect(row).toBeTruthy()
  expect(row.recommended_staff_id).not.toBe(fixtures.companyA.staff.staffProfileId)
  // staff2 is otherwise eligible and unaffected by the leave, so it should be recommended instead.
  expect(row.recommended_staff_id).toBe(fixtures.companyA.staff2.staffProfileId)
})

test('REC-11: an owner-declared closure blocks generation for that date only going forward', async ({ request }) => {
  const targetDate = todayIso(13)
  const recurringId = await seedRecurring({ staff_count: 1 }, targetDate)
  const range = { start_date: targetDate, end_date: targetDate }

  // A pre-existing booking on the target date, created before the closure — must survive untouched.
  const { data: preExisting } = await ownerClient.from('bookings').insert({
    host_admin_id: fixtures.companyA.ownerId,
    recurring_booking_id: recurringId,
    service_type: 'Home Cleaning',
    location: 'REC-GEN-TEST, Singapore',
    scheduled_date: targetDate,
    status: 'pending',
    source: 'manager',
  }).select('id').single()

  await ownerClient.from('business_closures').insert({
    host_admin_id: fixtures.companyA.ownerId,
    start_date: targetDate,
    end_date: targetDate,
    reason: 'REC-GEN-TEST',
  })

  await triggerSchedule(request, range)
  const rows = await bookingsForDate(recurringId, targetDate)
  expect(rows).toHaveLength(1) // still just the pre-existing one — no top-up to staff_count on a closed date
  expect(rows[0].id).toBe(preExisting.id)
})
