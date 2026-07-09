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
