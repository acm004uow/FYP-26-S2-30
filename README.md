# Smart Task Allocation

A multi-tenant field-service management platform built for cleaning and facilities companies. Managers create bookings and staff schedules; an AI recommendation engine scores and assigns the best available staff member for each job; and an AI scheduling agent handles recurring contracts via a natural-language chat interface.

Built with Next.js 14, Supabase, Tailwind CSS, OpenAI, and Azure OpenAI. Deployed on Vercel.

---

## Features

### Roles

| Role | Description |
|---|---|
| `user_admin` | Platform super-admin — manages all companies and users |
| `system_admin` (Admin) | Business owner — configures staff, departments, pay rates, and global parameters |
| `manager` | Day-to-day operations — creates bookings, assigns tasks, runs the AI scheduler |
| `department_staff` | Department manager — requests casual staff for department-level tasks |
| `staff_member` | Field worker — views upcoming tasks, submits leave, checks in via QR |
| `customer` | Books services through a 3-step wizard, tracks their bookings |

### Core capabilities

- **AI staff recommendation** — scores available staff on availability, proximity (Haversine distance), current workload, weekly hours, and performance rating; honours explicit customer name requests and recurring-booking continuity preferences
- **AI scheduling agent** — managers chat in plain English ("ABC Office needs 3 cleaners Mon–Fri 7–9 PM from 1–31 August") and the agent creates recurring contracts and proposes the full week's schedule automatically (powered by Azure OpenAI)
- **Recurring bookings** — weekly cron job (Vercel cron, `CRON_SECRET`-gated) auto-generates individual booking instances from recurring plans
- **QR attendance** — time-limited QR tokens on manager dashboards; staff scan to check in (geolocation captured)
- **Customer booking wizard** — 3-step flow: describe your need → choose a company from the marketplace → pick a schedule; AI parses the free-text need into structured service requirements
- **Reports & insights** — AI-generated period summaries (OpenAI), attendance and task charts (Recharts)
- **Marketing copy generation** — admins generate and publish AI-written company descriptions to the customer-facing marketplace
- **Late cancellation locking** — customers who cancel within 24 hours of a confirmed booking are automatically locked after two strikes; managers can reset from the Customers panel
- **Multi-tenant isolation** — every record is scoped by `host_admin_id`; Row-Level Security in Supabase enforces the boundary

---

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (Pages Router) |
| Database & Auth | Supabase (PostgreSQL + Supabase Auth) |
| Styling | Tailwind CSS |
| AI — general | OpenAI (chatbot, task parsing, marketing copy, report insights) |
| AI — scheduling agent | Azure OpenAI |
| Maps | Leaflet |
| Charts | Recharts |
| QR | `qrcode` (generation), `jsqr` (scanning) |
| Unit tests | Jest |
| E2E tests | Playwright |
| Deployment | Vercel |

---

## Project structure

```
app/
  api/
    admin/          # User management (create, reset password, update role)
    agent/          # AI scheduling agent (Azure OpenAI) + task parsing
    attendance/     # QR token generation and check-in
    auth/           # Profile bootstrapping on first login
    chatbot/        # General-purpose chatbot
    cron/           # Weekly recurring-booking generation
    customer/       # Customer need parsing
    manager/        # Recurring schedule builder
    reports/        # AI report insights

src/
  actors/           # Feature modules, one folder per role
    admin/
    customer/
    department/
    manager/
    staff-member/
    user-admin/
  components/       # Shared UI components
  config/           # Navigation map and role colour themes
  context/          # AuthUserContext
  pages/            # Next.js page files (one per route)

lib/                # Pure business logic (tested with Jest)
  recommendationEngine.js   # Staff scoring algorithm
  recurringBookings.js      # Recurring booking creation
  scheduleProposal.js       # Weekly schedule builder
  attendance.js / attendanceQr.js
  businessWeek.js / weekDates.js
  geolocation.js            # Haversine distance
  reportPeriods.js
  staffTasks.js
  ...

e2e/                # Playwright end-to-end tests
supabase/
  schema.sql        # Full database schema — run in Supabase SQL Editor
```

---

## Getting started

### Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project
- An OpenAI API key
- An Azure OpenAI resource with a chat-completions deployment

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Copy `.env.example` to `.env.local` and fill in the values:

```bash
cp .env.example .env.local
```

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role key (server-side only) |
| `NEXT_PUBLIC_SITE_URL` | Deployed URL (used in email links and QR URLs) |
| `OPENAI_API_KEY` | OpenAI key for chatbot, task parsing, marketing, insights |
| `OPENAI_MODEL` | Model name, e.g. `gpt-4o-mini` |
| `AZURE_OPENAI_ENDPOINT` | Azure OpenAI endpoint ending in `/openai/v1` |
| `AZURE_OPENAI_DEPLOYMENT` | Deployment name (passed as `model` in the request) |
| `AZURE_OPENAI_API_KEY` | Azure OpenAI API key |
| `AZURE_OPENAI_API_VERSION` | Optional; leave blank for stable endpoints |
| `CRON_SECRET` | Random secret that gates the weekly-schedule cron route |

### 3. Apply the database schema

Open the Supabase SQL Editor for your project and run the contents of `supabase/schema.sql`.

### 4. Run the development server

```bash
npm run dev
```

The app starts at `http://localhost:3000`. Login is at `/login`.

---

## Running tests

### Unit tests

```bash
npm test
```

Tests live in `lib/__tests__/` and cover the recommendation engine, recurring booking logic, attendance helpers, geolocation, and date utilities.

### End-to-end tests

```bash
npm run test:e2e
```

Playwright tests in `e2e/` cover auth routing, customer booking, manager bookings, QR attendance, recurring booking generation, and cross-tenant access controls. Configure credentials in `e2e/.auth/` (see `e2e/auth.setup.js`).

E2E environment variables (including test-account emails and passwords) go in `.env.e2e`.

---

## Deployment

The app is designed for Vercel. `vercel.json` configures the weekly cron:

```json
{
  "crons": [
    {
      "path": "/api/cron/weekly-schedule",
      "schedule": "0 0 * * 1"
    }
  ]
}
```

The cron route requires the `Authorization: Bearer <CRON_SECRET>` header. Vercel sends this automatically when `CRON_SECRET` is set as an environment variable.

Set all `.env.local` variables as Vercel environment variables before deploying.

---

## AI scheduling agent

The Manager Scheduling Agent (`/manager-ai-agent`) is a chat interface powered by Azure OpenAI. It supports two tool calls:

- **`create_recurring_contract`** — parses one or more customer/schedule descriptions from a single message and creates the contracts, then immediately proposes the schedule for the covered date range
- **`propose_weekly_schedule`** — builds a draft schedule from bookings already in the system for a given date range

Example prompts:
- *"ABC Office Tower needs 3 cleaners Monday to Friday 7–9 PM from 1 to 31 August"*
- *"Generate a schedule for next week"*
- *"Green Mall: daily 10 PM – 1 AM, 5 cleaners, from 15 to 31 August"*

---

## Staff recommendation engine

`lib/recommendationEngine.js` scores each eligible staff member against a task using configurable weights:

| Factor | Default weight |
|---|---|
| Availability | 30 |
| Proximity (within radius) | 20 |
| Weekly hours headroom | 15 |
| Current workload | 10 |
| Performance rating ≥ 4 | 10 |

Weights and thresholds are configurable per business via the Admin → Global Parameters panel. Customer name requests and recurring-booking continuity each add a +1000 priority boost to override the algorithmic ranking when appropriate.
