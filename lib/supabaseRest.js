// Lightweight REST helpers against Supabase's PostgREST endpoint using the service-role key
// (bypasses RLS). Split out from lib/scheduleProposal.js so lib/recurringBookings.js can use
// them too without the two modules importing each other.
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
