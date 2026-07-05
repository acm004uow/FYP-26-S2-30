import { NextResponse } from 'next/server'
import { buildScheduleProposal, fetchSupabaseRows, getSupabaseConfig, patchSupabaseRow, summarizeProposal } from '../../../lib/scheduleProposal'

async function getManagerProfile(token) {
  if (!token) return null
  const { url, key } = getSupabaseConfig()
  const userResponse = await fetch(`${url}/auth/v1/user`, {
    cache: 'no-store',
    headers: { apikey: key, Authorization: `Bearer ${token}` },
  })
  const userData = await userResponse.json().catch(() => null)
  const userId = userResponse.ok ? userData?.id || null : null
  if (!userId) return null

  const profiles = await fetchSupabaseRows('profiles', [
    ['select', 'id,role,status,host_admin_id'],
    ['id', `eq.${userId}`],
    ['limit', '1'],
  ])
  return profiles[0] || null
}

function defaultDateRange() {
  const start = new Date()
  const end = new Date(start)
  end.setDate(end.getDate() + 7)
  const toIso = (date) => date.toISOString().slice(0, 10)
  return { start_date: toIso(start), end_date: toIso(end) }
}

function isValidIsoDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

const scheduleTool = {
  type: 'function',
  function: {
    name: 'propose_weekly_schedule',
    description: 'Generate a proposed staff schedule for unassigned bookings within a date range. Call this whenever the manager asks to create, build, or generate a schedule, roster, or allocation for a week or date range.',
    parameters: {
      type: 'object',
      properties: {
        start_date: { type: 'string', description: 'ISO date (YYYY-MM-DD) for the start of the scheduling window.' },
        end_date: { type: 'string', description: 'ISO date (YYYY-MM-DD) for the end of the scheduling window, inclusive.' },
      },
      required: ['start_date', 'end_date'],
    },
  },
}

function cleanHistory(messages = []) {
  return messages
    .filter((message) => ['user', 'bot'].includes(message.role) && message.content)
    .slice(-8)
    .map((message) => ({
      role: message.role === 'bot' ? 'assistant' : 'user',
      content: String(message.content).slice(0, 1000),
    }))
}

export async function POST(request) {
  try {
    const { message, history } = await request.json()
    const userMessage = String(message || '').trim()
    if (!userMessage) return NextResponse.json({ error: 'Message is required.' }, { status: 400 })

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'OPENAI_API_KEY is not configured.' }, { status: 500 })

    const token = request.headers.get('authorization')?.replace('Bearer ', '')
    const managerProfile = await getManagerProfile(token)
    if (!managerProfile) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })
    if (managerProfile.role !== 'manager' || managerProfile.status !== 'active' || !managerProfile.host_admin_id) {
      return NextResponse.json({ error: 'Only an active manager can use the scheduling agent.' }, { status: 403 })
    }

    const today = new Date().toISOString().slice(0, 10)
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini'
    const systemPrompt = [
      'You are the Manager Scheduling Agent for the Smart Task Allocation app.',
      `Today's date is ${today}.`,
      'When the manager asks to create, build, or generate a schedule, roster, or allocation for a week or a date range, call the propose_weekly_schedule function with start_date and end_date in YYYY-MM-DD format.',
      'If the manager does not specify a date range, default to today through 7 days from today.',
      'For anything else, reply briefly and naturally without calling the function. Keep replies concise, plain text only, no Markdown.',
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
        tools: [scheduleTool],
        tool_choice: 'auto',
        temperature: 0.2,
        max_tokens: 300,
      }),
    })
    clearTimeout(timeoutId)

    const data = await response.json().catch(() => null)
    if (!data) return NextResponse.json({ error: 'OpenAI returned a non-JSON response.' }, { status: 502 })
    if (!response.ok) {
      return NextResponse.json({ error: data.error?.message || 'OpenAI request failed.' }, { status: response.status })
    }

    const toolCall = data.choices?.[0]?.message?.tool_calls?.find((call) => call.function?.name === 'propose_weekly_schedule')

    if (toolCall) {
      const args = JSON.parse(toolCall.function.arguments || '{}')
      const range = isValidIsoDate(args.start_date) && isValidIsoDate(args.end_date)
        ? { start_date: args.start_date, end_date: args.end_date }
        : defaultDateRange()

      const proposal = await buildScheduleProposal(managerProfile.host_admin_id, range)
      return NextResponse.json({ reply: summarizeProposal(proposal, range), proposal, range })
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

export async function GET(request) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '')
    const managerProfile = await getManagerProfile(token)
    if (!managerProfile) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })
    if (managerProfile.role !== 'manager' || managerProfile.status !== 'active' || !managerProfile.host_admin_id) {
      return NextResponse.json({ error: 'Only an active manager can use the scheduling agent.' }, { status: 403 })
    }

    const pendingRows = await fetchSupabaseRows('schedule_proposals', [
      ['select', 'id,week_start,week_end,proposal'],
      ['host_admin_id', `eq.${managerProfile.host_admin_id}`],
      ['status', 'eq.pending'],
      ['order', 'created_at.desc'],
      ['limit', '1'],
    ])

    const pending = pendingRows[0]
    if (!pending) return NextResponse.json({ proposal: null })

    await patchSupabaseRow('schedule_proposals', pending.id, { status: 'reviewed' })

    return NextResponse.json({
      proposal: pending.proposal,
      range: { start_date: pending.week_start, end_date: pending.week_end },
      auto: true,
    })
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
