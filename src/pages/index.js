import Head from 'next/head'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import {
  ArrowRight,
  BarChart3,
  CalendarCheck,
  CheckCircle2,
  Clock3,
  FileCheck2,
  LayoutDashboard,
  LockKeyhole,
  MapPin,
  Menu,
  MessageSquareText,
  ShieldCheck,
  Sparkles,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react'

const metrics = [
  { label: 'Active staff', value: '42', tone: 'bg-blue-50 text-blue-700' },
  { label: 'Open requests', value: '18', tone: 'bg-amber-50 text-amber-700' },
  { label: 'Completed today', value: '31', tone: 'bg-green-50 text-green-700' },
]

const heroScenarios = [
  {
    badge: 'Allocation decisions with operational context',
    title: 'Assign the right staff to the right task faster.',
    description:
      'Smart Task Allocation gives SMEs a practical control center for task requests, staff availability, workload balance, reporting, and role-based administration.',
    dashboardTitle: "Today's allocation queue",
    status: 'Live',
    tasks: [
      ['Urgent room setup', '12 min away', 'High', 'bg-red-50 text-red-700'],
      ['Inventory count', '3 staff matched', 'Medium', 'bg-amber-50 text-amber-700'],
      ['Customer support desk', 'Best fit: Aye Chan', 'Normal', 'bg-blue-50 text-blue-700'],
    ],
    recommendation: {
      label: 'Best match',
      name: 'Aye Chan',
      rows: [
        ['Availability', 'Available', 'text-green-300'],
        ['Workload', '2 tasks', 'text-white'],
        ['Travel time', '8 min', 'text-white'],
      ],
    },
  },
  {
    badge: 'Availability updates before every assignment',
    title: 'See capacity before you approve the next request.',
    description:
      'Managers can compare who is free, who is already busy, and who is on time off before confirming work.',
    dashboardTitle: 'Live staff availability',
    status: 'Updated',
    tasks: [
      ['Morning stock check', '4 staff available', 'Open', 'bg-green-50 text-green-700'],
      ['Front desk support', '2 staff nearby', 'Medium', 'bg-amber-50 text-amber-700'],
      ['Delivery handover', '1 staff matched', 'Normal', 'bg-blue-50 text-blue-700'],
    ],
    recommendation: {
      label: 'Available now',
      name: 'Myo Thant',
      rows: [
        ['Availability', 'Available', 'text-green-300'],
        ['Workload', '1 task', 'text-white'],
        ['Distance', '5 min', 'text-white'],
      ],
    },
  },
  {
    badge: 'Proof, feedback, and reporting in one loop',
    title: 'Close each task with evidence and clear reporting.',
    description:
      'Staff can update progress and upload proof while managers review completion history and generate reports.',
    dashboardTitle: 'Completion review',
    status: 'Ready',
    tasks: [
      ['Service counter setup', 'Proof uploaded', 'Done', 'bg-green-50 text-green-700'],
      ['Storage audit', 'Feedback pending', 'Review', 'bg-amber-50 text-amber-700'],
      ['Customer support desk', 'In progress', 'Active', 'bg-blue-50 text-blue-700'],
    ],
    recommendation: {
      label: 'Report focus',
      name: '31 tasks',
      rows: [
        ['Completed today', '31', 'text-green-300'],
        ['Pending review', '4', 'text-white'],
        ['Avg response', '9 min', 'text-white'],
      ],
    },
  },
]

const features = [
  {
    icon: Sparkles,
    title: 'Smart recommendations',
    text: 'Match requests with staff based on availability, workload, proximity, skill fit, and priority, all weighted automatically.',
  },
  {
    icon: CalendarCheck,
    title: 'Live availability',
    text: 'Give managers a clear view of who is available, unavailable, or on time off before confirming any work assignment.',
  },
  {
    icon: FileCheck2,
    title: 'Proof and feedback',
    text: 'Staff update task status, upload completion proof, and receive feedback. Managers close the loop with structured reports.',
  },
  {
    icon: ShieldCheck,
    title: 'Admin governance',
    text: 'Manage users, roles, password resets, security logs, audit trails, and allocation parameters from a single admin panel.',
  },
]

const roles = [
  {
    title: 'Managers',
    icon: LayoutDashboard,
    accent: 'from-blue-500 to-green-500',
    summary: 'Coordinate task approvals, staff matching, and operational reporting from one dashboard.',
    points: ['Approve task requests', 'Review recommended staff', 'Generate operational reports'],
  },
  {
    title: 'Customers',
    icon: UserRound,
    accent: 'from-green-500 to-emerald-500',
    summary: 'Book cleaning services online and track booking status from request to completion.',
    points: ['Book a service', 'Track booking status', 'View booking history'],
  },
  {
    title: 'Staff Members',
    icon: UsersRound,
    accent: 'from-blue-500 to-cyan-500',
    summary: 'Stay updated on assigned tasks, availability, task status, and proof of completion.',
    points: ['Update availability', 'View assignments', 'Upload completion proof'],
  },
  {
    title: 'Owners',
    icon: LockKeyhole,
    accent: 'from-green-500 to-blue-500',
    summary: 'Govern accounts, permissions, security activity, audit trails, and allocation rules.',
    points: ['Create accounts', 'Configure thresholds', 'Monitor audit activity'],
  },
]

const steps = [
  'Customers book a service or managers create a task with priority, timing, and location.',
  'The system ranks available staff using workload, proximity, skills, and policy weights.',
  'Managers approve, assign, monitor progress, and close the loop with reports.',
]

const navItems = [
  { label: 'Features', href: '#features' },
  { label: 'Workflow', href: '#workflow' },
  { label: 'Roles', href: '#roles' },
  { label: 'Security', href: '#security' },
]

export default function MarketingHome() {
  const [activeHero, setActiveHero] = useState(0)
  const [activeNav, setActiveNav] = useState('#features')
  const [activeStep, setActiveStep] = useState(0)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useEffect(() => {
    const syncActiveNav = () => {
      const currentHash = window.location.hash
      setActiveNav(navItems.some((item) => item.href === currentHash) ? currentHash : '#features')
    }

    syncActiveNav()
    window.addEventListener('hashchange', syncActiveNav)
    return () => window.removeEventListener('hashchange', syncActiveNav)
  }, [])

  useEffect(() => {
    const sections = navItems
      .map((item) => document.querySelector(item.href))
      .filter(Boolean)

    if (!sections.length) return undefined

    const observer = new IntersectionObserver(
      (entries) => {
        const visibleEntries = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)

        if (visibleEntries[0]) {
          setActiveNav(`#${visibleEntries[0].target.id}`)
        }
      },
      {
        rootMargin: '-28% 0px -58% 0px',
        threshold: [0.1, 0.35, 0.6],
      }
    )

    sections.forEach((section) => observer.observe(section))
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveHero((current) => (current + 1) % heroScenarios.length)
    }, 5500)

    return () => clearInterval(interval)
  }, [])

  const hero = heroScenarios[activeHero]

  return (
    <>
      <Head>
        <title>Smart Task Allocation | Workforce scheduling for SMEs</title>
        <meta
          name="description"
          content="Smart Task Allocation helps SMEs assign work using availability, workload, proximity, priority, and role-based governance."
        />
      </Head>

      <style jsx global>{`
        @keyframes hero-copy-in {
          from {
            opacity: 0;
            transform: translateY(14px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes hero-card-in {
          from {
            opacity: 0;
            transform: translateX(34px) scale(0.97);
          }
          to {
            opacity: 1;
            transform: translateX(0) scale(1);
          }
        }

        .hero-copy-in {
          animation: hero-copy-in 520ms ease both;
        }

        .hero-card-in {
          animation: hero-card-in 560ms ease both;
        }
      `}</style>

      <main className="min-h-screen bg-[#f6f9fc] text-slate-950">
        <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
          <nav className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-3 sm:px-8">
            <Link href="/" className="flex min-w-0 items-center gap-3">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-blue-500 to-green-500 text-white shadow-lg">
                <LayoutDashboard className="h-7 w-7" />
              </span>
              <span className="min-w-0">
                <span className="block text-base font-bold leading-tight">Smart Task Allocation</span>
                <span className="block text-xs font-medium text-slate-500">For agile SME operations</span>
              </span>
            </Link>

            <div className="hidden items-center rounded-full border border-slate-200 bg-white/95 p-1 text-sm font-semibold text-slate-600 shadow-xl shadow-slate-200/80 md:flex">
              {navItems.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  onClick={() => setActiveNav(item.href)}
                  className={`group relative rounded-full px-6 py-3 transition ${
                    activeNav === item.href ? 'bg-slate-100 text-slate-950 shadow-sm' : 'hover:bg-slate-50 hover:text-slate-950'
                  }`}
                >
                  <span
                    className={`absolute left-1/2 top-0 h-1 w-9 -translate-x-1/2 -translate-y-2 rounded-full bg-gradient-to-r from-blue-500 to-green-500 shadow-[0_0_18px_rgba(34,197,94,0.55)] transition ${
                      activeNav === item.href ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                    }`}
                  />
                  {item.label}
                </a>
              ))}
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              <Link
                href="/marketplace"
                className="hidden sm:inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 text-sm font-bold text-slate-800 transition hover:-translate-y-0.5 hover:bg-slate-50 hover:shadow-md"
              >
                Browse companies
              </Link>
              <Link
                href="/login"
                className="hidden h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-500 to-green-500 px-5 text-sm font-bold text-white shadow-lg shadow-green-200/70 transition hover:-translate-y-0.5 hover:from-blue-600 hover:to-green-600 sm:inline-flex"
              >
                Sign in / Sign up
                <ArrowRight className="h-4 w-4" />
              </Link>
              <button
                type="button"
                onClick={() => setMobileMenuOpen((open) => !open)}
                className="grid h-11 w-11 place-items-center rounded-xl border border-slate-200 bg-white text-slate-800 md:hidden"
                aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
                aria-expanded={mobileMenuOpen}
              >
                {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
            </div>
          </nav>
          {mobileMenuOpen && (
            <div className="border-t border-slate-200 bg-white px-5 py-4 shadow-xl md:hidden">
              <div className="mx-auto grid max-w-7xl gap-1">
                {navItems.map((item) => (
                  <a key={item.href} href={item.href} onClick={() => setMobileMenuOpen(false)} className="rounded-xl px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50">
                    {item.label}
                  </a>
                ))}
                <div className="mt-3 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4">
                  <Link href="/marketplace" className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 text-sm font-bold text-slate-800">Browse companies</Link>
                  <Link href="/login" className="inline-flex h-11 items-center justify-center rounded-xl bg-slate-950 text-sm font-bold text-white">Sign in / Sign up</Link>
                </div>
              </div>
            </div>
          )}
        </header>

        <section className="relative overflow-hidden bg-slate-950 text-white">
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(148,163,184,0.09)_1px,transparent_1px),linear-gradient(180deg,rgba(148,163,184,0.09)_1px,transparent_1px)] bg-[size:64px_64px]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_20%,rgba(79,70,229,0.18),transparent_32%),radial-gradient(circle_at_82%_70%,rgba(34,197,94,0.14),transparent_30%)]" />
          <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-5 py-16 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:py-24">
            <div className="relative">
              <div className="mb-6 inline-flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-[0.18em] text-emerald-300">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                {hero.badge}
              </div>
              <h1 key={hero.title} className="hero-copy-in max-w-3xl text-4xl font-black leading-[1.04] tracking-tight text-white sm:text-5xl lg:text-6xl">
                {activeHero === 0 ? (
                  <>
                    Assign the <span className="text-indigo-400">right staff</span> to every task, faster.
                  </>
                ) : (
                  hero.title
                )}
              </h1>
              <p key={hero.description} className="hero-copy-in mt-6 max-w-xl text-base font-semibold leading-8 text-slate-400">
                {hero.description}
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link href="/login" className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-white px-6 text-sm font-black text-slate-950 transition hover:-translate-y-0.5 hover:bg-emerald-50">
                  Get started free <ArrowRight className="h-4 w-4" />
                </Link>
                <Link href="/marketplace" className="inline-flex h-12 items-center justify-center rounded-xl border border-white/20 bg-white/5 px-6 text-sm font-bold text-white transition hover:bg-white/10">
                  Find a service company
                </Link>
              </div>

              <div className="mt-9 flex items-center gap-3">
                {heroScenarios.map((scenario, index) => (
                  <button
                    key={scenario.title}
                    type="button"
                    onClick={() => setActiveHero(index)}
                    aria-label={`Show hero scenario ${index + 1}`}
                    className={`h-2.5 rounded-full transition-all duration-300 ${
                      activeHero === index
                        ? 'w-10 bg-white'
                        : 'w-2.5 bg-white/20 hover:bg-white/40'
                    }`}
                  />
                ))}
              </div>

              <div className="mt-9 grid max-w-lg grid-cols-3 gap-3">
                {metrics.map((metric) => (
                  <div key={metric.label} className="border-l border-white/10 pl-5 first:border-l-0 first:pl-0">
                    <div className="text-3xl font-black text-white">{metric.value}</div>
                    <div className="mt-1 font-mono text-xs font-bold text-slate-500">{metric.label}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative">
              <div className="absolute -right-4 -top-4 hidden h-24 w-24 rounded-2xl bg-white/5 lg:block" />
              <div className="absolute -bottom-5 left-8 hidden h-24 w-24 rounded-2xl bg-indigo-500/10 lg:block" />
              <div key={hero.dashboardTitle} className="hero-card-in relative rounded-3xl border border-white/10 bg-white/8 shadow-2xl shadow-black/40 backdrop-blur">
                <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
                  <div>
                    <p className="text-sm font-bold text-white">Manager dashboard</p>
                    <h2 className="font-mono text-xs font-bold text-slate-500">{hero.dashboardTitle}</h2>
                  </div>
                  <span className="rounded-lg bg-emerald-400/10 px-3 py-2 font-mono text-xs font-bold text-emerald-300">• {hero.status}</span>
                </div>

                <div className="grid gap-4 p-5 lg:grid-cols-[1.2fr_0.8fr]">
                  <div className="space-y-3">
                    {hero.tasks.map(([title, detail, priority, tone]) => (
                      <div key={title} className="rounded-xl border border-white/10 bg-white/5 p-4 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h3 className="font-extrabold text-white">{title}</h3>
                            <p className="mt-1 flex items-center gap-2 font-mono text-xs font-semibold text-slate-500">
                              <MapPin className="h-4 w-4" />
                              {detail}
                            </p>
                          </div>
                          <span className={`shrink-0 rounded-lg px-2 py-1 text-xs font-black ${tone}`}>{priority}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-2xl border border-indigo-400/20 bg-indigo-600 p-4 text-white shadow-xl shadow-black/30">
                    <div className="mb-4 flex items-center justify-between">
                      <h3 className="font-mono text-xs font-black uppercase text-indigo-100">Best match</h3>
                      <Sparkles className="h-5 w-5 text-indigo-100" />
                    </div>
                    <div className="rounded-2xl bg-white/10 p-4">
                      <p className="text-sm font-bold text-indigo-100">{hero.recommendation.label}</p>
                      <p className="mt-1 text-2xl font-black">{hero.recommendation.name}</p>
                      <div className="mt-4 space-y-3 text-sm">
                        {hero.recommendation.rows.map(([label, value, tone]) => (
                          <div key={label} className="flex items-center justify-between">
                            <span>{label}</span>
                            <span className={`font-bold ${tone}`}>{value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <button className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/15 text-sm font-black text-white shadow-sm transition hover:bg-white/20">
                      Approve assignment
                      <CheckCircle2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="border-b border-slate-200 bg-white">
          <div className="mx-auto grid max-w-7xl gap-6 px-5 py-8 sm:grid-cols-3 sm:px-8">
            {[
              ['One shared workspace', 'Requests, schedules, assignments, proof, and reports stay connected.'],
              ['Decisions with context', 'Availability, workload, distance, and priority inform every match.'],
              ['Built for accountability', 'Role permissions and audit history make every action traceable.'],
            ].map(([title, text]) => (
              <div key={title} className="flex gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
                <div><p className="font-extrabold text-slate-950">{title}</p><p className="mt-1 text-sm leading-6 text-slate-600">{text}</p></div>
              </div>
            ))}
          </div>
        </section>

        <section id="features" className="mx-auto max-w-7xl scroll-mt-32 px-5 py-16 sm:px-8">
          <div className="max-w-2xl">
            <p className="text-sm font-black uppercase tracking-[0.18em] text-indigo-600">Core capabilities</p>
            <h2 className="mt-4 text-3xl font-extrabold leading-tight text-slate-950 sm:text-4xl">
              Built for busy teams that need clarity, not extra admin work.
            </h2>
          </div>

          <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {features.map((feature) => {
              const FeatureIcon = feature.icon

              return (
                <article
                  key={feature.title}
                  className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm transition duration-300 hover:-translate-y-1 hover:border-indigo-100 hover:shadow-xl hover:shadow-slate-200/80"
                >
                  <div className="mb-7 grid h-12 w-12 place-items-center rounded-xl border border-slate-200 bg-slate-50 text-indigo-600 shadow-sm">
                    <FeatureIcon className="h-6 w-6" />
                  </div>
                  <h3 className="text-base font-extrabold text-slate-950">{feature.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-slate-700">{feature.text}</p>
                </article>
              )
            })}
          </div>
        </section>

        <section id="workflow" className="scroll-mt-32 bg-slate-50">
          <div className="mx-auto grid max-w-7xl gap-12 px-5 py-20 sm:px-8 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.18em] text-indigo-600">Allocation workflow</p>
              <h2 className="mt-4 text-3xl font-extrabold leading-tight sm:text-4xl">
                From request to proof of completion.
              </h2>
              <p className="mt-5 max-w-lg leading-8 text-slate-700">
                The system connects department requests, manager decisions, staff execution, and reporting without
                scattering updates across separate tools.
              </p>
            </div>

            <div className="grid gap-9">
              {steps.map((step, index) => (
                <button
                  key={step}
                  type="button"
                  onClick={() => setActiveStep(index)}
                  className={`group flex w-full gap-5 rounded-xl p-4 text-left transition ${
                    activeStep === index ? 'bg-indigo-50 shadow-sm' : 'hover:bg-white/70'
                  }`}
                >
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-950 font-mono text-xs font-black text-white transition ${
                    activeStep === index ? 'shadow-lg shadow-slate-300' : 'shadow-md group-hover:shadow-lg'
                  }`}>
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <p className="pt-1 text-base font-semibold leading-7 text-slate-700">{step}</p>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section id="roles" className="mx-auto max-w-7xl scroll-mt-32 px-5 py-20 sm:px-8">
          <div className="max-w-2xl">
            <p className="text-sm font-black uppercase tracking-[0.18em] text-indigo-600">Role-based workspace</p>
            <h2 className="mt-4 text-3xl font-extrabold leading-tight sm:text-4xl">
              Every user sees the work that matters to them.
            </h2>
          </div>

          <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {roles.map((role) => {
              const RoleIcon = role.icon

              return (
                <article
                  key={role.title}
                  className="rounded-2xl border border-slate-200 bg-slate-50/80 p-6 transition duration-300 hover:-translate-y-1 hover:bg-white hover:shadow-xl hover:shadow-slate-200/80"
                >
                  <div className="mb-5 grid h-11 w-11 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm">
                    <RoleIcon className="h-5 w-5" />
                  </div>
                  <h3 className="font-extrabold text-slate-950">{role.title}</h3>
                  <p className="mt-3 min-h-[84px] text-sm leading-6 text-slate-700">{role.summary}</p>
                  <ul className="mt-5 space-y-2 text-sm font-bold text-slate-950">
                    {role.points.map((point) => (
                      <li key={point} className="flex gap-2">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                </article>
              )
            })}
          </div>
        </section>

        <section id="security" className="scroll-mt-32 bg-slate-950 text-white">
          <div className="mx-auto grid max-w-7xl gap-12 px-5 py-24 sm:px-8 lg:grid-cols-[1fr_0.95fr]">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.18em] text-emerald-300">Governance included</p>
              <h2 className="mt-4 text-3xl font-extrabold leading-tight sm:text-4xl">
                Admin controls for real workplace accountability.
              </h2>
              <p className="mt-5 max-w-xl leading-8 text-slate-400">
                Owners can create accounts, manage permissions, reset passwords, configure allocation
                parameters, and review security or audit activity, all in one place.
              </p>
            </div>

            <div className="grid gap-4">
              {[
                [BarChart3, 'Daily, weekly, and monthly reports'],
                [MessageSquareText, 'Built-in chatbot support for quick operational questions'],
                [Clock3, 'Availability and task status updates in near real time'],
                [ShieldCheck, 'Security logs and audit logs for admin review'],
              ].map(([Icon, label]) => (
                <div key={label} className="flex items-center gap-4 rounded-xl border border-white/10 bg-white/5 p-5 transition hover:bg-white/10">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-emerald-400/10 text-emerald-300">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="font-bold">{label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="relative overflow-hidden bg-white px-5 py-20 sm:px-8">
          <div className="absolute left-1/2 top-0 h-64 w-64 -translate-x-1/2 rounded-full bg-emerald-200/40 blur-3xl" />
          <div className="relative mx-auto max-w-5xl overflow-hidden rounded-[2rem] bg-gradient-to-br from-blue-600 via-indigo-600 to-emerald-500 px-6 py-14 text-center text-white shadow-2xl shadow-blue-200 sm:px-12">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-100">Ready when your team is</p>
            <h2 className="mx-auto mt-4 max-w-2xl text-3xl font-black tracking-tight sm:text-5xl">Turn incoming work into clear, accountable action.</h2>
            <p className="mx-auto mt-5 max-w-xl leading-7 text-blue-50">Create your workspace, bring your team together, and make the next assignment with better information.</p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Link href="/login" className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-white px-7 text-sm font-black text-indigo-700 shadow-lg transition hover:-translate-y-0.5">Create an account <ArrowRight className="h-4 w-4" /></Link>
              <Link href="/marketplace" className="inline-flex h-12 items-center justify-center rounded-xl border border-white/30 bg-white/10 px-7 text-sm font-bold text-white transition hover:bg-white/20">Browse the marketplace</Link>
            </div>
          </div>
        </section>

      </main>
    </>
  )
}
