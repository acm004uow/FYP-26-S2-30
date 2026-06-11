import Head from 'next/head'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
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
    accent: 'from-blue-500 to-green-500',
    text: 'Match requests with staff based on availability, workload, proximity, skill fit, and priority.',
  },
  {
    icon: CalendarCheck,
    title: 'Live availability',
    accent: 'from-green-500 to-emerald-500',
    text: 'Give managers a clear view of who is available, unavailable, or on time off before assigning work.',
  },
  {
    icon: FileCheck2,
    title: 'Proof and feedback',
    accent: 'from-blue-500 to-cyan-500',
    text: 'Let staff update task status, upload completion proof, and receive performance feedback in one flow.',
  },
  {
    icon: ShieldCheck,
    title: 'Admin governance',
    accent: 'from-green-500 to-blue-500',
    text: 'Manage users, roles, password resets, security logs, audit logs, and allocation parameters.',
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
    title: 'Department Staff',
    icon: Workflow,
    accent: 'from-green-500 to-emerald-500',
    summary: 'Submit task requests with priority, timing, requirements, and location context.',
    points: ['Submit task requests', 'Track approvals', 'Search task history'],
  },
  {
    title: 'Staff Members',
    icon: UsersRound,
    accent: 'from-blue-500 to-cyan-500',
    summary: 'Stay updated on assigned tasks, availability, task status, and proof of completion.',
    points: ['Update availability', 'View assignments', 'Upload completion proof'],
  },
  {
    title: 'System Admins',
    icon: LockKeyhole,
    accent: 'from-green-500 to-blue-500',
    summary: 'Govern accounts, permissions, security activity, audit trails, and allocation rules.',
    points: ['Create accounts', 'Configure thresholds', 'Monitor audit activity'],
  },
]

const steps = [
  'Department staff submit a task with priority, timing, location, and requirements.',
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
  const [expandedFeature, setExpandedFeature] = useState(null)
  const [expandedRole, setExpandedRole] = useState(null)
  const featureCarouselRef = useRef(null)
  const roleCarouselRef = useRef(null)

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

  useEffect(() => {
    if (!expandedRole && !expandedFeature) return

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setExpandedRole(null)
        setExpandedFeature(null)
      }
    }

    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [expandedFeature, expandedRole])

  const scrollFeatures = (direction) => {
    featureCarouselRef.current?.scrollBy({
      left: direction === 'left' ? -360 : 360,
      behavior: 'smooth',
    })
  }

  const scrollRoles = (direction) => {
    roleCarouselRef.current?.scrollBy({
      left: direction === 'left' ? -360 : 360,
      behavior: 'smooth',
    })
  }

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

            <div className="hidden items-center rounded-full border border-slate-200 bg-white/90 p-1 text-sm font-semibold text-slate-600 shadow-lg shadow-slate-200/70 md:flex">
              {navItems.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  onClick={() => setActiveNav(item.href)}
                  className={`group relative rounded-full px-6 py-3 transition ${
                    activeNav === item.href ? 'bg-slate-100 text-slate-950' : 'hover:bg-slate-50 hover:text-slate-950'
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
                {hero.badge}
              </div>
              <h1 key={hero.title} className="hero-copy-in max-w-3xl text-3xl font-extrabold leading-tight text-slate-950 sm:text-4xl lg:text-5xl">
                {hero.title}
              </h1>
              <p key={hero.description} className="hero-copy-in mt-6 max-w-2xl text-base leading-7 text-slate-600">
                {hero.description}
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

              <div className="mt-7 flex items-center gap-3">
                {heroScenarios.map((scenario, index) => (
                  <button
                    key={scenario.title}
                    type="button"
                    onClick={() => setActiveHero(index)}
                    aria-label={`Show hero scenario ${index + 1}`}
                    className={`h-2.5 rounded-full transition-all duration-300 ${
                      activeHero === index
                        ? 'w-10 bg-gradient-to-r from-blue-500 to-green-500'
                        : 'w-2.5 bg-slate-300 hover:bg-slate-400'
                    }`}
                  />
                ))}
              </div>

              <div className="mt-9 grid max-w-2xl grid-cols-3 gap-3">
                {metrics.map((metric) => (
                  <div key={metric.label} className="rounded-lg border border-slate-200 bg-white p-4">
                    <div className={`mb-2 inline-flex rounded-lg px-2 py-1 text-xs font-bold ${metric.tone}`}>
                      {metric.label}
                    </div>
                    <div className="text-2xl font-extrabold text-slate-950">{metric.value}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative">
              <div className="absolute -left-8 top-8 hidden h-24 w-24 rounded-lg bg-amber-100 lg:block" />
              <div className="absolute -right-7 bottom-12 hidden h-28 w-28 rounded-lg bg-green-100 lg:block" />
              <div key={hero.dashboardTitle} className="hero-card-in relative rounded-lg border border-slate-200 bg-white shadow-2xl shadow-slate-200">
                <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                  <div>
                    <p className="text-sm font-bold text-slate-500">Manager dashboard</p>
                    <h2 className="text-lg font-extrabold leading-tight">{hero.dashboardTitle}</h2>
                  </div>
                  <span className="rounded-lg bg-green-100 px-3 py-2 text-sm font-bold text-green-700">{hero.status}</span>
                </div>

                <div className="grid gap-4 p-5 lg:grid-cols-[1.2fr_0.8fr]">
                  <div className="space-y-3">
                    {hero.tasks.map(([title, detail, priority, tone]) => (
                      <div key={title} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                          <h3 className="font-extrabold text-slate-950">{title}</h3>
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
                      <p className="text-sm font-bold text-slate-300">{hero.recommendation.label}</p>
                      <p className="mt-1 text-xl font-extrabold">{hero.recommendation.name}</p>
                      <div className="mt-4 space-y-3 text-sm">
                        {hero.recommendation.rows.map(([label, value, tone]) => (
                          <div key={label} className="flex items-center justify-between">
                            <span>{label}</span>
                            <span className={`font-bold ${tone}`}>{value}</span>
                          </div>
                        ))}
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

        <section id="features" className="mx-auto max-w-7xl scroll-mt-32 px-5 py-16 sm:px-8">
          <div className="max-w-2xl">
            <p className="text-sm font-black uppercase text-blue-700">Core capabilities</p>
            <h2 className="mt-3 text-2xl font-extrabold leading-tight text-slate-950 sm:text-3xl">
              Built for busy teams that need clarity, not extra admin work.
            </h2>
          </div>

          <div className="relative mt-8">
            <div
              ref={featureCarouselRef}
              className="flex snap-x gap-5 overflow-x-auto scroll-smooth pb-6 pt-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {features.map((feature, index) => {
                const FeatureIcon = feature.icon

                return (
                  <button
                    key={feature.title}
                    type="button"
                    onClick={() => setExpandedFeature(feature)}
                    className="group min-h-[300px] w-[82vw] max-w-[390px] shrink-0 snap-center rounded-3xl border border-slate-200 bg-white p-8 text-left shadow-sm transition duration-300 hover:-translate-y-2 hover:rotate-1 hover:shadow-2xl hover:shadow-slate-200 focus:outline-none focus:ring-4 focus:ring-green-100 md:w-[360px]"
                    style={{ transitionDelay: `${index * 35}ms` }}
                  >
                    <div
                      className={`mb-8 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br ${feature.accent} text-white shadow-lg transition duration-300 group-hover:scale-110`}
                    >
                      <FeatureIcon className="h-8 w-8" />
                    </div>
                    <h3 className="text-xl font-extrabold text-slate-950">{feature.title}</h3>
                    <p className="mt-5 min-h-[96px] text-sm font-semibold leading-7 text-slate-600">
                      {feature.text}
                    </p>
                    <span className="mt-7 inline-flex text-sm font-black text-blue-600">
                      View capability
                      <ArrowRight className="ml-2 h-4 w-4 transition group-hover:translate-x-1" />
                    </span>
                  </button>
                )
              })}
            </div>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => scrollFeatures('left')}
                aria-label="Scroll features left"
                className="grid h-11 w-11 place-items-center rounded-full bg-slate-950 text-white shadow-lg transition hover:bg-slate-800"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => scrollFeatures('right')}
                aria-label="Scroll features right"
                className="grid h-11 w-11 place-items-center rounded-full bg-gradient-to-r from-blue-500 to-green-500 text-white shadow-lg transition hover:from-blue-600 hover:to-green-600"
              >
                <ArrowRight className="h-5 w-5" />
              </button>
            </div>
          </div>

          {expandedFeature && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-md">
              <button
                type="button"
                className="absolute inset-0 h-full w-full cursor-default"
                aria-label="Close capability details"
                onClick={() => setExpandedFeature(null)}
              />
              <div className="relative w-full max-w-3xl rounded-3xl bg-white p-6 shadow-2xl sm:p-8">
                <button
                  type="button"
                  onClick={() => setExpandedFeature(null)}
                  aria-label="Close"
                  className="absolute right-5 top-5 grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-slate-700 transition hover:bg-slate-200"
                >
                  <X className="h-5 w-5" />
                </button>
                {(() => {
                  const ExpandedFeatureIcon = expandedFeature.icon

                  return (
                    <>
                      <div
                        className={`mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br ${expandedFeature.accent} text-white shadow-lg`}
                      >
                        <ExpandedFeatureIcon className="h-8 w-8" />
                      </div>
                      <p className="text-sm font-black uppercase text-green-700">Core capability</p>
                      <h3 className="mt-2 pr-10 text-2xl font-extrabold text-slate-950">{expandedFeature.title}</h3>
                      <p className="mt-4 max-w-2xl text-sm font-semibold leading-7 text-slate-600">
                        {expandedFeature.text}
                      </p>
                      <div className="mt-7 rounded-2xl border border-slate-200 bg-slate-50 p-5">
                        <p className="text-sm font-black uppercase text-blue-700">How it supports allocation</p>
                        <p className="mt-3 leading-7 text-slate-600">
                          This capability connects task requests, staff availability, manager decisions, and
                          administrative controls so each assignment has clear context before it is approved.
                        </p>
                      </div>
                      <Link
                        href="/login"
                        className="mt-8 inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-blue-500 to-green-500 px-5 text-sm font-black text-white hover:from-blue-600 hover:to-green-600"
                      >
                        Continue to login
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </>
                  )
                })()}
              </div>
            </div>
          )}
        </section>

        <section id="workflow" className="scroll-mt-32 border-y border-slate-200 bg-white">
          <div className="mx-auto grid max-w-7xl gap-10 px-5 py-16 sm:px-8 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <p className="text-sm font-black uppercase text-green-700">Allocation workflow</p>
              <h2 className="mt-3 text-2xl font-extrabold leading-tight sm:text-3xl">
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
                  <p className="pt-2 text-sm font-semibold leading-6 text-slate-700">{step}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="roles" className="mx-auto max-w-7xl scroll-mt-32 px-5 py-16 sm:px-8">
          <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
            <div className="max-w-2xl">
              <p className="text-sm font-black uppercase text-amber-700">Role-based workspace</p>
              <h2 className="mt-3 text-2xl font-extrabold leading-tight sm:text-3xl">
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

          <div className="relative mt-8">
            <div
              ref={roleCarouselRef}
              className="flex snap-x gap-5 overflow-x-auto scroll-smooth pb-6 pt-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {roles.map((role, index) => {
                const RoleIcon = role.icon

                return (
                  <button
                    key={role.title}
                    type="button"
                    onClick={() => setExpandedRole(role)}
                    className="group min-h-[330px] w-[82vw] max-w-[390px] shrink-0 snap-center rounded-3xl border border-slate-200 bg-white p-8 text-left shadow-sm transition duration-300 hover:-translate-y-2 hover:rotate-1 hover:shadow-2xl hover:shadow-slate-200 focus:outline-none focus:ring-4 focus:ring-green-100 md:w-[360px]"
                    style={{ transitionDelay: `${index * 35}ms` }}
                  >
                    <div
                      className={`mb-8 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br ${role.accent} text-white shadow-lg transition duration-300 group-hover:scale-110`}
                    >
                      <RoleIcon className="h-8 w-8" />
                    </div>
                    <h3 className="text-xl font-extrabold text-slate-950">{role.title}</h3>
                    <p className="mt-4 min-h-[78px] text-sm font-semibold leading-6 text-slate-500">
                      {role.summary}
                    </p>
                    <ul className="mt-6 space-y-3 text-sm font-bold text-slate-700">
                      {role.points.map((point) => (
                        <li key={point} className="flex gap-3">
                          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
                          <span>{point}</span>
                        </li>
                      ))}
                    </ul>
                    <span className="mt-7 inline-flex text-sm font-black text-blue-600">
                      View role details
                      <ArrowRight className="ml-2 h-4 w-4 transition group-hover:translate-x-1" />
                    </span>
                  </button>
                )
              })}
            </div>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => scrollRoles('left')}
                aria-label="Scroll roles left"
                className="grid h-11 w-11 place-items-center rounded-full bg-slate-950 text-white shadow-lg transition hover:bg-slate-800"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => scrollRoles('right')}
                aria-label="Scroll roles right"
                className="grid h-11 w-11 place-items-center rounded-full bg-gradient-to-r from-blue-500 to-green-500 text-white shadow-lg transition hover:from-blue-600 hover:to-green-600"
              >
                <ArrowRight className="h-5 w-5" />
              </button>
            </div>
          </div>

          {expandedRole && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-md">
              <button
                type="button"
                className="absolute inset-0 h-full w-full cursor-default"
                aria-label="Close role details"
                onClick={() => setExpandedRole(null)}
              />
              <div className="relative w-full max-w-3xl rounded-3xl bg-white p-6 shadow-2xl sm:p-8">
                <button
                  type="button"
                  onClick={() => setExpandedRole(null)}
                  aria-label="Close"
                  className="absolute right-5 top-5 grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-slate-700 transition hover:bg-slate-200"
                >
                  <X className="h-5 w-5" />
                </button>
                {(() => {
                  const ExpandedIcon = expandedRole.icon

                  return (
                    <>
                      <div
                        className={`mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br ${expandedRole.accent} text-white shadow-lg`}
                      >
                        <ExpandedIcon className="h-8 w-8" />
                      </div>
                      <p className="text-sm font-black uppercase text-green-700">Role workspace</p>
                      <h3 className="mt-2 pr-10 text-2xl font-extrabold text-slate-950">{expandedRole.title}</h3>
                      <p className="mt-4 max-w-2xl text-sm font-semibold leading-7 text-slate-600">
                        {expandedRole.summary}
                      </p>
                      <div className="mt-7 grid gap-3 sm:grid-cols-3">
                        {expandedRole.points.map((point) => (
                          <div key={point} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                            <CheckCircle2 className="h-5 w-5 text-green-600" />
                            <p className="mt-3 text-sm font-black leading-6 text-slate-800">{point}</p>
                          </div>
                        ))}
                      </div>
                      <Link
                        href="/login"
                        className="mt-8 inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-blue-500 to-green-500 px-5 text-sm font-black text-white hover:from-blue-600 hover:to-green-600"
                      >
                        Continue to login
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </>
                  )
                })()}
              </div>
            </div>
          )}
        </section>

        <section id="security" className="scroll-mt-32 bg-slate-950 text-white">
          <div className="mx-auto grid max-w-7xl gap-10 px-5 py-16 sm:px-8 lg:grid-cols-[1fr_0.9fr]">
            <div>
              <p className="text-sm font-black uppercase text-green-300">Governance included</p>
              <h2 className="mt-3 text-2xl font-extrabold leading-tight sm:text-3xl">
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
              <h2 className="text-xl font-extrabold sm:text-2xl">Ready to manage allocations from one place?</h2>
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
