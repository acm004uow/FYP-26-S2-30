import { fetchSupabaseRows } from './supabaseRest'
import { DEFAULT_CUTOFF } from './businessWeek'

// Server-side, service-role lookup — used by the daily cron (app/api/cron/weekly-schedule/route.js).
export async function fetchSchedulingSettingsServer(hostAdminId) {
  const rows = await fetchSupabaseRows('scheduling_settings', [
    ['select', 'cutoff_day_of_week,cutoff_time'],
    ['host_admin_id', `eq.${hostAdminId}`],
    ['limit', '1'],
  ])
  return rows[0] || DEFAULT_CUTOFF
}

// Client-side — takes the caller's own (anon-key) Supabase client, same reasoning as
// fetchClosuresClient in lib/businessClosures.js.
export async function fetchSchedulingSettingsClient(supabase, hostAdminId) {
  const { data, error } = await supabase
    .from('scheduling_settings')
    .select('cutoff_day_of_week,cutoff_time')
    .eq('host_admin_id', hostAdminId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data || DEFAULT_CUTOFF
}

// Used by the owner's Scheduling Cutoff settings panel.
export async function saveSchedulingSettings(supabase, hostAdminId, { cutoff_day_of_week, cutoff_time }) {
  const { error } = await supabase.from('scheduling_settings').upsert({
    host_admin_id: hostAdminId,
    cutoff_day_of_week,
    cutoff_time,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'host_admin_id' })

  if (error) throw new Error(error.message)
}
