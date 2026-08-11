import { NextResponse } from 'next/server'
import { buildScheduleProposal, fetchSupabaseRows, getSupabaseConfig, patchSupabaseRow, summarizeProposal } from '../../../lib/scheduleProposal'
import { createManagerRecurringBooking } from '../../../lib/recurringBookings'

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

// Uses Azure OpenAI's newer unified "v1" surface (endpoint already ends in /openai/v1, from the
// Foundry portal's "Azure OpenAI endpoint" field) rather than the older
// /openai/deployments/{deployment}/chat/completions?api-version=... shape. On this surface the
// deployment name is passed as `model` in the request body, same as OpenAI's own API, and
// `api-version` is not required for stable (non-preview) endpoints like chat completions.
function getAzureOpenAiConfig() {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT?.replace(/\/+$/, '')
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT
  const apiKey = process.env.AZURE_OPENAI_API_KEY
  const missing = [
    !endpoint && 'AZURE_OPENAI_ENDPOINT',
    !deployment && 'AZURE_OPENAI_DEPLOYMENT',
    !apiKey && 'AZURE_OPENAI_API_KEY',
  ].filter(Boolean)
  if (missing.length) throw new Error(`Missing Azure OpenAI environment variable(s): ${missing.join(', ')}.`)

  const apiVersion = process.env.AZURE_OPENAI_API_VERSION
  return {
    url: `${endpoint}/chat/completions${apiVersion ? `?api-version=${apiVersion}` : ''}`,
    apiKey,
    deployment,
  }
}

const scheduleTool = {
  type: 'function',
  function: {
    name: 'propose_weekly_schedule',
    description: 'Generate a proposed staff schedule for unassigned bookings within a date range. Call this whenever the manager asks to create, build, or generate a schedule, roster, or allocation for a week or date range using EXISTING bookings/contracts already in the system.',
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

const contractSchema = {
  type: 'object',
  properties: {
    customer_name: { type: 'string', description: 'The customer or company name.' },
    customer_email: { type: 'string', description: "The customer's email, if the manager mentioned one, to link an existing customer account. Omit if unknown — a new contract customer does not need a portal login." },
    service_type: { type: 'string', description: 'The type of service, e.g. "Office Cleaning".' },
    location: { type: 'string', description: 'The service address. If the manager did not give one, use the customer name.' },
    days_of_week: {
      type: 'array',
      items: { type: 'string', enum: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] },
      description: 'Which named weekdays the service repeats on — list every day mentioned by NAME, do not compute or number them. "Every day" means all seven names. "Monday to Friday" means ["monday","tuesday","wednesday","thursday","friday"].',
    },
    start_time: { type: 'string', description: 'Visit start time converted to 24-hour HH:MM, e.g. "7 PM" -> "19:00", "8am" -> "08:00". Just reformat the stated time — do not do any duration math here.' },
    end_time: { type: 'string', description: 'Visit end time converted to 24-hour HH:MM, e.g. "9 PM" -> "21:00". If the visit crosses midnight (e.g. "10 PM - 1 AM"), this will be numerically earlier than start_time (e.g. "01:00") — that is expected, just reformat the stated end time, do not adjust it.' },
    staff_count: { type: 'integer', description: 'Number of staff/cleaners required per visit, if stated. Defaults to 1.' },
    start_date: { type: 'string', description: 'ISO date (YYYY-MM-DD) the contract begins. If the manager only gave one overall scheduling window covering every contract in this request (e.g. "next week"), use that window here.' },
    end_date: { type: 'string', description: 'ISO date (YYYY-MM-DD) the contract ends, inclusive. Same fallback as start_date.' },
  },
  required: ['customer_name', 'service_type', 'days_of_week', 'start_time', 'end_time', 'start_date', 'end_date'],
}

const createContractTool = {
  type: 'function',
  function: {
    name: 'create_recurring_contract',
    description: 'Create one or more brand-new recurring service contracts/booking plans, each for a customer who needs the service on a repeating weekly pattern over a date range — e.g. "ABC Office Tower signed a contract for daily cleaning from 1 to 31 August, 3 staff, 8-10pm", or a message listing several customers at once, each with their own days/time/staff count. Call this whenever the manager describes a customer/location together with a recurring schedule (days of week + a time + how many staff) that is not already set up in the system — this counts even if the manager does not use the words "new" or "contract", e.g. a message that just lists "Business A: Mon-Fri 7-9pm 3 cleaners, Business B: daily 10pm-1am 5 cleaners" is a request to set both of those up. One entry in the contracts array per customer described. After creating them, the schedule for the covered range is built automatically in the same reply, so do not also call propose_weekly_schedule afterward.',
    parameters: {
      type: 'object',
      properties: {
        contracts: { type: 'array', items: contractSchema, description: 'One entry per new customer/contract described in the manager\'s message.' },
      },
      required: ['contracts'],
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

    let azureConfig
    try {
      azureConfig = getAzureOpenAiConfig()
    } catch (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const token = request.headers.get('authorization')?.replace('Bearer ', '')
    const managerProfile = await getManagerProfile(token)
    if (!managerProfile) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })
    if (managerProfile.role !== 'manager' || managerProfile.status !== 'active' || !managerProfile.host_admin_id) {
      return NextResponse.json({ error: 'Only an active manager can use the scheduling agent.' }, { status: 403 })
    }

    const today = new Date().toISOString().slice(0, 10)
    const systemPrompt = [
      'You are the Manager Scheduling Agent for the Smart Task Allocation app.',
      `Today's date is ${today}.`,
      'Call create_recurring_contract whenever the manager pairs a named customer/location with a recurring schedule (days of week, a time, and usually a staff count) that is not already set up — this applies even if they never say "new" or "contract". A message can describe several customers at once (e.g. "ABC Office Mon-Fri 7-9pm 3 cleaners, Green Mall daily 10pm-1am 5 cleaners"); put one entry per customer in the contracts array, all in a single call. For days_of_week, list the weekday NAMES mentioned — do not number or count them yourself. For start_time/end_time, only reformat the stated clock time into 24-hour HH:MM — do not calculate a duration or day count; that math is done in code afterward, not by you. If the manager gives one overall window for the whole message (e.g. "next week", "from 1 to 31 August") rather than a separate duration per customer, use that same window as every contract\'s start_date/end_date.',
      'Only call propose_weekly_schedule (start_date/end_date, no contract details) when the manager is asking to build/refresh a schedule from bookings/contracts that are already set up, without giving new schedule specifics (days/time/staff) for a customer that is not yet in the system.',
      'If the manager does not specify a date range for propose_weekly_schedule, default to today through 7 days from today.',
      'For anything else, reply briefly and naturally without calling a function. Keep replies concise, plain text only, no Markdown.',
    ].join(' ')

    const messages = [{ role: 'system', content: systemPrompt }, ...cleanHistory(history), { role: 'user', content: userMessage }]

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000)
    const response = await fetch(azureConfig.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': azureConfig.apiKey,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: azureConfig.deployment,
        messages,
        tools: [scheduleTool, createContractTool],
        tool_choice: 'auto',
        // gpt-5 is a reasoning model: temperature is fixed at 1 (can't be overridden), and
        // max_completion_tokens covers hidden reasoning tokens as well as the visible reply/tool
        // call — 300 was silently exhausted entirely on reasoning with zero visible output.
        max_completion_tokens: 2000,
      }),
    })
    clearTimeout(timeoutId)

    const data = await response.json().catch(() => null)
    if (!data) return NextResponse.json({ error: 'Azure OpenAI returned a non-JSON response.' }, { status: 502 })
    if (!response.ok) {
      return NextResponse.json({ error: data.error?.message || 'Azure OpenAI request failed.' }, { status: response.status })
    }

    const toolCalls = data.choices?.[0]?.message?.tool_calls || []
    // If the model returns calls to both tools in the same turn, prefer create_recurring_contract
    // — it already builds and returns the schedule for the covered range afterward, so a separate
    // propose_weekly_schedule call would just be redundant.
    const contractCall = toolCalls.find((call) => call.function?.name === 'create_recurring_contract')
    const scheduleCall = toolCalls.find((call) => call.function?.name === 'propose_weekly_schedule')

    if (contractCall) {
      const args = JSON.parse(contractCall.function.arguments || '{}')
      const contracts = Array.isArray(args.contracts) ? args.contracts : [args]
      if (contracts.length === 0) return NextResponse.json({ error: 'No contract details were provided.' }, { status: 400 })

      const created = []
      const createdContracts = []
      const failed = []
      for (const contract of contracts) {
        try {
          await createManagerRecurringBooking(managerProfile.host_admin_id, managerProfile.id, contract)
          created.push(contract.customer_name || 'Unnamed customer')
          createdContracts.push(contract)
        } catch (error) {
          failed.push(`${contract.customer_name || 'Unnamed customer'}: ${error.message}`)
        }
      }

      if (created.length === 0) {
        return NextResponse.json({ error: failed.join(' ') || 'Could not create any contracts.' }, { status: 400 })
      }

      const validRanges = contracts.filter((c) => isValidIsoDate(c.start_date) && isValidIsoDate(c.end_date))
      const range = validRanges.length
        ? {
          start_date: validRanges.map((c) => c.start_date).sort()[0],
          end_date: validRanges.map((c) => c.end_date).sort().slice(-1)[0],
        }
        : defaultDateRange()

      const proposal = await buildScheduleProposal(managerProfile.host_admin_id, range)
      const createdSummary = `Created ${created.length} recurring contract${created.length === 1 ? '' : 's'}: ${created.join(', ')}.`
      const failedSummary = failed.length ? ` Could not create: ${failed.join('; ')}.` : ''
      const reply = `${createdSummary}${failedSummary} ${summarizeProposal(proposal, range)}`
      return NextResponse.json({ reply, proposal, range, contracts: createdContracts })
    }

    if (scheduleCall) {
      const args = JSON.parse(scheduleCall.function.arguments || '{}')
      const range = isValidIsoDate(args.start_date) && isValidIsoDate(args.end_date)
        ? { start_date: args.start_date, end_date: args.end_date }
        : defaultDateRange()

      const proposal = await buildScheduleProposal(managerProfile.host_admin_id, range)
      return NextResponse.json({ reply: summarizeProposal(proposal, range), proposal, range })
    }

    const reply = data.choices?.[0]?.message?.content?.trim()
    if (!reply) return NextResponse.json({ error: 'Azure OpenAI returned an empty reply.' }, { status: 502 })
    return NextResponse.json({ reply })
  } catch (error) {
    if (error.name === 'AbortError') {
      return NextResponse.json({ error: 'Azure OpenAI request timed out. Check your network connection, endpoint, and deployment name.' }, { status: 504 })
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
