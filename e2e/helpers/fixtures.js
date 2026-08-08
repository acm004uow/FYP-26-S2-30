// Stable IDs from the dedicated E2E Supabase test project (ocjmjxwflckjizmcpjqp).
// This is a fixed, purpose-built project — safe to hardcode rather than look up every run.
module.exports = {
  companyA: {
    ownerId: '2f525796-f901-41c9-9ab6-3c0e31a056a6',
    ownerEmail: 'owner@e2e-test.local',
    managerId: '785aea84-130c-42ad-9dfe-969432da2ff4',
    managerEmail: 'manager@e2e-test.local',
    staff: { userId: 'bd9bb825-145a-4208-ba18-1f753d4d4476', staffProfileId: 'cab67633-4307-4f8a-9c47-154b9a02b6f8', email: 'staff@e2e-test.local', name: 'E2E Staff' },
    staff2: { userId: '21697d93-054a-4543-959d-f9f255a34511', staffProfileId: '868b8070-39ef-47e5-a9fe-57c781622263', email: 'staff2@e2e-test.local', name: 'E2E Staff Two' },
    customerId: 'b482ea76-d29d-42ba-817c-946af2e4b028',
    customerEmail: 'customer@e2e-test.local',
    // Dedicated second customer, used only by late-cancellation.spec.js. That test locks the
    // account it cancels with — Layout.js's status guard bounces *any* concurrently-open session
    // for that profile row the moment it locks, regardless of which session did the locking. A
    // separate account keeps that side effect from breaking other specs (e.g.
    // customer-booking.spec.js) that run against the shared customer concurrently.
    lockableCustomerId: '1c0ae1f5-89d3-4474-946d-b3beb58521fd',
    lockableCustomerEmail: 'customer-lockable@e2e-test.local',
    // Matches staff_profiles.latitude/longitude seeded for both staff — used as the job site
    // coordinate for geolocation check-in tests so "on site" and "home" line up by default.
    siteLat: 1.3521,
    siteLon: 103.8198,
    // Permanent fixture closure (business_closures), far enough in the future to never collide
    // with "today" regardless of when the suite runs.
    closedDate: '2099-01-01',
  },
  companyB: {
    ownerId: '020d2d0b-7858-4a88-baa4-411a92e4c1f0',
    managerId: '8b9c25e4-4447-4837-a7a9-185a8520e480',
    managerEmail: 'manager2@e2e-test.local',
    // Seeded once via SQL — must never appear to a company-A session (cross-tenant-access.spec.js).
    secretBookingLocation: 'Company B Secret Location, Singapore',
    secretCustomerName: 'Company B Confidential Customer',
  },
  password: process.env.E2E_TEST_PASSWORD || 'E2eTest!2026',
}
