import { useEffect, useMemo, useState } from 'react'
import { Loader2, MapPin, ShieldCheck, Sparkles, Star, Users, X } from 'lucide-react'
import { supabase } from '../../../../lib/supabaseClient'
import {
  loadCompaniesForServiceType, loadCompanyRatings, rankCompaniesForServiceType,
  loadPlatformCompanyCount, loadCompanyOperationalStats, estimateCompanyCoordinates,
} from '../../../../lib/companyDirectory'
import { getDistanceMeters } from '../../../../lib/geolocation'
import usePostalLookup from '../../../components/usePostalLookup'

const SORT_OPTIONS = [
  { value: 'recommended', label: 'Recommended' },
  { value: 'rating', label: 'Highest rated' },
  { value: 'price_asc', label: 'Price: low to high' },
]

// Step 2 of the booking wizard: ranks real companies for the chosen service type by the same
// weighted score used elsewhere (lib/companyDirectory.js), enriched with operational stats that
// have a genuine data source (cleaner count, years active, response time, distance) rather than
// invented ones.
export default function Step2Company({ serviceType, requestedStaff, postalCode, setPostalCode, onSelect, onBack }) {
  const [companies, setCompanies] = useState([])
  const [loading, setLoading] = useState(true)
  const [platformCount, setPlatformCount] = useState(0)
  const [sortBy, setSortBy] = useState('recommended')
  const [bannerDismissed, setBannerDismissed] = useState(false)
  const { status: postalStatus, result: postalResult } = usePostalLookup(postalCode)
  const customerCoordinates = postalResult?.coordinates ?? null

  useEffect(() => {
    if (!serviceType) return
    let cancelled = false
    setLoading(true)
    ;(async () => {
      const eligible = await loadCompaniesForServiceType(supabase, serviceType)
      const ids = eligible.map(c => c.id)
      const [ratings, count, stats, coordsByCompany, profileExtrasResult] = await Promise.all([
        loadCompanyRatings(supabase, ids, serviceType),
        loadPlatformCompanyCount(supabase),
        loadCompanyOperationalStats(supabase, ids),
        estimateCompanyCoordinates(supabase, ids),
        ids.length ? supabase.from('profiles').select('id,marketing_description,service_rates').in('id', ids) : Promise.resolve({ data: [] }),
      ])
      if (cancelled) return
      const { data: profileExtras } = profileExtrasResult

      const extrasById = new Map((profileExtras || []).map(row => [row.id, row]))
      const ranked = rankCompaniesForServiceType(eligible, ratings).map(company => {
        const extras = extrasById.get(company.id)
        const companyCoords = coordsByCompany.get(company.id)
        const distanceKm = customerCoordinates && companyCoords
          ? getDistanceMeters(customerCoordinates.latitude, customerCoordinates.longitude, companyCoords.latitude, companyCoords.longitude) / 1000
          : null
        const rate = Number(extras?.service_rates?.[serviceType])
        return {
          ...company,
          marketingDescription: extras?.marketing_description || '',
          price: Number.isFinite(rate) && rate > 0 ? rate : null,
          ...(stats.get(company.id) || { cleanerCount: 0, yearsActive: 0, avgResponseHours: null }),
          distanceKm,
          isRequestedStaffCompany: requestedStaff?.host_admin_id === company.id,
        }
      })

      setCompanies(ranked)
      setPlatformCount(count)
      setLoading(false)
    })()
    return () => { cancelled = true }
    // customerCoordinates intentionally excluded: distance is recomputed on the next full load
    // (serviceType change), not on every keystroke of the postal code.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceType, requestedStaff])

  const bestMatchId = useMemo(() => {
    const top = companies.find(c => c.score > 0)
    return top?.id ?? null
  }, [companies])

  const requestedStaffCompany = companies.find(c => c.isRequestedStaffCompany)

  const displayList = useMemo(() => {
    const list = [...companies]
    if (sortBy === 'recommended') {
      list.sort((a, b) => {
        if (a.isRequestedStaffCompany !== b.isRequestedStaffCompany) return a.isRequestedStaffCompany ? -1 : 1
        if (a.score !== b.score) return b.score - a.score
        return (a.business_name || '').localeCompare(b.business_name || '')
      })
    } else if (sortBy === 'rating') {
      list.sort((a, b) => (b.rating?.average || 0) - (a.rating?.average || 0))
    } else if (sortBy === 'price_asc') {
      list.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity))
    }
    return list
  }, [companies, sortBy])

  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-4">
        <div>
          <h3 className="font-semibold text-gray-800">Companies offering {serviceType}</h3>
          {!loading && (
            <p className="mt-1 text-sm text-gray-500">
              {companies.length} of {platformCount} companies on the platform offer this service. Ranked by a weighted rating, so a high score from only a few reviews does not outrank a strong record from many.
            </p>
          )}
        </div>
        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value)}
          className="shrink-0 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-accent-500"
        >
          {SORT_OPTIONS.map(option => <option key={option.value} value={option.value}>Sort: {option.label}</option>)}
        </select>
      </div>

      <div className="mb-5 max-w-xs">
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Your postal code</label>
        <input
          value={postalCode}
          onChange={e => setPostalCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          inputMode="numeric"
          maxLength={6}
          placeholder="e.g. 129588"
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-accent-500"
        />
        <p className="mt-1 text-xs text-gray-400">
          {postalStatus === 'loading' ? 'Looking up address...' : 'Used to sort companies by distance. Your full address is confirmed in the next step.'}
        </p>
      </div>

      {requestedStaffCompany && !bannerDismissed && (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-lg bg-accent-100 px-4 py-3 text-sm text-accent-800">
          <span>
            You asked for <strong>{requestedStaff.staff_name}</strong>. Their company is shown first, and the request will be passed to their manager - subject to availability.
          </span>
          <button type="button" onClick={() => setBannerDismissed(true)} className="shrink-0 text-accent-600 hover:text-accent-800">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 py-12 justify-center text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading companies...
        </div>
      ) : displayList.length === 0 ? (
        <p className="py-12 text-center text-sm text-gray-400">No companies currently offer this service.</p>
      ) : (
        <div className="space-y-3">
          {displayList.map(company => (
            <CompanyCard
              key={company.id}
              company={company}
              isBestMatch={company.id === bestMatchId}
              requestedStaffName={company.isRequestedStaffCompany ? requestedStaff?.staff_name : null}
              onSelect={() => onSelect(company)}
            />
          ))}
        </div>
      )}

      <div className="mt-6">
        <button type="button" onClick={onBack} className="px-5 py-2.5 bg-white border border-gray-200 text-gray-600 rounded-xl font-medium text-sm hover:bg-gray-50 transition">
          Back
        </button>
      </div>
    </div>
  )
}

function CompanyCard({ company, isBestMatch, requestedStaffName, onSelect }) {
  const statLine = [
    `${company.cleanerCount} cleaner${company.cleanerCount === 1 ? '' : 's'}`,
    company.yearsActive > 0 ? `${company.yearsActive} year${company.yearsActive === 1 ? '' : 's'} active` : 'New this year',
    company.avgResponseHours != null ? `responds in ~${Math.max(1, Math.round(company.avgResponseHours))}h` : null,
    company.distanceKm != null ? `${company.distanceKm.toFixed(1)} km from you` : null,
  ].filter(Boolean).join(' · ')

  return (
    <div role="group" aria-label={company.business_name} className={`rounded-xl border p-5 transition ${isBestMatch ? 'border-accent-300 ring-1 ring-accent-200' : 'border-gray-200'}`}>
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {isBestMatch && (
              <span className="inline-flex items-center gap-1 rounded-full bg-accent-100 px-2 py-0.5 text-xs font-semibold text-accent-700">
                <Sparkles className="w-3 h-3" /> Best match
              </span>
            )}
            <h4 className="font-semibold text-gray-900">{company.business_name}</h4>
            {/* Every listed company is an active, platform-vetted system_admin account — there is
                no separate self-serve marketplace signup to distinguish "verified" from "not". */}
            <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-700">
              <ShieldCheck className="w-3 h-3" /> Verified
            </span>
          </div>
          {company.marketingDescription && <p className="mt-1 text-sm text-gray-500">{company.marketingDescription}</p>}
          <p className="mt-2 text-xs text-gray-400">{statLine}</p>
          {requestedStaffName && (
            <p className="mt-1 text-xs font-medium text-accent-600 flex items-center gap-1">
              <Users className="w-3 h-3" /> {requestedStaffName} works here
            </p>
          )}
        </div>

        <div className="shrink-0 text-right">
          <p className="text-lg font-bold text-gray-900 flex items-center justify-end gap-1">
            <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
            {company.rating ? company.rating.average.toFixed(1) : 'New'} <span className="text-sm font-normal text-gray-400">/ 5</span>
          </p>
          <p className="text-xs text-gray-400">{company.rating ? `${company.rating.count} reviews` : 'No reviews yet'}</p>
          <p className="text-xs text-gray-400">weighted {company.score.toFixed(2)}</p>
          <p className="mt-2 text-base font-bold text-gray-900">{company.price != null ? `$${company.price.toFixed(2)}/hr` : 'Quote on request'}</p>
          <button
            type="button"
            onClick={onSelect}
            className="mt-2 inline-flex items-center gap-1 rounded-lg bg-[#003152] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 transition"
          >
            <MapPin className="w-3.5 h-3.5" /> Select
          </button>
        </div>
      </div>
    </div>
  )
}
