import Head from 'next/head'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import {
  ArrowRight, Building2, CalendarCheck, Headphones, LayoutDashboard, MapPin, Plus, Search, ShieldCheck, Sparkles, Star,
} from 'lucide-react'
import Layout from '../components/Layout'
import { supabase } from '../../lib/supabaseClient'
import { SERVICE_TYPES } from '../../lib/serviceTypes'

function useCompanies() {
  const [companies, setCompanies] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('public_marketing_listings')
        .select('id,business_name,marketing_description,service_rates,avg_rating,review_count')
        .not('business_name', 'is', null)
        .order('business_name')

      setCompanies(data || [])
      setLoading(false)
    })()
  }, [])

  return { companies, loading }
}

const SORT_OPTIONS = [
  { value: 'rating', label: 'Highest rated' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'name', label: 'Name A-Z' },
]

function cheapestRate(company) {
  const values = Object.values(company.service_rates || {}).map(Number).filter(v => Number.isFinite(v) && v > 0)
  return values.length ? Math.min(...values) : Infinity
}

// Shared by both the public (logged-out) and customer (logged-in) marketplace views so search,
// service filter, and sort behave identically wherever this list is rendered.
function useFilteredCompanies(companies) {
  const [search, setSearch] = useState('')
  const [serviceFilter, setServiceFilter] = useState('all')
  const [sortBy, setSortBy] = useState('rating')

  const availableServices = useMemo(() => {
    const set = new Set()
    companies.forEach(company => Object.keys(company.service_rates || {}).forEach(type => set.add(type)))
    return [...set].sort()
  }, [companies])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    const rows = companies.filter(company => {
      const name = (company.business_name || '').trim().toLowerCase()
      const description = (company.marketing_description || '').toLowerCase()
      const matchesSearch = !term || name.includes(term) || description.includes(term)
      const matchesService = serviceFilter === 'all' || Number(company.service_rates?.[serviceFilter]) > 0
      return matchesSearch && matchesService
    })

    return [...rows].sort((a, b) => {
      if (sortBy === 'rating') return (Number(b.avg_rating) || 0) - (Number(a.avg_rating) || 0)
      if (sortBy === 'price_asc') return cheapestRate(a) - cheapestRate(b)
      if (sortBy === 'price_desc') return cheapestRate(b) - cheapestRate(a)
      return (a.business_name || '').trim().localeCompare((b.business_name || '').trim())
    })
  }, [companies, search, serviceFilter, sortBy])

  return { filtered, search, setSearch, serviceFilter, setServiceFilter, sortBy, setSortBy, availableServices }
}

function StarRating({ rating, count }) {
  const value = Number(rating) || 0
  return (
    <span className="inline-flex items-center gap-1">
      <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
      <span className="font-bold text-slate-800">{value > 0 ? value.toFixed(1) : 'New'}</span>
      {count > 0 && <span className="text-slate-400">({count} review{count === 1 ? '' : 's'})</span>}
    </span>
  )
}

function MarketplaceControls({ search, setSearch, serviceFilter, setServiceFilter, sortBy, setSortBy, availableServices }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm shadow-slate-200/60 sm:flex-row sm:items-center">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={search}
          onChange={event => setSearch(event.target.value)}
          placeholder="Search company or service..."
          className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
        />
      </div>
      <select
        value={serviceFilter}
        onChange={event => setServiceFilter(event.target.value)}
        className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
      >
        <option value="all">All Services</option>
        {availableServices.map(type => <option key={type} value={type}>{type}</option>)}
      </select>
      <select
        value={sortBy}
        onChange={event => setSortBy(event.target.value)}
        className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
      >
        {SORT_OPTIONS.map(option => <option key={option.value} value={option.value}>Sort: {option.label}</option>)}
      </select>
    </div>
  )
}

function MarketplaceHero({ stats }) {
  return (
    <div className="relative overflow-hidden rounded-[2rem] border border-slate-200 bg-slate-950 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_15%,rgba(79,70,229,0.35),transparent_38%),radial-gradient(circle_at_85%_75%,rgba(34,197,94,0.28),transparent_36%)]" />
      <div className="relative z-10 grid gap-8 px-6 py-10 sm:px-10 sm:py-14 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-300">
            <Sparkles className="h-3.5 w-3.5" /> AI-matched cleaning companies
          </span>
          <h1 className="mt-5 max-w-lg text-4xl font-black leading-[1.05] tracking-tight sm:text-5xl">
            Find your best-fit cleaner, not just a list of ads.
          </h1>
          <p className="mt-4 max-w-md text-base font-medium leading-7 text-slate-400">
            Compare verified companies, real ratings, and transparent pricing, then book a slot that works for you.
          </p>

          {stats.loaded && stats.companies > 0 && (
            <div className="mt-8 flex max-w-md flex-wrap gap-6">
              <div className="border-l border-white/10 pl-4">
                <div className="text-2xl font-black">{stats.companies}</div>
                <div className="mt-0.5 font-mono text-[11px] font-bold text-slate-500">Verified companies</div>
              </div>
              <div className="border-l border-white/10 pl-4">
                <div className="text-2xl font-black">{stats.reviews}</div>
                <div className="mt-0.5 font-mono text-[11px] font-bold text-slate-500">Customer reviews</div>
              </div>
              <div className="border-l border-white/10 pl-4">
                <div className="flex items-center gap-1 text-2xl font-black">
                  {stats.avgRating !== null && <Star className="h-4 w-4 fill-amber-400 text-amber-400" />}
                  {stats.avgRating !== null ? stats.avgRating.toFixed(1) : 'New'}
                </div>
                <div className="mt-0.5 font-mono text-[11px] font-bold text-slate-500">Average rating</div>
              </div>
            </div>
          )}
        </div>

        <div className="relative hidden lg:block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/marketing.png"
            alt=""
            aria-hidden="true"
            className="pointer-events-none ml-auto w-full max-w-md rounded-2xl object-cover"
          />
        </div>
      </div>
    </div>
  )
}

const WHY_BOOK_ITEMS = [
  { icon: ShieldCheck, title: 'Trusted & Verified', description: 'All companies are verified for your peace of mind.' },
  { icon: Star, title: 'Compare & Choose', description: 'Compare services, prices and ratings easily.' },
  { icon: CalendarCheck, title: 'Instant Booking', description: 'Book a slot instantly that fits your schedule.' },
  { icon: Headphones, title: 'Reliable Support', description: "We're here to help before and after booking." },
]

function WhyBookSection() {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-8">
      <h2 className="text-center text-lg font-extrabold text-slate-950">Why book through our marketplace?</h2>
      <div className="mt-8 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
        {WHY_BOOK_ITEMS.map(item => (
          <div key={item.title} className="flex flex-col items-center text-center">
            <span className="grid h-12 w-12 place-items-center rounded-xl border border-slate-200 bg-slate-50 text-indigo-600 shadow-sm">
              <item.icon className="h-5 w-5" />
            </span>
            <p className="mt-3 text-sm font-extrabold text-slate-950">{item.title}</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">{item.description}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function CompanyCard({ company }) {
  const rateEntries = SERVICE_TYPES
    .map(type => [type, company.service_rates?.[type]])
    .filter(([, price]) => price !== undefined && price !== null && Number(price) > 0)
    .slice(0, 4)

  return (
    <div className="flex flex-col rounded-3xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/60 transition duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-slate-200/80">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-blue-500 to-green-500 text-white shadow-sm">
            <Building2 className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-base font-extrabold text-slate-950">{(company.business_name || '').trim()}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
              <StarRating rating={company.avg_rating} count={company.review_count} />
              <span aria-hidden="true" className="text-slate-300">&middot;</span>
              <span className="inline-flex items-center gap-1 text-slate-500"><MapPin className="h-3 w-3" /> Singapore</span>
            </div>
          </div>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
          <ShieldCheck className="h-3.5 w-3.5" /> Verified
        </span>
      </div>

      {company.marketing_description && (
        <p className="text-sm leading-6 text-slate-600">{company.marketing_description}</p>
      )}

      {rateEntries.length > 0 && (
        <div className="mt-4 space-y-1.5 border-t border-slate-100 pt-4">
          <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">Popular Services</p>
          {rateEntries.map(([type, price]) => (
            <div key={type} className="flex items-center justify-between text-sm">
              <span className="text-slate-500">{type}</span>
              <span className="font-bold text-slate-900">${Number(price).toFixed(2)}</span>
            </div>
          ))}
        </div>
      )}

      <Link
        href={`/customer-book?companyId=${company.id}`}
        className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-green-500 px-4 py-3 text-sm font-bold text-white shadow-md shadow-blue-200/60 transition hover:-translate-y-0.5 hover:shadow-lg"
      >
        Book a slot
        <ArrowRight className="h-4 w-4" />
      </Link>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] font-medium text-slate-400">
        <span className="inline-flex items-center gap-1"><ShieldCheck className="h-3 w-3" /> Background-checked staff</span>
        <span className="inline-flex items-center gap-1"><CalendarCheck className="h-3 w-3" /> Easy online booking</span>
        <span className="inline-flex items-center gap-1"><Headphones className="h-3 w-3" /> Customer support</span>
      </div>
    </div>
  )
}

// Fills the empty grid space (and doubles as a lead-gen nudge) when the marketplace only has a
// handful of listings so far — a sparse grid otherwise reads as broken rather than early-stage.
function JoinMarketplaceCard() {
  return (
    <Link
      href="/login"
      className="flex min-h-[220px] flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-200 bg-slate-50/60 p-6 text-center transition hover:border-indigo-300 hover:bg-indigo-50/40"
    >
      <span className="grid h-12 w-12 place-items-center rounded-2xl border border-slate-200 bg-white text-indigo-600 shadow-sm">
        <Plus className="h-5 w-5" />
      </span>
      <p className="mt-4 text-sm font-extrabold text-slate-900">Run a cleaning business?</p>
      <p className="mt-1 max-w-[16rem] text-xs leading-5 text-slate-500">
        List your company here with an AI-written description and start getting bookings.
      </p>
      <span className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-indigo-600">
        Get started <ArrowRight className="h-3.5 w-3.5" />
      </span>
    </Link>
  )
}

function useMarketStats(companies) {
  return useMemo(() => {
    const reviews = companies.reduce((sum, c) => sum + (Number(c.review_count) || 0), 0)
    const weightedSum = companies.reduce((sum, c) => sum + (Number(c.avg_rating) || 0) * (Number(c.review_count) || 0), 0)
    return {
      loaded: true,
      companies: companies.length,
      reviews,
      avgRating: reviews > 0 ? weightedSum / reviews : null,
    }
  }, [companies])
}

function CustomerMarketplace() {
  const { companies, loading } = useCompanies()
  const {
    filtered, search, setSearch, serviceFilter, setServiceFilter, sortBy, setSortBy, availableServices,
  } = useFilteredCompanies(companies)
  const stats = useMarketStats(companies)

  return (
    <Layout role="customer">
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        <MarketplaceHero stats={stats} />

        <MarketplaceControls
          search={search} setSearch={setSearch}
          serviceFilter={serviceFilter} setServiceFilter={setServiceFilter}
          sortBy={sortBy} setSortBy={setSortBy}
          availableServices={availableServices}
        />

        {loading ? (
          <p className="text-slate-400">Loading companies...</p>
        ) : filtered.length === 0 ? (
          <p className="text-slate-400">No companies match your search.</p>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map(company => <CompanyCard key={company.id} company={company} />)}
            {filtered.length < 3 && <JoinMarketplaceCard />}
          </div>
        )}

        <WhyBookSection />
      </div>
    </Layout>
  )
}

function PublicMarketplace() {
  const { companies, loading } = useCompanies()
  const {
    filtered, search, setSearch, serviceFilter, setServiceFilter, sortBy, setSortBy, availableServices,
  } = useFilteredCompanies(companies)
  const stats = useMarketStats(companies)

  return (
    <>
      <Head>
        <title>Browse Companies | Smart Task Allocation</title>
        <meta name="description" content="Browse cleaning service companies and book a slot." />
      </Head>

      <main className="min-h-screen bg-[#f6f9fc] text-slate-950">
        <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
          <nav className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
            <Link href="/" className="flex min-w-0 items-center gap-3">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-blue-500 to-green-500 text-white shadow-lg">
                <LayoutDashboard className="h-7 w-7" />
              </span>
              <span className="min-w-0">
                <span className="block text-base font-bold leading-tight">Smart Task Allocation</span>
                <span className="block text-xs font-medium text-slate-500">Browse companies</span>
              </span>
            </Link>
            <Link
              href="/login"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-500 to-green-500 px-5 text-sm font-bold text-white shadow-lg shadow-green-200/70 transition hover:-translate-y-0.5 hover:from-blue-600 hover:to-green-600"
            >
              Sign in
              <ArrowRight className="h-4 w-4" />
            </Link>
          </nav>
        </header>

        <section className="mx-auto max-w-7xl space-y-6 px-5 py-8 sm:px-8 sm:py-10">
          <MarketplaceHero stats={stats} />

          <MarketplaceControls
            search={search} setSearch={setSearch}
            serviceFilter={serviceFilter} setServiceFilter={setServiceFilter}
            sortBy={sortBy} setSortBy={setSortBy}
            availableServices={availableServices}
          />

          {loading ? (
            <p className="text-slate-400">Loading companies...</p>
          ) : filtered.length === 0 ? (
            <p className="text-slate-400">No companies match your search.</p>
          ) : (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {filtered.map(company => <CompanyCard key={company.id} company={company} />)}
              {filtered.length < 3 && <JoinMarketplaceCard />}
            </div>
          )}

          <WhyBookSection />
        </section>
      </main>
    </>
  )
}

export default function Marketplace() {
  const [isCustomer, setIsCustomer] = useState(false)

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      if (profile?.role === 'customer') setIsCustomer(true)
    })()
  }, [])

  return isCustomer ? <CustomerMarketplace /> : <PublicMarketplace />
}
