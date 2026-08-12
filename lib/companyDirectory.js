// Companies "support" a service type if it's one of the shared default categories (available to
// every company, host_admin_id null) or they've specifically added it as their own custom
// category — used to narrow the company picker down to just the companies relevant to what the
// customer actually wants, instead of making them guess from every company in the marketplace.
export async function loadCompaniesForServiceType(supabase, serviceType) {
  const [{ data: companies }, { data: categoryRows }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id,business_name')
      .eq('role', 'system_admin')
      .eq('status', 'active')
      .not('business_name', 'is', null)
      .order('business_name'),
    supabase
      .from('task_categories')
      .select('host_admin_id')
      .eq('name', serviceType)
      .eq('status', 'active'),
  ])

  const allCompanies = companies || []
  const categoryHosts = categoryRows || []
  const isSharedDefault = categoryHosts.some(row => row.host_admin_id === null)
  if (isSharedDefault) return allCompanies

  const supportingIds = new Set(categoryHosts.map(row => row.host_admin_id).filter(Boolean))
  const eligible = allCompanies.filter(company => supportingIds.has(company.id))
  // Fall back to showing every company rather than an empty picker if nothing matched (e.g. a
  // category that isn't cleanly tagged to any host yet) — never leaves the customer stuck.
  return eligible.length > 0 ? eligible : allCompanies
}

// Average customer rating per company FOR THIS SPECIFIC SERVICE TYPE, computed from real
// booking_feedback left on past bookings of that type — a company can be excellent at Office
// Cleaning and mediocre at Carpet Cleaning, so suitability is scored per service, not as one
// blanket company-wide average.
export async function loadCompanyRatings(supabase, companyIds, serviceType) {
  const ratings = new Map()
  if (!companyIds.length) return ratings

  let query = supabase
    .from('bookings')
    .select('host_admin_id,booking_feedback(rating)')
    .in('host_admin_id', companyIds)
  if (serviceType) query = query.eq('service_type', serviceType)
  const { data } = await query

  const sums = new Map()
  const counts = new Map()
  for (const row of data || []) {
    // booking_feedback.booking_id is unique, so PostgREST embeds it as a single object (or null)
    // rather than an array — normalize both shapes before iterating.
    const feedbackList = Array.isArray(row.booking_feedback)
      ? row.booking_feedback
      : (row.booking_feedback ? [row.booking_feedback] : [])
    for (const feedback of feedbackList) {
      if (!feedback?.rating) continue
      sums.set(row.host_admin_id, (sums.get(row.host_admin_id) || 0) + Number(feedback.rating))
      counts.set(row.host_admin_id, (counts.get(row.host_admin_id) || 0) + 1)
    }
  }
  for (const [id, count] of counts) {
    ratings.set(id, { average: sums.get(id) / count, count })
  }
  return ratings
}

// Same weighted-score-with-explanation shape as calculateStaffScore in recommendationEngine.js:
// quality (average rating) is the primary factor, but a small capped bonus for review volume
// keeps a single 5-star review from outranking a company with a long, consistently strong track
// record. Capped at 10 reviews so an established company's volume can't fully drown out quality.
const EXPERIENCE_CAP = 10

function scoreCompany(ratingInfo) {
  if (!ratingInfo || ratingInfo.count === 0) {
    return { score: 0, reason: 'No reviews yet for this service type' }
  }
  const experienceBonus = Math.min(ratingInfo.count, EXPERIENCE_CAP)
  const score = ratingInfo.average * 20 + experienceBonus * 2
  const reason = `${ratingInfo.average.toFixed(1)}★ average from ${ratingInfo.count} review${ratingInfo.count === 1 ? '' : 's'} for this service`
  return { score, reason }
}

// Ranks companies for how suitable they are for the chosen service type — highest score first,
// falling back to alphabetical among companies with no reviews yet so the order stays stable.
// The first entry (if it has a nonzero score) is the AI-recommended pick.
export function rankCompaniesForServiceType(companies, ratings) {
  return companies
    .map(company => {
      const ratingInfo = ratings.get(company.id) || null
      const { score, reason } = scoreCompany(ratingInfo)
      return { ...company, score, rating: ratingInfo, reason }
    })
    .sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score
      return (a.business_name || '').localeCompare(b.business_name || '')
    })
}

// Total companies listed on the platform at all, regardless of which service they offer — used
// for the "N of M companies offer this service" line alongside an eligible-list length.
export async function loadPlatformCompanyCount(supabase) {
  const { count } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'system_admin')
    .eq('status', 'active')
    .not('business_name', 'is', null)
  return count || 0
}

// A company needs a real track record before "responds in ~Xh" means anything — below this many
// resolved bookings the figure is too noisy to show (and could be a single lucky/unlucky data point).
const MIN_RESOLVED_BOOKINGS_FOR_RESPONSE_TIME = 3

// One batched query per stat, keyed by company id, so Step 2 can render cleaner count / years
// active / response time without a round trip per card.
export async function loadCompanyOperationalStats(supabase, companyIds) {
  const stats = new Map()
  if (!companyIds.length) return stats

  const [{ data: profileRows }, { data: staffRows }, { data: bookingRows }] = await Promise.all([
    supabase.from('profiles').select('id,created_at').in('id', companyIds),
    supabase
      .from('staff_profiles')
      .select('host_admin_id')
      .in('host_admin_id', companyIds)
      .eq('is_suspended', false)
      .eq('status', 'active'),
    supabase
      .from('bookings')
      .select('host_admin_id,created_at,updated_at')
      .in('host_admin_id', companyIds)
      .neq('status', 'pending'),
  ])

  const staffCounts = new Map()
  for (const row of staffRows || []) {
    staffCounts.set(row.host_admin_id, (staffCounts.get(row.host_admin_id) || 0) + 1)
  }

  const responseTotals = new Map()
  const responseCounts = new Map()
  for (const row of bookingRows || []) {
    if (!row.created_at || !row.updated_at) continue
    const hours = (new Date(row.updated_at).getTime() - new Date(row.created_at).getTime()) / 3600000
    if (!Number.isFinite(hours) || hours < 0) continue
    responseTotals.set(row.host_admin_id, (responseTotals.get(row.host_admin_id) || 0) + hours)
    responseCounts.set(row.host_admin_id, (responseCounts.get(row.host_admin_id) || 0) + 1)
  }

  const now = Date.now()
  for (const profile of profileRows || []) {
    const count = responseCounts.get(profile.id) || 0
    const yearsActive = profile.created_at
      ? Math.floor((now - new Date(profile.created_at).getTime()) / (365 * 24 * 3600000))
      : 0
    stats.set(profile.id, {
      cleanerCount: staffCounts.get(profile.id) || 0,
      yearsActive,
      avgResponseHours: count >= MIN_RESOLVED_BOOKINGS_FOR_RESPONSE_TIME ? responseTotals.get(profile.id) / count : null,
    })
  }
  return stats
}

// profiles has no lat/lng of its own, so a company's approximate location is the centroid of its
// own staff's home coordinates (staff_profiles.latitude/longitude) — only staff rows that actually
// have coordinates count, and a company with none simply has no estimate (never fabricated).
export async function estimateCompanyCoordinates(supabase, companyIds) {
  const coordinates = new Map()
  if (!companyIds.length) return coordinates

  const { data } = await supabase
    .from('staff_profiles')
    .select('host_admin_id,latitude,longitude')
    .in('host_admin_id', companyIds)
    .not('latitude', 'is', null)
    .not('longitude', 'is', null)

  const sums = new Map()
  for (const row of data || []) {
    const entry = sums.get(row.host_admin_id) || { latSum: 0, lonSum: 0, count: 0 }
    entry.latSum += row.latitude
    entry.lonSum += row.longitude
    entry.count += 1
    sums.set(row.host_admin_id, entry)
  }
  for (const [id, entry] of sums) {
    coordinates.set(id, { latitude: entry.latSum / entry.count, longitude: entry.lonSum / entry.count })
  }
  return coordinates
}
