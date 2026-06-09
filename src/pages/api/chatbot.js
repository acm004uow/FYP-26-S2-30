import { createSupabaseAdmin } from '../../../lib/supabaseAdmin'

const roleNames = {
  manager: 'Manager',
  department: 'Department Staff',
  staffMember: 'Staff Member',
  admin: 'System Admin',
}

const roleContext = {
  manager: 'Managers review task requests, assign staff, view staff profiles, manage user accounts, monitor availability, and generate operational reports.',
  department: 'Department staff create task requests, mark urgent work, track request status, cancel pending requests, and view completion history.',
  staffMember: 'Staff members view assigned tasks, update availability, start work, complete tasks, upload proof, and check feedback.',
  admin: 'System admins manage accounts, reset passwords, monitor security logs, review audit logs, and tune global allocation parameters.',
}

const normalizeRole = (role) => ({
  system_admin: 'admin',
  staff_member: 'staffMember',
  department_staff: 'department',
}[role] || role || 'manager')

const cleanHistory = (messages = []) => messages
  .filter(message => ['user', 'bot'].includes(message.role) && message.content)
  .slice(-8)
  .map(message => ({
    role: message.role === 'bot' ? 'model' : 'user',
    parts: [{ text: String(message.content).slice(0, 1000) }],
  }))

const compactTask = (task) => ({
  title: task.title,
  status: task.status,
  priority: task.priority,
  required_skill: task.required_skill,
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

async function buildLiveContext(role, userId) {
  const supabase = createSupabaseAdmin()

  if (role === 'department') {
    if (!userId) {
      return JSON.stringify({
        scope: 'department_task_context',
        generated_at: new Date().toISOString(),
        note: 'No authenticated department staff user was available.',
      })
    }

    const { data: tasks } = await supabase
      .from('task_requests')
      .select('title,status,priority,required_skill,location,created_at,updated_at,scheduled_end,staff_profiles(staff_name)')
      .eq('created_by', userId)
      .order('created_at', { ascending: false })
      .limit(50)

    const taskRows = tasks || []
    return JSON.stringify({
      scope: 'department_submitted_tasks_live_context',
      generated_at: new Date().toISOString(),
      summary: {
        total_submitted_tasks: taskRows.length,
        pending_tasks: taskRows.filter(task => task.status === 'pending').length,
        approved_tasks: taskRows.filter(task => task.status === 'approved').length,
        rejected_tasks: taskRows.filter(task => task.status === 'rejected').length,
        completed_tasks: taskRows.filter(task => task.status === 'completed').length,
        cancelled_tasks: taskRows.filter(task => task.status === 'cancelled').length,
        urgent_tasks: taskRows.filter(task => String(task.priority).toLowerCase() === 'high').length,
      },
      submitted_tasks: taskRows.map(compactTask),
    })
  }

  if (role !== 'manager') {
    return JSON.stringify({
      scope: 'general_app_context',
      generated_at: new Date().toISOString(),
      note: 'No role-specific database context was loaded for this role.',
    })
  }

  const [{ data: tasks }, { data: staff }, { data: reports }] = await Promise.all([
    supabase
      .from('task_requests')
      .select('title,status,priority,required_skill,location,created_at,staff_profiles(staff_name)')
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('staff_profiles')
      .select('staff_name,email,skills,assigned_region,availability,current_workload,status,is_suspended,performance_rating')
      .order('staff_name')
      .limit(50),
    supabase
      .from('performance_reviews')
      .select('rating,created_at')
      .order('created_at', { ascending: false })
      .limit(30),
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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed.' })
  }

  try {
    const { message, role, history } = req.body || {}
    const userMessage = String(message || '').trim()
    if (!userMessage) return res.status(400).json({ error: 'Message is required.' })

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY is not configured.' })

    const normalizedRole = normalizeRole(role)
    const token = req.headers.authorization?.replace('Bearer ', '')
    let userId = null
    if (token) {
      const supabase = createSupabaseAdmin()
      const { data: authData } = await supabase.auth.getUser(token)
      userId = authData?.user?.id || null
    }
    const liveContext = await buildLiveContext(normalizedRole, userId)
    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash'
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
    const contents = cleanHistory(history)
    contents.push({ role: 'user', parts: [{ text: userMessage }] })

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000)
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        systemInstruction: {
          parts: [{
            text: [
              'You are the Smart Task Allocation assistant.',
              `Current user role: ${roleNames[normalizedRole] || normalizedRole}.`,
              roleContext[normalizedRole] || roleContext.manager,
              'Answer using the live application context below when the question asks about tasks, assignments, staff, availability, or reports.',
              'If the requested record is not present in the live context, say you cannot find it in the loaded records and suggest checking the relevant page.',
              'Do not invent task names, staff names, counts, assignments, ratings, or statuses.',
              'Keep replies concise and practical.',
              `Live application context JSON: ${liveContext}`,
            ].join(' '),
          }],
        },
        contents,
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 350,
        },
      }),
    })
    clearTimeout(timeoutId)

    const data = await response.json()
    if (!response.ok) return res.status(response.status).json({ error: data.error?.message || 'Gemini request failed.' })

    const reply = data.candidates?.[0]?.content?.parts
      ?.map(part => part.text || '')
      .join('')
      .trim()

    if (!reply) return res.status(502).json({ error: 'Gemini returned an empty reply.' })
    return res.status(200).json({ reply })
  } catch (error) {
    if (error.name === 'AbortError') {
      return res.status(504).json({ error: 'Gemini request timed out. Check your network connection, API key, and model name.' })
    }
    return res.status(500).json({ error: error.message })
  }
}
