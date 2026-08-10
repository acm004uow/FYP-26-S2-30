import { fetchSupabaseRows } from './supabaseRest'

const SELECT_COLUMNS = 'id,staff_profile_id,request_type,day_of_week,start_date,end_date,reason,document_url,document_name,status'

// Server-side, service-role lookup — used by lib/scheduleProposal.js#buildScheduleProposal so the
// recommendation engine can hard-exclude staff who are off on a given booking's scheduled_date.
// Only fetches approved requests; pending/rejected never affect scheduling.
export async function fetchApprovedTimeOffServer(hostAdminId) {
  return fetchSupabaseRows('staff_time_off_requests', [
    ['select', SELECT_COLUMNS],
    ['host_admin_id', `eq.${hostAdminId}`],
    ['status', 'eq.approved'],
  ])
}

// Client-side — takes the caller's own (anon-key) Supabase client, same reasoning as
// fetchClosuresClient in lib/businessClosures.js. Used by BookingsReviewPanel.js so manual-assign,
// drag-drop, and rerun-match all see the same exclusion data as the automated scheduling pass.
export async function fetchApprovedTimeOffClient(supabase, hostAdminId) {
  const { data, error } = await supabase
    .from('staff_time_off_requests')
    .select(SELECT_COLUMNS)
    .eq('host_admin_id', hostAdminId)
    .eq('status', 'approved')

  if (error) throw new Error(error.message)
  return data || []
}

// Resolves the data needed to submit a time-off request for the current user, regardless of role.
// staff_member requesters own a staff_profiles row (keyed by user_id) and their request should carry
// that row's id; manager/department_staff requesters have no staff_profiles row, so their request's
// staff_profile_id is left null and the profiles row is used for host_admin_id/display name instead.
export async function fetchTimeOffRequesterProfile(supabase, userId, source) {
  if (source === 'staff_profiles') {
    const { data } = await supabase
      .from('staff_profiles')
      .select('id,host_admin_id,staff_name')
      .eq('user_id', userId)
      .single()
    if (!data) return null
    return { staffProfileId: data.id, hostAdminId: data.host_admin_id, name: data.staff_name }
  }

  const { data } = await supabase
    .from('profiles')
    .select('id,host_admin_id,full_name')
    .eq('id', userId)
    .single()
  if (!data) return null
  return { staffProfileId: null, hostAdminId: data.host_admin_id, name: data.full_name }
}

// The requester's own requests, any status, for their "My Requests" list. Keyed by requested_by
// (a profiles.id) rather than staff_profile_id so this works the same for both staff_member and
// manager requesters — managers have no staff_profiles row.
export async function fetchOwnTimeOffRequests(supabase, requestedByUserId) {
  const { data, error } = await supabase
    .from('staff_time_off_requests')
    .select('id,request_type,day_of_week,start_date,end_date,reason,document_url,document_name,status,rejection_reason,created_at')
    .eq('requested_by', requestedByUserId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return data || []
}

// The isDateClosed-equivalent for a single request: does this approved request cover dateIso?
// Weekday match for weekly_day_off (0=Sun..6=Sat, matching getUTCDay(), same convention as
// lib/recurringBookings.js), inclusive date-range match for leave and mc (medical certificate —
// same date-range shape as leave, just its own request_type so it can carry a document).
export function requestCoversDate(request, dateIso) {
  if (request.status !== 'approved' || dateIso < request.start_date) return false
  if (request.request_type === 'leave' || request.request_type === 'mc') return dateIso <= request.end_date
  if (request.end_date && dateIso > request.end_date) return false
  return new Date(`${dateIso}T00:00:00Z`).getUTCDay() === request.day_of_week
}

// Is this specific staff member off on dateIso, given a pre-fetched list of approved requests
// (any staff)? Returns the matching request or null.
export function isStaffOffOnDate(staffProfileId, dateIso, approvedRequests) {
  return (approvedRequests || []).find(
    (request) => request.staff_profile_id === staffProfileId && requestCoversDate(request, dateIso)
  ) || null
}

// Convenience for the recommendation engine: which staff (by staff_profile_id) are off on this one
// date, out of a pre-fetched approved-requests list covering many staff and many dates.
export function getExcludedStaffIdsForDate(dateIso, approvedRequests) {
  return new Set(
    (approvedRequests || [])
      .filter((request) => requestCoversDate(request, dateIso))
      .map((request) => request.staff_profile_id)
  )
}
