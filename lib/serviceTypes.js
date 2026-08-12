// Static fallback, only used if the task_categories table is unreachable or empty.
export const SERVICE_TYPES = ['Home Cleaning', 'Office Cleaning', 'Deep Cleaning', 'Move-Out Cleaning', 'Carpet Cleaning']

// Loads the live, owner-managed service category list: every shared default category plus
// any the given company added itself. Falls back to SERVICE_TYPES on error or if empty.
export async function loadServiceTypes(supabase, hostAdminId) {
  let query = supabase
    .from('task_categories')
    .select('name')
    .eq('status', 'active')
    .order('name')

  query = hostAdminId
    ? query.or(`host_admin_id.eq.${hostAdminId},host_admin_id.is.null`)
    : query.is('host_admin_id', null)

  const { data, error } = await query
  if (error || !data?.length) return SERVICE_TYPES
  return data.map(row => row.name)
}

// All distinct active service types across every company, used when the customer needs to pick a
// service before they've chosen (or even seen) which company to book with.
export async function loadAllServiceTypes(supabase) {
  const { data, error } = await supabase
    .from('task_categories')
    .select('name')
    .eq('status', 'active')
    .order('name')

  if (error || !data?.length) return SERVICE_TYPES
  return [...new Set(data.map(row => row.name))]
}

// Backs the "Or choose a service directly" card grid on the booking wizard's first step: prefers
// the shared default categories (host_admin_id null) so the grid doesn't advertise one company's
// bespoke category to every customer regardless of which company they end up booking — but falls
// back to every active category, deduplicated by name, if no shared ones exist yet (e.g. a single-
// company deployment that only ever created its own categories). Never leaves the grid empty just
// because nobody has set up a *shared* category, same fallback philosophy as
// loadCompaniesForServiceType. Price is the cheapest real rate any company currently charges for
// that category (service_rates jsonb on profiles); a category no company has priced yet just omits
// the price rather than showing $0.
export async function loadServiceCategoryCards(supabase) {
  const [{ data: sharedCategories, error }, { data: allCategories }, { data: companies }] = await Promise.all([
    supabase
      .from('task_categories')
      .select('id,name,description,default_duration_hours')
      .eq('status', 'active')
      .is('host_admin_id', null)
      .order('name'),
    supabase
      .from('task_categories')
      .select('id,name,description,default_duration_hours')
      .eq('status', 'active')
      .order('name'),
    supabase
      .from('profiles')
      .select('service_rates')
      .eq('role', 'system_admin')
      .eq('status', 'active'),
  ])

  if (error) return []
  let categories = sharedCategories?.length ? sharedCategories : (allCategories || [])
  if (!sharedCategories?.length) {
    const seenNames = new Set()
    categories = categories.filter(category => (seenNames.has(category.name) ? false : (seenNames.add(category.name), true)))
  }
  if (!categories.length) return []

  const cheapestByName = new Map()
  for (const company of companies || []) {
    for (const [name, rate] of Object.entries(company.service_rates || {})) {
      const price = Number(rate)
      if (!Number.isFinite(price) || price <= 0) continue
      if (!cheapestByName.has(name) || price < cheapestByName.get(name)) cheapestByName.set(name, price)
    }
  }

  return categories.map(category => ({
    id: category.id,
    name: category.name,
    description: category.description || '',
    durationHours: Number(category.default_duration_hours) || 1,
    fromPrice: cheapestByName.get(category.name) ?? null,
  }))
}
