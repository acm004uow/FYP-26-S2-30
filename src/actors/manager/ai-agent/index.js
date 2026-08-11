import Layout from '../../../components/Layout'
import { useEffect, useRef, useState } from 'react'
import { Bot, Building2, Calendar, Info, Loader2, Package, Repeat, Send, Sparkles, Wand2, XCircle } from 'lucide-react'
import { supabase } from '../../../../lib/supabaseClient'
import { assignStaffToBooking, rejectBooking, updateBookingAssignment } from '../../../../lib/assignBooking'
import { fetchApprovedTimeOffClient, isStaffOffOnDate } from '../../../../lib/staffTimeOff'
import { useAuthUser } from '../../../context/AuthUserContext'
import { getWeekDates, shiftWeek, formatTime12h } from '../../../../lib/weekDates'
import ScheduleTimeline from './ScheduleTimeline'
import ReassignPanel from './ReassignPanel'

function monthDay(dateIso) {
  return new Date(`${dateIso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

function buildSuggestionChips() {
  const todayIso = new Date().toISOString().slice(0, 10)
  const thisWeekMonday = getWeekDates(todayIso)[0]
  const nextWeekDates = getWeekDates(shiftWeek(thisWeekMonday, 7))
  const nextWeekLabel = `${monthDay(nextWeekDates[0])} – ${monthDay(nextWeekDates[6])}`
  return [
    { icon: 'calendar', color: 'text-blue-600 bg-blue-100', label: `Next week (${nextWeekLabel})` },
    { icon: 'sparkles', color: 'text-green-600 bg-green-100', label: 'Schedule pending bookings' },
    { icon: 'repeat', color: 'text-purple-600 bg-purple-100', label: 'Recurring contracts' },
    { icon: 'package', color: 'text-orange-600 bg-orange-100', label: 'Fill unassigned bookings' },
  ]
}

const CHIP_ICONS = { calendar: Calendar, sparkles: Sparkles, repeat: Repeat, package: Package }

export default function ManagerAiAgent() {
  const { user } = useAuthUser()
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
  const [approvedTimeOff, setApprovedTimeOff] = useState([])
  const [showHowItWorks, setShowHowItWorks] = useState(false)
  const [weekAnchor, setWeekAnchor] = useState(new Date().toISOString().slice(0, 10))
  const [selectedGroupKey, setSelectedGroupKey] = useState(null)
  // The booking_ids belonging to whichever calendar block/row is currently open in the reassign
  // drawer — null when the drawer is closed. Kept as ids (not a snapshot of the rows) so the
  // drawer always reflects the live `proposal` state as approvals/reassignments happen.
  const [reassignBookingIds, setReassignBookingIds] = useState(null)
  // Verified once per page visit and reused by every approve/reassign click below, instead of
  // re-fetching auth.getUser()+profiles on every single row — that's what made bulk approval of
  // a large proposal slow (2 extra round trips x every booking).
  const managerRef = useRef(null)
  const suggestionChips = buildSuggestionChips()

  const loadApprovedTimeOff = async (hostAdminIdParam) => {
    if (!hostAdminIdParam) {
      setApprovedTimeOff([])
      return
    }
    const rows = await fetchApprovedTimeOffClient(supabase, hostAdminIdParam)
    setApprovedTimeOff(rows)
  }

  useEffect(() => {
    if (!user) return
    (async () => {
      const id = await loadStaff()
      if (id) {
        await loadApprovedTimeOff(id)
      }
      await checkPendingAutoProposal()
    })()
  }, [user])

  const loadStaff = async () => {
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

  // Called whenever a genuinely new schedule arrives (not on every approve/skip, which also
  // updates `proposal` but shouldn't jump the calendar back to week 1 or close an open reassign
  // drawer).
  const applyNewProposal = (rows) => {
    const withStatus = rows.map(row => ({ ...row, uiStatus: row.already_assigned ? 'scheduled' : 'pending', errorMessage: null }))
    setProposal(withStatus)
    setSelectedGroupKey(null)
    setReassignBookingIds(null)
    const firstDate = [...withStatus].map(row => row.scheduled_date).filter(Boolean).sort()[0]
    setWeekAnchor(firstDate || new Date().toISOString().slice(0, 10))
  }

  const checkPendingAutoProposal = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return
      const response = await fetch('/api/agent', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const data = await response.json().catch(() => null)
      if (!response.ok || !data?.proposal) return

      applyNewProposal(data.proposal)
      setMessages(prev => [...prev, {
        role: 'bot',
        content: `An automatically generated schedule for the week of ${data.range.start_date} to ${data.range.end_date} is ready for review below.`,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }])
    } catch {
      // Silently ignore — this is a best-effort check, not a required part of loading the page.
    }
  }

  const getActiveManager = async () => {
    if (managerRef.current) return managerRef.current
    if (!user) return null

    const { data: managerProfile } = await supabase
      .from('profiles')
      .select('role,status')
      .eq('id', user?.id)
      .single()

    if (managerProfile?.role !== 'manager' || managerProfile?.status !== 'active') return null
    managerRef.current = user
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

      setMessages(prev => [...prev, {
        role: 'bot',
        content: data.reply,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        structuredRequests: Array.isArray(data.contracts) && data.contracts.length ? data.contracts : undefined,
      }])
      if (Array.isArray(data.proposal)) {
        applyNewProposal(data.proposal)
      }
    } catch (error) {
      setMessages(prev => [...prev, { role: 'bot', content: error.message, isError: true, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }])
    } finally {
      setIsSending(false)
    }
  }

  const updateRow = (bookingId, patch) => {
    setProposal(prev => prev.map(row => row.booking_id === bookingId ? { ...row, ...patch } : row))
  }

  // staffIdOverride lets the reassign drawer approve with a staff member other than the AI's top
  // recommendation — approveAll (bulk, no override) still just uses row.recommended_staff_id.
  const approveRow = async (row, staffIdOverride) => {
    const staffId = staffIdOverride || row.recommended_staff_id
    if (!staffId) {
      updateRow(row.booking_id, { uiStatus: 'error', errorMessage: 'No recommended staff for this booking.' })
      return
    }
    const staff = staffRows.find(item => item.id === staffId)
    if (!staff) {
      updateRow(row.booking_id, { uiStatus: 'error', errorMessage: 'Selected staff is no longer available.' })
      return
    }
    if (isStaffOffOnDate(staff.id, row.scheduled_date, approvedTimeOff)) {
      updateRow(row.booking_id, { uiStatus: 'error', errorMessage: `${staff.name} has approved time off on ${row.scheduled_date}.` })
      return
    }

    const manager = await getActiveManager()
    if (!manager) {
      updateRow(row.booking_id, { uiStatus: 'error', errorMessage: 'Only an active manager can approve assignments.' })
      return
    }

    updateRow(row.booking_id, { uiStatus: 'assigning', errorMessage: null, recommended_staff_id: staff.id, recommended_staff_name: staff.name })
    const result = await assignStaffToBooking({
      booking: { id: row.booking_id, status: row.status, assigned_staff_id: null, service_type: row.service_type },
      staff,
      managerUserId: manager.id,
      action: 'assign_booking_ai_agent',
    })

    if (result.success) {
      updateRow(row.booking_id, { uiStatus: 'assigned', errorMessage: null })
      // Patch the local workload count instead of re-fetching the whole staff list from the
      // server — keeps subsequent recommendations roughly in sync without a network round trip
      // on every single approval. Functional form so concurrent approvals (see approveAll below)
      // still compound correctly against each other in the UI.
      setStaffRows(prev => prev.map(item => item.id === staff.id ? { ...item, tasks: (item.tasks || 0) + 1 } : item))
    } else {
      updateRow(row.booking_id, { uiStatus: 'error', errorMessage: result.message })
    }
  }

  const skipRow = (row) => updateRow(row.booking_id, { uiStatus: 'skipped' })

  // Reassigns staff on an already-scheduled booking — persists immediately via
  // updateBookingAssignment (same as the old dedicated edit modal), staff-only: date/time aren't
  // editable from the calendar drawer.
  const reassignStaff = async (row, staffId) => {
    const manager = await getActiveManager()
    if (!manager) {
      updateRow(row.booking_id, { errorMessage: 'Only an active manager can update the schedule.' })
      return
    }

    const staff = staffId ? staffRows.find(item => item.id === staffId) : null
    const previousStaff = staffRows.find(item => item.id === row.recommended_staff_id) || null

    if (staff && isStaffOffOnDate(staff.id, row.scheduled_date, approvedTimeOff)) {
      updateRow(row.booking_id, { errorMessage: `${staff.name} has approved time off on ${row.scheduled_date}.` })
      return
    }

    const result = await updateBookingAssignment({
      booking: { id: row.booking_id, status: row.status },
      staff,
      scheduledDate: row.scheduled_date,
      scheduledTime: row.scheduled_time,
      managerUserId: manager.id,
      previousStaff,
    })

    if (!result.success) {
      updateRow(row.booking_id, { errorMessage: result.message })
      return
    }

    updateRow(row.booking_id, staff
      ? { recommended_staff_id: staff.id, recommended_staff_name: staff.name, already_assigned: true, uiStatus: 'scheduled', reason: 'Already scheduled', score: null, errorMessage: null }
      : { recommended_staff_id: null, recommended_staff_name: null, already_assigned: false, uiStatus: 'pending', reason: 'No recommendation yet — ask the agent to re-schedule this booking.', score: 0, errorMessage: null })
    await loadStaff()
  }

  // Runs approvals in small concurrent batches rather than one at a time — with a large proposal
  // (a full month of daily visits can easily be 50-90+ rows), the previous strictly-sequential
  // loop meant every booking waited on the full round trip of the one before it. Batched instead
  // of all-at-once to avoid hammering Supabase with 90 simultaneous requests from one click.
  // Note: staff_profiles.current_workload updates read-then-write client-side, so if the same
  // staff member is recommended for two bookings in the same batch its workload count can
  // undercount by one — a soft scoring input, not a correctness issue (no double-booking risk).
  const APPROVE_ALL_CONCURRENCY = 6
  const approveAll = async () => {
    const pendingRows = proposal.filter(row => row.uiStatus === 'pending')
    for (let i = 0; i < pendingRows.length; i += APPROVE_ALL_CONCURRENCY) {
      await Promise.all(pendingRows.slice(i, i + APPROVE_ALL_CONCURRENCY).map(row => approveRow(row)))
    }
  }

  // Unlike skipRow (local-only, view state), this is a real rejection — writes status='rejected'
  // to the booking via lib/assignBooking.js#rejectBooking, same as the Bookings screen's Reject.
  const rejectOneRow = async (row) => {
    const manager = await getActiveManager()
    if (!manager) {
      updateRow(row.booking_id, { uiStatus: 'error', errorMessage: 'Only an active manager can reject bookings.' })
      return
    }

    updateRow(row.booking_id, { uiStatus: 'rejecting', errorMessage: null })
    const result = await rejectBooking({
      booking: { id: row.booking_id },
      managerUserId: manager.id,
      action: 'reject_booking_ai_agent',
    })

    if (result.success) {
      updateRow(row.booking_id, { uiStatus: 'rejected', errorMessage: null })
    } else {
      updateRow(row.booking_id, { uiStatus: 'error', errorMessage: result.message })
    }
  }

  const rejectAll = async () => {
    const pendingRows = proposal.filter(row => row.uiStatus === 'pending')
    for (let i = 0; i < pendingRows.length; i += APPROVE_ALL_CONCURRENCY) {
      await Promise.all(pendingRows.slice(i, i + APPROVE_ALL_CONCURRENCY).map(row => rejectOneRow(row)))
    }
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    sendMessage(input)
  }

  const pendingCount = proposal.filter(row => row.uiStatus === 'pending').length

  const handleSelectGroup = (group) => {
    setSelectedGroupKey(group.groupKey)
    setReassignBookingIds(group.bookingIds)
  }

  const closeReassignPanel = () => {
    setReassignBookingIds(null)
    setSelectedGroupKey(null)
  }

  const reassignRows = reassignBookingIds ? proposal.filter(row => reassignBookingIds.includes(row.booking_id)) : []
  const latestBotMessage = [...messages].reverse().find(msg => msg.role === 'bot')

  return (
    <Layout role="manager">
      <div className="mx-auto max-w-[1600px] px-4 py-6 lg:px-6">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-accent" /> AI Scheduling Agent
              <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-semibold text-purple-600">BETA</span>
            </h1>
            <p className="text-gray-500 mt-1">Describe what you need. The agent proposes staff assignments — nothing is saved until you approve.</p>
          </div>
          <div className="relative flex-shrink-0">
            <button
              type="button"
              onClick={() => setShowHowItWorks(v => !v)}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
            >
              <Info className="w-4 h-4" /> How it works
            </button>
            {showHowItWorks && (
              <div className="absolute right-0 top-full mt-2 w-72 rounded-xl border bg-white p-4 shadow-lg z-10 text-sm text-gray-600 space-y-2">
                <p><strong className="text-gray-900">1. Describe</strong> what you need — a date range, a job type, or a new contract.</p>
                <p><strong className="text-gray-900">2. Review</strong> the proposed schedule — each recommendation shows why that staff member was picked.</p>
                <p><strong className="text-gray-900">3. Approve</strong> individually or all at once. Nothing is saved until you do.</p>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-5">
          <div className="rounded-2xl border bg-white shadow-sm">
            <div className="flex items-center gap-2 px-5 py-4 border-b">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-white text-xs font-semibold flex-shrink-0">1</span>
              <h2 className="font-semibold text-gray-900">What would you like to schedule?</h2>
            </div>
            <div className="p-5 space-y-4">
              <form onSubmit={handleSubmit} className="flex gap-2">
                <div className="relative flex-1">
                  <Wand2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    placeholder="e.g. Create schedule for one week, or schedule all pending bookings for next week"
                    disabled={isSending}
                    className="w-full pl-9 pr-3 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent-200"
                  />
                </div>
                <button type="submit" disabled={isSending} className="flex items-center gap-1.5 px-5 py-2.5 bg-accent hover:bg-accent-600 text-white rounded-lg text-sm font-semibold transition disabled:opacity-60 flex-shrink-0">
                  <Send className="w-4 h-4" /> Send
                </button>
              </form>

              <div className="flex flex-wrap gap-2">
                {suggestionChips.map(chip => {
                  const Icon = CHIP_ICONS[chip.icon]
                  return (
                    <button
                      key={chip.label}
                      type="button"
                      onClick={() => sendMessage(chip.label)}
                      disabled={isSending}
                      className="flex items-center gap-1.5 rounded-full border border-gray-200 bg-white py-1 pl-1.5 pr-3 text-xs text-gray-700 hover:border-accent-300 hover:bg-gray-50 disabled:opacity-50"
                    >
                      <span className={`flex h-5 w-5 items-center justify-center rounded-full ${chip.color}`}><Icon className="w-3 h-3" /></span>
                      {chip.label}
                    </button>
                  )
                })}
              </div>

              {isSending ? (
                <div className="flex items-center gap-1.5 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Thinking...</div>
              ) : latestBotMessage && (
                <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                  {latestBotMessage.structuredRequests && (
                    <div className="mb-3 space-y-2">
                      {latestBotMessage.structuredRequests.map((contract, contractIndex) => (
                        <div key={contractIndex} className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 shadow-sm">
                          <div className="flex items-start gap-2">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-500"><Building2 className="h-4 w-4" /></span>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-gray-900 truncate">{contract.customer_name || 'Unnamed customer'}</p>
                              <p className="text-xs text-gray-500 mt-0.5">
                                {contract.service_type}{contract.start_time && contract.end_time ? ` · ${formatTime12h(contract.start_time)} – ${formatTime12h(contract.end_time)}` : ''}{contract.staff_count ? ` · ${contract.staff_count} staff` : ''}
                              </p>
                              <p className="text-xs text-gray-500 mt-0.5">
                                {contract.start_date} – {contract.end_date}{contract.location ? ` · ${contract.location}` : ''}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className={`flex items-start gap-2 text-sm ${latestBotMessage.isError ? 'text-red-600' : 'text-gray-700'}`}>
                    {latestBotMessage.isError ? <XCircle className="w-4 h-4 mt-0.5 flex-shrink-0" /> : <Bot className="w-4 h-4 mt-0.5 flex-shrink-0 text-accent-600" />}
                    <p className="whitespace-pre-wrap">{latestBotMessage.content}</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <ScheduleTimeline
            proposal={proposal}
            weekAnchor={weekAnchor}
            onWeekAnchorChange={setWeekAnchor}
            selectedGroupKey={selectedGroupKey}
            onSelectGroup={handleSelectGroup}
            pendingCount={pendingCount}
            onApproveAll={approveAll}
            onRejectAll={rejectAll}
          />
        </div>
      </div>

      {reassignBookingIds && (
        <ReassignPanel
          rows={reassignRows}
          staffRows={staffRows}
          approvedTimeOff={approvedTimeOff}
          onApprove={approveRow}
          onSkip={skipRow}
          onReassign={reassignStaff}
          onClose={closeReassignPanel}
        />
      )}
    </Layout>
  )
}
