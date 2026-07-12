import { fetchSupabaseRows } from './supabaseRest'

// Server-side, service-role lookup — used by lib/recurringBookings.js#generateWeeklyVisits.
export async function fetchClosuresServer(hostAdminId, range) {
  return fetchSupabaseRows('business_closures', [
    ['select', 'start_date,end_date,reason'],
    ['host_admin_id', `eq.${hostAdminId}`],
    ['start_date', `lte.${range.end_date}`],
    ['end_date', `gte.${range.start_date}`],
  ])
}

// Client-side — takes the caller's own (anon-key) Supabase client, same reasoning as
// createRecurringBookingRequest in lib/recurringBookings.js: this must not depend on the
// service-role REST helpers, which only work server-side.
export async function fetchClosuresClient(supabase, hostAdminId) {
  const { data, error } = await supabase
    .from('business_closures')
    .select('start_date,end_date,reason')
    .eq('host_admin_id', hostAdminId)
    .order('start_date')

  if (error) throw new Error(error.message)
  return data || []
}

export function isDateClosed(dateIso, closures) {
  return (closures || []).find((c) => dateIso >= c.start_date && dateIso <= c.end_date) || null
}
