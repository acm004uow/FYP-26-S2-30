import Head from 'next/head'
import Link from 'next/link'
import {
  ArrowRight,
  BarChart3,
  CalendarCheck,
  CheckCircle2,
  Clock3,
  FileCheck2,
  Gauge,
  LayoutDashboard,
  LockKeyhole,
  MapPin,
  MessageSquareText,
  ShieldCheck,
  Sparkles,
  UsersRound,
  Workflow,
} from 'lucide-react'

const metrics = [
  { label: 'Active staff', value: '42', tone: 'bg-blue-50 text-blue-700' },
  { label: 'Open requests', value: '18', tone: 'bg-amber-50 text-amber-700' },
  { label: 'Completed today', value: '31', tone: 'bg-green-50 text-green-700' },
]

const features = [
  {
    icon: Sparkles,
    title: 'Smart recommendations',
    text: 'Match requests with staff based on availability, workload, proximity, skill fit, and priority.',
  },
  {
    icon: CalendarCheck,
    title: 'Live availability',
    text: 'Give managers a clear view of who is available, unavailable, or on time off before assigning work.',
  },
  {
    icon: FileCheck2,
    title: 'Proof and feedback',
    text: 'Let staff update task status, upload completion proof, and receive performance feedback in one flow.',
  },
  {
    icon: ShieldCheck,
    title: 'Admin governance',
    text: 'Manage users, roles, password resets, security logs, audit logs, and allocation parameters.',
  },
]

const roles = [
  {
    title: 'Managers',
    icon: LayoutDashboard,
    points: ['Approve task requests', 'Review recommended staff', 'Generate operational reports'],
  },
  {
    title: 'Department Staff',
    icon: Workflow,
    points: ['Submit task requests', 'Track approvals', 'Search task history'],
  },
  {
    title: 'Staff Members',
    icon: UsersRound,
    points: ['Update availability', 'View assignments', 'Upload completion proof'],
  },
  {
    title: 'System Admins',
    icon: LockKeyhole,
    points: ['Create accounts', 'Configure thresholds', 'Monitor audit activity'],
  },
]

const steps = [
  'Department staff submit a task with priority, timing, location, and requirements.',
  'The system ranks available staff using workload, proximity, skills, and policy weights.',
  'Managers approve, assign, monitor progress, and close the loop with reports.',
]

export default function MarketingHome() {
  return (
    <>
      <Head>
        <title>Smart Task Allocation | Workforce scheduling for SMEs</title>
        <meta
          name="description"
          content="Smart Task Allocation helps SMEs assign work using availability, workload, proximity, priority, and role-based governance."
        />
      </Head>

      <main className="min-h-screen bg-slate-50 text-slate-950">
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
          <nav className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
            <Link href="/" className="flex min-w-0 items-center gap-3">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-blue-500 to-green-500 text-white shadow-lg">
                <LayoutDashboard className="h-7 w-7" />
              </span>
              <span className="min-w-0">
                <span className="block text-base font-bold leading-tight">Smart Task Allocation</span>
                <span className="block text-xs font-medium text-slate-500">For agile SME operations</span>
              </span>
            </Link>

            <div className="hidden items-center gap-7 text-sm font-semibold text-slate-600 md:flex">
              <a href="#features" className="hover:text-slate-950">Features</a>
              <a href="#workflow" className="hover:text-slate-950">Workflow</a>
              <a href="#roles" className="hover:text-slate-950">Roles</a>
              <a href="#security" className="hover:text-slate-950">Security</a>
            </div>

            <Link
              href="/login"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-blue-500 to-green-500 px-4 text-sm font-bold text-white shadow-sm hover:from-blue-600 hover:to-green-600"
            >
              Sign in
              <ArrowRight className="h-4 w-4" />
            </Link>
          </nav>
        </header>

        <section className="overflow-hidden bg-white">
          <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 py-14 sm:px-8 lg:grid-cols-[0.95fr_1.05fr] lg:py-20">
            <div>
              <div className="mb-5 inline-flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm font-bold text-green-700">
                <Gauge className="h-4 w-4" />
                Allocation decisions with operational context
              </div>
              <h1 className="max-w-3xl text-4xl font-black leading-tight text-slate-950 sm:text-5xl lg:text-6xl">
                Assign the right staff to the right task faster.
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">
                Smart Task Allocation gives SMEs a practical control center for task requests, staff availability,
                workload balance, reporting, and role-based administration.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/login"
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 text-sm font-bold text-white shadow-sm hover:bg-blue-700"
                >
                  Open application
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/login"
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-5 text-sm font-bold text-slate-800 hover:bg-slate-50"
                >
                  Register system admin
                </Link>
              </div>

              <div className="mt-9 grid max-w-2xl grid-cols-3 gap-3">
                {metrics.map((metric) => (
                  <div key={metric.label} className="rounded-lg border border-slate-200 bg-white p-4">
                    <div className={`mb-2 inline-flex rounded-lg px-2 py-1 text-xs font-bold ${metric.tone}`}>
                      {metric.label}
                    </div>
                    <div className="text-3xl font-black text-slate-950">{metric.value}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative">
              <div className="absolute -left-8 top-8 hidden h-24 w-24 rounded-lg bg-amber-100 lg:block" />
              <div className="absolute -right-7 bottom-12 hidden h-28 w-28 rounded-lg bg-green-100 lg:block" />
              <div className="relative rounded-lg border border-slate-200 bg-white shadow-2xl shadow-slate-200">
                <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                  <div>
                    <p className="text-sm font-bold text-slate-500">Manager dashboard</p>
                    <h2 className="text-xl font-black leading-tight">Today&apos;s allocation queue</h2>
                  </div>
                  <span className="rounded-lg bg-green-100 px-3 py-2 text-sm font-bold text-green-700">Live</span>
                </div>

                <div className="grid gap-4 p-5 lg:grid-cols-[1.2fr_0.8fr]">
                  <div className="space-y-3">
                    {[
                      ['Urgent room setup', '12 min away', 'High', 'bg-red-50 text-red-700'],
                      ['Inventory count', '3 staff matched', 'Medium', 'bg-amber-50 text-amber-700'],
                      ['Customer support desk', 'Best fit: Aye Chan', 'Normal', 'bg-blue-50 text-blue-700'],
                    ].map(([title, detail, priority, tone]) => (
                      <div key={title} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h3 className="font-black text-slate-950">{title}</h3>
                            <p className="mt-1 flex items-center gap-2 text-sm font-semibold text-slate-500">
                              <MapPin className="h-4 w-4" />
                              {detail}
                            </p>
                          </div>
                          <span className={`shrink-0 rounded-lg px-2 py-1 text-xs font-black ${tone}`}>{priority}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-slate-950 p-4 text-white">
                    <div className="mb-4 flex items-center justify-between">
                      <h3 className="font-black">Recommendation</h3>
                      <Sparkles className="h-5 w-5 text-amber-300" />
                    </div>
                    <div className="rounded-lg bg-white/10 p-4">
                      <p className="text-sm font-bold text-slate-300">Best match</p>
                      <p className="mt-1 text-2xl font-black">Aye Chan</p>
                      <div className="mt-4 space-y-3 text-sm">
                        <div className="flex items-center justify-between">
                          <span>Availability</span>
                          <span className="font-bold text-green-300">Available</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Workload</span>
                          <span className="font-bold">2 tasks</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Travel time</span>
                          <span className="font-bold">8 min</span>
                        </div>
                      </div>
                    </div>
                    <button className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-white text-sm font-black text-slate-950">
                      Approve assignment
                      <CheckCircle2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
          <div className="max-w-2xl">
            <p className="text-sm font-black uppercase text-blue-700">Core capabilities</p>
            <h2 className="mt-3 text-3xl font-black leading-tight text-slate-950 sm:text-4xl">
              Built for busy teams that need clarity, not extra admin work.
            </h2>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {features.map((feature) => (
              <article key={feature.title} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <feature.icon className="h-7 w-7 text-blue-600" />
                <h3 className="mt-5 text-lg font-black">{feature.title}</h3>
                <p className="mt-3 leading-7 text-slate-600">{feature.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="workflow" className="border-y border-slate-200 bg-white">
          <div className="mx-auto grid max-w-7xl gap-10 px-5 py-16 sm:px-8 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <p className="text-sm font-black uppercase text-green-700">Allocation workflow</p>
              <h2 className="mt-3 text-3xl font-black leading-tight sm:text-4xl">
                From request to proof of completion.
              </h2>
              <p className="mt-5 leading-8 text-slate-600">
                The system connects department requests, manager decisions, staff execution, and reporting without
                scattering updates across separate tools.
              </p>
            </div>

            <div className="grid gap-4">
              {steps.map((step, index) => (
                <div key={step} className="flex gap-4 rounded-lg border border-slate-200 bg-slate-50 p-5">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-slate-950 text-sm font-black text-white">
                    {index + 1}
                  </span>
                  <p className="pt-2 text-base font-semibold leading-7 text-slate-700">{step}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="roles" className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
          <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
            <div className="max-w-2xl">
              <p className="text-sm font-black uppercase text-amber-700">Role-based workspace</p>
              <h2 className="mt-3 text-3xl font-black leading-tight sm:text-4xl">
                Every user sees the work that matters to them.
              </h2>
            </div>
            <Link
              href="/login"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-black text-slate-800 hover:bg-slate-50"
            >
              Go to login
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {roles.map((role) => (
              <article key={role.title} className="rounded-lg border border-slate-200 bg-white p-5">
                <role.icon className="h-7 w-7 text-slate-900" />
                <h3 className="mt-4 text-lg font-black">{role.title}</h3>
                <ul className="mt-4 space-y-3 text-sm font-semibold text-slate-600">
                  {role.points.map((point) => (
                    <li key={point} className="flex gap-2">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <section id="security" className="bg-slate-950 text-white">
          <div className="mx-auto grid max-w-7xl gap-10 px-5 py-16 sm:px-8 lg:grid-cols-[1fr_0.9fr]">
            <div>
              <p className="text-sm font-black uppercase text-green-300">Governance included</p>
              <h2 className="mt-3 text-3xl font-black leading-tight sm:text-4xl">
                Admin controls for real workplace accountability.
              </h2>
              <p className="mt-5 max-w-2xl leading-8 text-slate-300">
                System admins can create accounts, manage permissions, reset passwords, configure allocation
                parameters, and review security or audit activity.
              </p>
            </div>

            <div className="grid gap-3">
              {[
                [BarChart3, 'Daily, weekly, and monthly reports'],
                [MessageSquareText, 'Built-in chatbot support for quick operational questions'],
                [Clock3, 'Availability and task status updates in near real time'],
                [ShieldCheck, 'Security logs and audit logs for admin review'],
              ].map(([Icon, label]) => (
                <div key={label} className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/10 p-4">
                  <Icon className="h-5 w-5 shrink-0 text-green-300" />
                  <span className="font-bold">{label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-white">
          <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 px-5 py-12 sm:px-8 md:flex-row md:items-center">
            <div>
              <h2 className="text-2xl font-black sm:text-3xl">Ready to manage allocations from one place?</h2>
              <p className="mt-2 text-slate-600">Sign in with your role or create the first system admin account.</p>
            </div>
            <Link
              href="/login"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 text-sm font-black text-white hover:bg-blue-700"
            >
              Launch Smart Task Allocation
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </main>
    </>
  )
}
