import Layout from '../../../components/Layout'
import { useEffect, useRef, useState } from 'react'
import { Bot, Calendar, CheckCircle, Loader2, MapPin, Send, Sparkles, User, XCircle } from 'lucide-react'
import { supabase } from '../../../../lib/supabaseClient'
import { assignStaffToBooking } from '../../../../lib/assignBooking'

const suggestions = ['Create schedule for one week', 'Build a schedule for the next 3 days', 'Schedule bookings for next week']

const availabilityLabel = { unavailable: 'UNAVAILABLE', time_off: 'TIME OFF' }

function getWeekDates(anchorIso) {
  const anchor = new Date(`${anchorIso}T00:00:00`)
  const day = anchor.getDay()
  const diffToMonday = day === 0 ? -6 : 1 - day
  const monday = new Date(anchor)
  monday.setDate(anchor.getDate() + diffToMonday)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d.toISOString().slice(0, 10)
  })
}

function addHoursToTime(time, hours) {
  if (!time) return ''
  const [h, m] = time.split(':').map(Number)
  const totalMinutes = h * 60 + (m || 0) + Math.round(Number(hours || 0) * 60)
  const endH = Math.floor((totalMinutes % 1440) / 60)
  const endM = totalMinutes % 60
  return `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`
}

export default function ManagerAiAgent() {
  const [staffRows, setStaffRows] = useState([])
  const [messages, setMessages] = useState([{
    role: 'bot',
    content: "Hi! I'm the scheduling agent. Tell me what to schedule, e.g. \"Create schedule for one week\", and I'll propose staff assignments for you to review.",
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  }])
  const [input, setInput] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [proposal, setProposal] = useState([])
  const [hostAdminId, setHostAdminId] = useState(null)
  const [weekAnchor, setWeekAnchor] = useState(new Date().toISOString().slice(0, 10))
  const [weekBookings, setWeekBookings] = useState([])
  const messagesEndRef = useRef(null)

  useEffect(() => {
    (async () => {
      const id = await loadStaff()
      if (id) await loadWeeklyGrid(id, weekAnchor)
      await checkPendingAutoProposal(id)
    })()
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const loadStaff = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: managerProfile } = await supabase
      .from('profiles')
      .select('host_admin_id')
      .eq('id', user?.id)
      .single()

    const resolvedHostAdminId = managerProfile?.host_admin_id
    setHostAdminId(resolvedHostAdminId || null)
    if (!resolvedHostAdminId) {
      setStaffRows([])
      return null
    }

    const { data: staff } = await supabase
      .from('staff_profiles')
      .select('id,user_id,staff_name,availability,current_workload,performance_rating,status,is_suspended')
      .eq('host_admin_id', resolvedHostAdminId)
      .eq('status', 'active')
      .order('staff_name')

    setStaffRows((staff || []).map(row => ({
      id: row.id,
      userId: row.user_id,
      name: row.staff_name,
      tasks: row.current_workload || 0,
      canAssign: !row.is_suspended && row.status === 'active' && row.availability === 'available',
      availabilityStatus: row.availability,
    })))
    return resolvedHostAdminId
  }

  const loadWeeklyGrid = async (hostAdminIdParam, anchorIso) => {
    if (!hostAdminIdParam) return
    const dates = getWeekDates(anchorIso)
    const { data } = await supabase
      .from('bookings')
      .select('assigned_staff_id,service_type,location,scheduled_date,scheduled_time,estimated_hours,status')
      .eq('host_admin_id', hostAdminIdParam)
      .not('assigned_staff_id', 'is', null)
      .not('status', 'in', '(rejected,cancelled)')
      .gte('scheduled_date', dates[0])
      .lte('scheduled_date', dates[6])

    setWeekBookings(data || [])
  }

  const checkPendingAutoProposal = async (hostAdminIdParam) => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return
      const response = await fetch('/api/agent', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const data = await response.json().catch(() => null)
      if (!response.ok || !data?.proposal) return

      setProposal(data.proposal.map(row => ({ ...row, uiStatus: 'pending', errorMessage: null })))
      setMessages(prev => [...prev, {
        role: 'bot',
        content: `An automatically generated schedule for the week of ${data.range.start_date} to ${data.range.end_date} is ready for review below.`,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }])
      if (data.range?.start_date) {
        setWeekAnchor(data.range.start_date)
        await loadWeeklyGrid(hostAdminIdParam, data.range.start_date)
      }
    } catch {
      // Silently ignore — this is a best-effort check, not a required part of loading the page.
    }
  }

  const getActiveManager = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: managerProfile } = await supabase
      .from('profiles')
      .select('role,status')
      .eq('id', user?.id)
      .single()

    if (managerProfile?.role !== 'manager' || managerProfile?.status !== 'active') return null
    return user
  }

  const sendMessage = async (text) => {
    const trimmed = text.trim()
    if (!trimmed || isSending) return
    const userMsg = { role: 'user', content: trimmed, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }
    const nextMessages = [...messages, userMsg]
    setMessages(nextMessages)
    setInput('')
    setIsSending(true)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const response = await fetch('/api/agent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ message: trimmed, history: nextMessages.slice(-8) }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || 'Scheduling agent request failed.')

      setMessages(prev => [...prev, { role: 'bot', content: data.reply, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }])
      if (Array.isArray(data.proposal)) {
        setProposal(data.proposal.map(row => ({ ...row, uiStatus: 'pending', errorMessage: null })))
        if (data.range?.start_date) {
          setWeekAnchor(data.range.start_date)
          await loadWeeklyGrid(hostAdminId, data.range.start_date)
        }
      }
    } catch (error) {
      setMessages(prev => [...prev, { role: 'bot', content: `Error: ${error.message}`, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }])
    } finally {
      setIsSending(false)
    }
  }

  const updateRow = (bookingId, patch) => {
    setProposal(prev => prev.map(row => row.booking_id === bookingId ? { ...row, ...patch } : row))
  }

  const approveRow = async (row) => {
    if (!row.recommended_staff_id) {
      updateRow(row.booking_id, { uiStatus: 'error', errorMessage: 'No recommended staff for this booking.' })
      return
    }
    const staff = staffRows.find(item => item.id === row.recommended_staff_id)
    if (!staff) {
      updateRow(row.booking_id, { uiStatus: 'error', errorMessage: 'Recommended staff is no longer available.' })
      return
    }

    const manager = await getActiveManager()
    if (!manager) {
      updateRow(row.booking_id, { uiStatus: 'error', errorMessage: 'Only an active manager can approve assignments.' })
      return
    }

    updateRow(row.booking_id, { uiStatus: 'assigning', errorMessage: null })
    const result = await assignStaffToBooking({
      booking: { id: row.booking_id, status: row.status, assigned_staff_id: null, service_type: row.service_type },
      staff,
      managerUserId: manager.id,
      action: 'assign_booking_ai_agent',
    })

    if (result.success) {
      updateRow(row.booking_id, { uiStatus: 'assigned', errorMessage: null })
      await loadStaff()
      await loadWeeklyGrid(hostAdminId, weekAnchor)
    } else {
      updateRow(row.booking_id, { uiStatus: 'error', errorMessage: result.message })
    }
  }

  const skipRow = (row) => updateRow(row.booking_id, { uiStatus: 'skipped' })

  const approveAll = async () => {
    for (const row of proposal) {
      if (row.uiStatus === 'pending') {
        await approveRow(row)
      }
    }
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    sendMessage(input)
  }

  const pendingCount = proposal.filter(row => row.uiStatus === 'pending').length
  const weekDates = getWeekDates(weekAnchor)

  return (
    <Layout role="manager">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold flex items-center gap-2"><Sparkles className="w-6 h-6 text-blue-500" /> AI Scheduling Agent</h1>
        <p className="text-gray-500 mb-6">Describe what you need in plain language. The agent proposes staff assignments — nothing is saved until you approve.</p>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_420px] gap-6">
          <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
            <div className="p-5 border-b">
              <h2 className="font-semibold text-gray-900">Proposed Schedule</h2>
              <p className="text-sm text-gray-500 mt-1">{proposal.length === 0 ? 'Ask the agent to create a schedule to see proposed assignments here.' : `${pendingCount} pending review`}</p>
            </div>
            {proposal.length > 0 && (
              <div className="p-4 border-b bg-gray-50 flex justify-end">
                <button
                  onClick={approveAll}
                  disabled={pendingCount === 0}
                  className="flex items-center gap-1 px-4 py-2 bg-gradient-to-r from-blue-500 to-green-500 text-white rounded-lg text-sm disabled:opacity-50"
                >
                  <CheckCircle className="w-4 h-4" /> Approve All ({pendingCount})
                </button>
              </div>
            )}
            <div className="divide-y divide-gray-50 max-h-[70vh] overflow-y-auto">
              {proposal.map(row => (
                <div key={row.booking_id} className="p-5">
                  <div className="flex justify-between items-start gap-4">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-gray-900">{row.service_type}</h3>
                      <p className="text-sm text-gray-500 flex items-center gap-1 mt-1"><MapPin className="w-4 h-4" />{row.location}</p>
                      {row.scheduled_date && (
                        <p className="text-sm text-gray-500 flex items-center gap-1 mt-1"><Calendar className="w-4 h-4" />{row.scheduled_date} {row.scheduled_time}</p>
                      )}
                      <div className="mt-2 rounded-lg bg-indigo-50 border border-indigo-100 px-3 py-2">
                        <p className="text-sm text-indigo-700 flex items-center gap-1">
                          <Sparkles className="w-4 h-4" />
                          {row.recommended_staff_name ? `Recommended: ${row.recommended_staff_name}` : 'No suitable staff found'}
                        </p>
                        <p className="text-xs text-indigo-500 mt-0.5">{row.reason} (score {row.score})</p>
                      </div>
                      {row.errorMessage && <p className="text-sm text-red-500 mt-2">{row.errorMessage}</p>}
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full font-medium flex-shrink-0 ${
                      row.uiStatus === 'assigned' ? 'bg-green-100 text-green-700'
                        : row.uiStatus === 'skipped' ? 'bg-gray-100 text-gray-500'
                          : row.uiStatus === 'error' ? 'bg-red-100 text-red-700'
                            : 'bg-yellow-100 text-yellow-700'
                    }`}>
                      {row.uiStatus === 'assigning' ? 'Assigning...' : row.uiStatus.charAt(0).toUpperCase() + row.uiStatus.slice(1)}
                    </span>
                  </div>
                  {row.uiStatus === 'pending' && (
                    <div className="flex gap-3 mt-4">
                      <button onClick={() => approveRow(row)} className="flex items-center gap-1 px-4 py-2 bg-green-500 text-white rounded-lg text-sm"><CheckCircle className="w-4 h-4" /> Approve</button>
                      <button onClick={() => skipRow(row)} className="flex items-center gap-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm"><XCircle className="w-4 h-4" /> Skip</button>
                    </div>
                  )}
                  {row.uiStatus === 'error' && (
                    <div className="flex gap-3 mt-4">
                      <button onClick={() => approveRow(row)} className="flex items-center gap-1 px-4 py-2 bg-green-500 text-white rounded-lg text-sm"><CheckCircle className="w-4 h-4" /> Retry</button>
                      <button onClick={() => skipRow(row)} className="flex items-center gap-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm"><XCircle className="w-4 h-4" /> Skip</button>
                    </div>
                  )}
                </div>
              ))}
              {proposal.length === 0 && <div className="p-8 text-center text-gray-400">No proposed schedule yet.</div>}
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border h-fit flex flex-col" style={{ height: '640px' }}>
            <div className="p-4 border-b flex items-center gap-2">
              <Bot className="w-5 h-5 text-blue-500" />
              <h2 className="font-semibold text-gray-900">Scheduling Chat</h2>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map((msg, i) => (
                <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {msg.role === 'bot' && <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-green-500 rounded-full flex items-center justify-center flex-shrink-0"><Bot className="w-4 h-4 text-white" /></div>}
                  <div className={`px-4 py-2 rounded-2xl max-w-xs text-sm whitespace-pre-line leading-relaxed ${msg.role === 'user' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-800'}`}>{msg.content}</div>
                  {msg.role === 'user' && <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center flex-shrink-0"><User className="w-4 h-4 text-gray-600" /></div>}
                </div>
              ))}
              {isSending && (
                <div className="flex gap-2 justify-start">
                  <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-green-500 rounded-full flex items-center justify-center"><Bot className="w-4 h-4 text-white" /></div>
                  <div className="px-4 py-2 rounded-2xl max-w-xs text-sm bg-gray-100 text-gray-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Thinking...</div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
            <div className="px-4 pb-3">
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {suggestions.map(suggestion => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => sendMessage(suggestion)}
                    className="shrink-0 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600 transition"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
            <div className="p-4 border-t">
              <form className="flex gap-2" onSubmit={handleSubmit}>
                <input value={input} onChange={e => setInput(e.target.value)} placeholder="Tell the agent what to schedule..." className="flex-1 px-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" disabled={isSending} />
                <button type="submit" className="bg-gradient-to-r from-blue-500 to-green-500 text-white p-2 rounded-lg disabled:opacity-60" aria-label="Send message" disabled={isSending}><Send className="w-5 h-5" /></button>
              </form>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border overflow-hidden mt-6">
          <div className="p-5 border-b flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-gray-900 flex items-center gap-2"><Calendar className="w-5 h-5 text-blue-500" /> Weekly Schedule</h2>
              <p className="text-sm text-gray-500 mt-1">
                {weekDates[0]} to {weekDates[6]} — every active staff member and their assigned bookings this week.
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left p-3 border-b font-semibold text-gray-700 sticky left-0 bg-gray-50">Staff</th>
                  {weekDates.map(date => (
                    <th key={date} className="text-left p-3 border-b font-semibold text-gray-700 whitespace-nowrap">
                      {new Date(`${date}T00:00:00`).toLocaleDateString([], { weekday: 'short' }).toUpperCase()}
                      <div className="text-xs font-normal text-gray-400">{date.slice(5)}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {staffRows.map(staff => (
                  <tr key={staff.id} className="border-b">
                    <td className="p-3 font-medium text-gray-800 sticky left-0 bg-white whitespace-nowrap">
                      {staff.name}
                      {availabilityLabel[staff.availabilityStatus] && (
                        <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 align-middle">
                          {availabilityLabel[staff.availabilityStatus]}
                        </span>
                      )}
                    </td>
                    {weekDates.map(date => {
                      const dayBookings = weekBookings.filter(b => b.assigned_staff_id === staff.id && b.scheduled_date === date)
                      return (
                        <td key={date} className="p-3 align-top">
                          {dayBookings.length === 0
                            ? <span className="text-gray-300">–</span>
                            : dayBookings.map((b, i) => (
                              <div key={i} className={i > 0 ? 'mt-2' : ''}>
                                <p className="text-xs font-medium text-gray-800 whitespace-nowrap">
                                  {b.scheduled_time}{b.scheduled_time && `–${addHoursToTime(b.scheduled_time, b.estimated_hours)}`}
                                </p>
                                <p className="text-xs text-gray-500">{b.service_type}</p>
                                <p className="text-xs text-gray-400">{b.location}</p>
                              </div>
                            ))}
                        </td>
                      )
                    })}
                  </tr>
                ))}
                {staffRows.length === 0 && (
                  <tr><td colSpan={8} className="p-8 text-center text-gray-400">No active staff found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Layout>
  )
}
