const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.e2e') })
const { createClient } = require('@supabase/supabase-js')

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// Signs in through the normal Supabase Auth SDK flow (same as the app itself) to get an
// authenticated client for seeding/cleaning up test data server-side, between UI-driven test
// steps. Not a minted/injected session — this is what signInWithPassword always does.
async function signIn(email, password) {
  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`signIn(${email}) failed: ${error.message}`)
  return client
}

function todayIso(offsetDays = 0) {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return d.toISOString().slice(0, 10)
}

async function getAccessToken(client) {
  const { data: { session } } = await client.auth.getSession()
  return session?.access_token
}

module.exports = { signIn, todayIso, getAccessToken }
