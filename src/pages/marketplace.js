import Head from 'next/head'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ArrowRight, Building2, LayoutDashboard } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { SERVICE_TYPES } from '../../lib/serviceTypes'

export default function Marketplace() {
  const [companies, setCompanies] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('public_marketing_listings')
        .select('id,business_name,marketing_description,service_rates')
        .not('business_name', 'is', null)
        .order('business_name')

      setCompanies(data || [])
      setLoading(false)
    })()
  }, [])

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
              href="/login?mode=signin"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-500 to-green-500 px-5 text-sm font-bold text-white shadow-lg shadow-green-200/70 transition hover:-translate-y-0.5 hover:from-blue-600 hover:to-green-600"
            >
              Sign in
              <ArrowRight className="h-4 w-4" />
            </Link>
          </nav>
        </header>

        <section className="mx-auto max-w-7xl px-5 py-12 sm:px-8">
          <h1 className="text-3xl font-extrabold leading-tight text-slate-950 sm:text-4xl">Find a cleaning company</h1>
          <p className="mt-3 max-w-2xl text-slate-600">Browse companies, see their services and rates, then book a slot directly.</p>

          {loading ? (
            <p className="mt-10 text-slate-400">Loading companies...</p>
          ) : companies.length === 0 ? (
            <p className="mt-10 text-slate-400">No companies are listed yet. Check back soon.</p>
          ) : (
            <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {companies.map(company => {
                const rateEntries = SERVICE_TYPES
                  .map(type => [type, company.service_rates?.[type]])
                  .filter(([, price]) => price !== undefined && price !== null && Number(price) > 0)

                return (
                  <article key={company.id} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-xl">
                    <div className="mb-4 flex items-center gap-3">
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-slate-200 bg-slate-50 text-indigo-600">
                        <Building2 className="h-5 w-5" />
                      </span>
                      <h2 className="font-extrabold text-slate-950">{company.business_name}</h2>
                    </div>
                    {company.marketing_description && (
                      <p className="text-sm leading-6 text-slate-700">{company.marketing_description}</p>
                    )}
                    {rateEntries.length > 0 && (
                      <div className="mt-4 space-y-1.5 border-t border-slate-100 pt-4">
                        {rateEntries.map(([type, price]) => (
                          <div key={type} className="flex items-center justify-between text-sm">
                            <span className="text-slate-600">{type}</span>
                            <span className="font-bold text-slate-950">${Number(price).toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <Link
                      href={`/customer-book?companyId=${company.id}`}
                      className="mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-500 to-green-500 text-sm font-bold text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                    >
                      Book a slot
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </article>
                )
              })}
            </div>
          )}
        </section>
      </main>
    </>
  )
}
