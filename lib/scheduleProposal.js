import { generateRecommendations } from './recommendationEngine'

export function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase admin environment variables')
  return { url: url.replace(/\/$/, ''), key }
}

export async function fetchSupabaseRows(table, paramPairs) {
  const { url, key } = getSupabaseConfig()
  const requestUrl = new URL(`${url}/rest/v1/${table}`)
  paramPairs.forEach(([name, value]) => requestUrl.searchParams.append(name, value))

  const response = await fetch(requestUrl, {
    cache: 'no-store',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(data?.message || `Supabase ${table} query failed.`)
  return data || []
}

export async function insertSupabaseRow(table, row) {
  const { url, key } = getSupabaseConfig()
  const response = await fetch(`${url}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(row),
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(data?.message || `Failed to insert into ${table}.`)
  return Array.isArray(data) ? data[0] : data
}

export async function insertSupabaseRows(table, rows) {
  if (!rows.length) return
  const { url, key } = getSupabaseConfig()
  const response = await fetch(`${url}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(rows),
  })
  if (!response.ok) {
    const data = await response.json().catch(() => null)
    throw new Error(data?.message || `Failed to insert into ${table}.`)
  }
}

export async function patchSupabaseRow(table, id, patch) {
  const { url, key } = getSupabaseConfig()
  const requestUrl = new URL(`${url}/rest/v1/${table}`)
  requestUrl.searchParams.set('id', `eq.${id}`)
  const response = await fetch(requestUrl, {
    method: 'PATCH',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(patch),
  })
  if (!response.ok) {
    const data = await response.json().catch(() => null)
    throw new Error(data?.message || `Failed to update ${table}.`)
  }
}

export async function buildScheduleProposal(hostAdminId, { start_date, end_date }) {
  const [bookings, staffRows, systemParamsRows] = await Promise.all([
    fetchSupabaseRows('bookings', [
      ['select', 'id,service_type,location,scheduled_date,scheduled_time,estimated_hours,status'],
      ['host_admin_id', `eq.${hostAdminId}`],
      ['status', 'in.(pending,approved)'],
      ['assigned_staff_id', 'is.null'],
      ['scheduled_date', `gte.${start_date}`],
      ['scheduled_date', `lte.${end_date}`],
      ['order', 'scheduled_date.asc'],
      ['limit', '50'],
    ]),
    fetchSupabaseRows('staff_profiles', [
      ['select', 'id,staff_name,skills,assigned_region,availability,current_workload,weekly_working_hours,max_weekly_hours,performance_rating,status,is_suspended'],
      ['host_admin_id', `eq.${hostAdminId}`],
      ['is_suspended', 'eq.false'],
      ['status', 'eq.active'],
      ['limit', '100'],
    ]),
    fetchSupabaseRows('system_parameters', [
      ['select', '*'],
      ['id', 'eq.1'],
      ['limit', '1'],
    ]),
  ])

  const params = systemParamsRows[0] || {}

  return bookings.map((booking) => {
    const recommendations = generateRecommendations(
      staffRows,
      { required_skill: booking.service_type, location: booking.location, estimated_hours: booking.estimated_hours },
      params
    )
    const topMatch = recommendations[0]
    return {
      booking_id: booking.id,
      service_type: booking.service_type,
      location: booking.location,
      scheduled_date: booking.scheduled_date,
      scheduled_time: booking.scheduled_time,
      estimated_hours: booking.estimated_hours,
      status: booking.status,
      recommended_staff_id: topMatch?.staff_id || null,
      recommended_staff_name: topMatch?.staff_name || null,
      score: topMatch?.score ?? 0,
      reason: topMatch?.reason || 'No suitable staff found',
    }
  })
}

export function summarizeProposal(proposal, range) {
  if (proposal.length === 0) {
    return `No unassigned bookings were found between ${range.start_date} and ${range.end_date}.`
  }
  const matched = proposal.filter((row) => row.recommended_staff_id).length
  return `Found ${proposal.length} unassigned booking${proposal.length === 1 ? '' : 's'} between ${range.start_date} and ${range.end_date}. Matched ${matched} with a recommended staff member — review and approve below.`
}
