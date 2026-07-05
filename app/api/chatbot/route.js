import { NextResponse } from 'next/server'

const roleNames = {
  manager: 'Manager',
  staffMember: 'Staff Member',
  admin: 'Owner',
}

const roleContext = {
  manager: 'Managers review customer bookings, assign staff, view staff profiles, manage user accounts, monitor availability, and generate operational reports.',
  staffMember: 'Staff members view assigned tasks, update availability, start work, complete tasks, upload proof, and check feedback.',
  admin: 'Owners manage accounts, reset passwords, monitor security logs, review audit logs, and tune global allocation parameters.',
}

const normalizeRole = (role) => ({
  system_admin: 'admin',
  staff_member: 'staffMember',
}[role] || role || 'manager')

const cleanHistory = (messages = []) => messages
  .filter(message => ['user', 'bot'].includes(message.role) && message.content)
  .slice(-8)
  .map(message => ({
    role: message.role === 'bot' ? 'assistant' : 'user',
    content: String(message.content).slice(0, 1000),
  }))

const compactTask = (task) => ({
  service_type: task.service_type,
  status: task.status,
  location: task.location,
  assigned_staff: task.staff_profiles?.staff_name || 'Unassigned',
  created_at: task.created_at,
})

const compactStaff = (staff) => ({
  name: staff.staff_name,
  email: staff.email,
  skills: staff.skills || [],
  region: staff.assigned_region,
  availability: staff.availability,
  workload: staff.current_workload || 0,
  status: staff.is_suspended || staff.status !== 'active' ? 'suspended' : 'active',
  rating: staff.performance_rating || 0,
})

const getSupabaseConfig = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase admin environment variables')
  return { url: url.replace(/\/$/, ''), key }
}

async function fetchSupabaseRows(table, params) {
  const { url, key } = getSupabaseConfig()
  const requestUrl = new URL(`${url}/rest/v1/${table}`)
  Object.entries(params).forEach(([name, value]) => requestUrl.searchParams.set(name, value))

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

async function getUserIdFromToken(token) {
  if (!token) return null
  const { url, key } = getSupabaseConfig()
  const response = await fetch(`${url}/auth/v1/user`, {
    cache: 'no-store',
    headers: {
      apikey: key,
      Authorization: `Bearer ${token}`,
    },
  })
  const data = await response.json().catch(() => null)
  return response.ok ? data?.id || null : null
}

async function buildLiveContext(role, userId) {
  if (role !== 'manager') {
    return JSON.stringify({
      scope: 'general_app_context',
      generated_at: new Date().toISOString(),
      note: 'No role-specific database context was loaded for this role.',
    })
  }

  const [tasks, staff, reports] = await Promise.all([
    fetchSupabaseRows('bookings', {
      select: 'service_type,status,location,created_at,staff_profiles(staff_name)',
      order: 'created_at.desc',
      limit: '50',
    }),
    fetchSupabaseRows('staff_profiles', {
      select: 'staff_name,email,skills,assigned_region,availability,current_workload,status,is_suspended,performance_rating',
      order: 'staff_name.asc',
      limit: '50',
    }),
    fetchSupabaseRows('performance_reviews', {
      select: 'rating,created_at',
      order: 'created_at.desc',
      limit: '30',
    }),
  ])

  const taskRows = tasks || []
  const staffRows = staff || []
  const completed = taskRows.filter(task => task.status === 'completed').length
  const pending = taskRows.filter(task => task.status === 'pending').length
  const assigned = taskRows.filter(task => task.staff_profiles?.staff_name).length
  const averageRating = reports?.length
    ? (reports.reduce((sum, review) => sum + Number(review.rating || 0), 0) / reports.length).toFixed(1)
    : '0.0'

  return JSON.stringify({
    scope: 'manager_dashboard_live_context',
    generated_at: new Date().toISOString(),
    summary: {
      total_recent_tasks: taskRows.length,
      completed_recent_tasks: completed,
      pending_recent_tasks: pending,
      assigned_recent_tasks: assigned,
      total_staff: staffRows.length,
      available_staff: staffRows.filter(row => row.availability === 'available' && !row.is_suspended).length,
      average_recent_rating: averageRating,
    },
    recent_tasks: taskRows.map(compactTask),
    staff_profiles: staffRows.map(compactStaff),
  })
}

export async function POST(request) {
  try {
    const { message, role, history } = await request.json()
    const userMessage = String(message || '').trim()
    if (!userMessage) return NextResponse.json({ error: 'Message is required.' }, { status: 400 })

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'OPENAI_API_KEY is not configured.' }, { status: 500 })

    const normalizedRole = normalizeRole(role)
    const token = request.headers.get('authorization')?.replace('Bearer ', '')
    const userId = await getUserIdFromToken(token)
    let liveContext
    try {
      liveContext = await buildLiveContext(normalizedRole, userId)
    } catch (contextError) {
      liveContext = JSON.stringify({
        scope: 'context_unavailable',
        generated_at: new Date().toISOString(),
        note: contextError.message,
      })
    }

    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini'
    const systemPrompt = [
      'You are the Smart Task Allocation assistant.',
      `Current user role: ${roleNames[normalizedRole] || normalizedRole}.`,
      roleContext[normalizedRole] || roleContext.manager,
      'Answer using the live application context below when the question asks about tasks, assignments, staff, availability, or reports.',
      'The chat is read-only, but you can still guide users step by step on how to use pages, buttons, filters, and forms in the application.',
      'For report questions, explain how to use the Reports section. Tell the user to choose the report type, select filters such as date range or department if available, click Generate Report, then review or export the result if the page provides those options.',
      'Do not refuse to give navigation guidance. Only refuse when the user asks chat to directly perform the action for them.',
      normalizedRole === 'manager' ? 'For managers who ask about allocation status, tell them to open the Bookings page and review each booking status, AI-recommended staff, and recent updates.' : '',
      normalizedRole === 'manager' ? 'For managers who ask about staff availability, tell them to open the Staff Availability page to see available, busy, or on leave staff and current workload.' : '',
      normalizedRole === 'manager' ? 'For managers who ask for a quick report, tell them to open the Reports section, choose the report type and filters, then generate the report.' : '',
      'For normal greetings or general app questions, answer naturally.',
      'If the user says hello, hi, thanks, or asks a general question, do not search records. Reply naturally.',
      'Only say a record cannot be found when the user clearly asks for a specific task, staff member, report, or assignment that is not in the live context.',
      'Do not invent task names, staff names, counts, assignments, ratings, or statuses.',
      'Keep replies concise and practical.',
      'Use plain text only. Do not use Markdown formatting, backticks, bullet syntax, headings, or code blocks.',
      `Live application context JSON: ${liveContext}`,
    ].join(' ')

    const messages = [{ role: 'system', content: systemPrompt }, ...cleanHistory(history), { role: 'user', content: userMessage }]

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000)
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.2,
        max_tokens: 350,
      }),
    })
    clearTimeout(timeoutId)

    const data = await response.json().catch(() => null)
    if (!data) return NextResponse.json({ error: 'OpenAI returned a non-JSON response.' }, { status: 502 })
    if (!response.ok) {
      return NextResponse.json({ error: data.error?.message || 'OpenAI request failed.' }, { status: response.status })
    }

    const reply = data.choices?.[0]?.message?.content?.trim()

    if (!reply) return NextResponse.json({ error: 'OpenAI returned an empty reply.' }, { status: 502 })
    return NextResponse.json({ reply })
  } catch (error) {
    if (error.name === 'AbortError') {
      return NextResponse.json({ error: 'OpenAI request timed out. Check your network connection, API key, and model name.' }, { status: 504 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
