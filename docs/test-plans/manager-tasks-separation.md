# Test Plan: Separating Bookings and Tasks (Manager view)

**Feature commit:** `f619c2eb` "Separating Bookings and Tasks"
**Status:** No automated coverage yet — `e2e/manager-bookings.spec.js` exists; no `manager-tasks.spec.js`.

## 1. Summary of the change

`BookingsReviewPanel` now takes a `sourceScope` prop (`'customer'` default, or `'tasks'`) so the
same component powers two manager-facing pages instead of one:

| Page | Route | Component call | `bookings.source` filter | Source tab options |
|---|---|---|---|---|
| Bookings | `/manager-bookings` | `<BookingsReviewPanel sourceScope="customer">` (default) | `.eq('source', 'customer')` | All, AI Recommended |
| Tasks | `/manager-tasks` (new) | `<BookingsReviewPanel sourceScope="tasks">` | `.in('source', ['manager', 'department'])` | All, Manager Created, Department Requests, AI Recommended |

Other behavioral deltas tied to `sourceScope`:
- Recurring-bookings loading/realtime subscription (`loadRecurringBookings`) only runs for
  `sourceScope === 'customer'` — the Tasks page never fetches or subscribes to
  `recurring_bookings`.
- Tasks page adds a **Source** column (badge via `getSourceMeta`) between Location and Assignee;
  Bookings page does not show it.
- Detail drawer header reads "Task detail" on the Tasks page vs. "Booking detail" on Bookings.
- Page title/subtitle differ ("Tasks" vs. "Bookings for Review").
- New nav entry "Tasks" (`ListChecks` icon) added between "New Task" and "Schedule" in
  [src/config/navigation.js](../../src/config/navigation.js).

Everything else (approve/reject, reassign staff, status filters, search, pagination, realtime
`bookings` subscription, time-off channel) is shared code, unchanged per-scope.

## 2. Objectives

1. Confirm each page shows only its own source rows and never leaks the other's.
2. Confirm the Tasks page's extra Source column/tab and the Bookings page's recurring-bookings
   section render only where intended.
3. Regression-check that approve/reject/reassign/search/status-filter — all pre-existing,
   verified in `manager-bookings.spec.js` — still work identically on both pages, since they now
   share one component with a new branch condition.
4. Confirm the new `/manager-tasks` route is reachable via nav and enforces the same
   auth/tenant guards as other manager pages.

## 3. Test environment

- Playwright e2e suite, `e2e/` — mirror the pattern in
  [manager-bookings.spec.js](../../e2e/manager-bookings.spec.js): sign in via `signIn()`
  (service-role-backed helper, not a real login flow), seed `bookings` rows directly with
  `ownerClient`, storage state `e2e/.auth/manager.json`.
- Fixtures: [e2e/helpers/fixtures.js](../../e2e/helpers/fixtures.js) — `companyA` has an
  owner/manager/2 staff/1 customer. No dedicated "department" fixture user exists; department
  rows can be seeded directly with `source: 'department'` without a department-role login, same
  as the existing suite does for `source: 'customer'`.
- Company B (`fixtures.companyB`) available for a cross-tenant check if needed, per
  [cross-tenant-access.spec.js](../../e2e/cross-tenant-access.spec.js) pattern.

## 4. Test cases

### A. Source isolation (core of the change)

| ID | Steps | Expected |
|---|---|---|
| TSK-01 | Seed one booking each with `source: 'customer'`, `'manager'`, `'department'`. Go to `/manager-bookings`. | Only the `customer`-source row is visible; `manager`/`department` rows absent (page count too, not just filtered out visually). |
| TSK-02 | Same seed data. Go to `/manager-tasks`. | Only `manager` and `department` rows visible; `customer` row absent. |
| TSK-03 | On `/manager-tasks`, open the Source filter dropdown. | Options are exactly: All Sources, Manager Created, Department Requests, AI Recommended — no "Customer Booked". |
| TSK-04 | On `/manager-bookings`, open the Source filter dropdown. | Options are exactly: All Sources, AI Recommended — no "Manager Created"/"Department Requests". |
| TSK-05 | On `/manager-tasks`, filter by "Manager Created" then "Department Requests". | Each shows only its own source's row(s); counts next to each tab match seeded data. |

### B. Tasks-only UI elements

| ID | Steps | Expected |
|---|---|---|
| TSK-06 | On `/manager-tasks`, inspect the table header row. | A "Source" column exists between Location and Assignee. |
| TSK-07 | On `/manager-bookings`, inspect the table header row. | No "Source" column. |
| TSK-08 | On `/manager-tasks`, check the Source badge for a `manager`-source and a `department`-source row. | Manager row badge reads "Manager Created" (purple); department row reads "Department Request" (orange). |
| TSK-09 | Open detail drawer for a task row on `/manager-tasks`. | Drawer header reads "Task detail". |
| TSK-10 | Open detail drawer for a booking row on `/manager-bookings`. | Drawer header reads "Booking detail". |
| TSK-11 | Check page heading/subtitle on both pages. | `/manager-tasks` → "Tasks" + task-specific subtitle; `/manager-bookings` → "Bookings for Review" + original subtitle. |

### C. Recurring bookings scoping

| ID | Steps | Expected |
|---|---|---|
| TSK-12 | Seed an active `recurring_bookings` row for companyA. Go to `/manager-bookings`. | "Recurring Booking Requests" section loads and shows the row (existing behavior, unaffected). |
| TSK-13 | Same seed. Go to `/manager-tasks`. | No recurring-bookings section/network call rendered — confirm via `read_network_requests` or DOM absence, not just visual scan. |

### D. Regression — shared actions on both pages

Repeat the existing `manager-bookings.spec.js` scenarios (MGR-01–04) against `/manager-tasks`
using `manager`/`department`-source seed rows instead of `customer`-source ones, since the
underlying handlers are shared and a scope-conditional bug could regress one page silently while
the other's tests stay green:

| ID | Steps | Expected |
|---|---|---|
| TSK-14 | Approve a pending `manager`-source row on `/manager-tasks`. | Row status flips to Approved, same flow as MGR-01. |
| TSK-15 | Reject a pending `department`-source row on `/manager-tasks`. | Row status flips to Rejected, same flow as MGR-02. |
| TSK-16 | Reassign staff on an approved task row on `/manager-tasks`. | Assignee updates, same flow as MGR-03. |
| TSK-17 | Search + status filter on `/manager-tasks`. | Narrows results correctly, same flow as MGR-04. |

### E. Navigation and access control

| ID | Steps | Expected |
|---|---|---|
| TSK-18 | Sign in as manager, check sidebar/nav. | "Tasks" link present between "New Task" and "Schedule", routes to `/manager-tasks`. |
| TSK-19 | Sign in as a companyB manager, seed a companyA `manager`-source booking. Visit companyB's `/manager-tasks`. | companyA's row never appears (tenant isolation holds under the new `.in('source', …)` query, same as existing `host_admin_id` scoping). |
| TSK-20 | Visit `/manager-tasks` unauthenticated (or as staff/customer role). | Redirected/blocked per existing role-guard behavior (`auth-routing.spec.js` pattern) — not a new behavior, but confirm the new page didn't skip the guard. |

### F. Edge cases

| ID | Steps | Expected |
|---|---|---|
| TSK-21 | `/manager-tasks` with zero `manager`/`department` rows for the business. | Empty state renders cleanly, no crash from empty `sourceFilterCounts`. |
| TSK-22 | A booking with `source: null` (legacy/pre-migration row, if any exist). | `getSourceMeta(null)` falls back to `sourceMeta.customer` per current code — confirm it lands correctly on `/manager-bookings` (not `/manager-tasks`) since the query filter, not `getSourceMeta`, decides page membership; flag if this default is actually wrong for a null-source manager-page row. |
| TSK-23 | Column widths / table layout on `/manager-tasks` (7 columns incl. Source) vs `/manager-bookings` (6 columns). | No overflow/clipping at desktop and the existing mobile-responsive breakpoints ([mobile-responsive.spec.js](../../e2e/mobile-responsive.spec.js) pattern). |

## 5. Out of scope

- The New Task form itself ([src/actors/manager/new-task](../../src/actors/manager/new-task)) and
  department task creation ([src/actors/department/tasks](../../src/actors/department/tasks)) —
  this plan assumes rows with the right `source` already exist and only tests the review/display
  side.
- AI recommendation scoring/assignment logic — unchanged by this commit.
- Recurring-bookings generation logic — unchanged by this commit, only its visibility is scoped.

## 6. Suggested automation

Add `e2e/manager-tasks.spec.js` mirroring `manager-bookings.spec.js`'s structure (seed in
`beforeAll` with `source: 'manager'`/`'department'`, clean up in `afterAll`), covering TSK-01,
02, 03/04, 08, 12/13, 14–17 as the minimum regression net before merging further changes to
`BookingsReviewPanel`.
