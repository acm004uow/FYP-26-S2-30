import Layout from '../../../components/Layout'
import TimeInput from '../../../components/TimeInput'
import { useEffect, useRef, useState } from 'react'
import { Bot, Calendar, CheckCircle, CheckSquare, Filter, Info, Loader2, MapPin, RefreshCw, Send, ShieldCheck, Sparkles, User, Wand2, X, XCircle } from 'lucide-react'
import { supabase } from '../../../../lib/supabaseClient'
import { assignStaffToBooking, rejectBooking, updateBookingAssignment } from '../../../../lib/assignBooking'
import { fetchApprovedTimeOffClient, isStaffOffOnDate } from '../../../../lib/staffTimeOff'
import { useAuthUser } from '../../../context/AuthUserContext'

const suggestions = ['Create schedule for one week', 'Build a schedule for the next 3 days', 'Schedule deep cleaning tasks', 'Fill last-minute bookings']

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
  const [editingBooking, setEditingBooking] = useState(null)
  const [editStaffId, setEditStaffId] = useState('')
  const [editDate, setEditDate] = useState('')
  const [editTime, setEditTime] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState('')
  const [approvedTimeOff, setApprovedTimeOff] = useState([])
  const [showHowItWorks, setShowHowItWorks] = useState(false)
  const [proposalFilter, setProposalFilter] = useState('all')
  const [proposalSearch, setProposalSearch] = useState('')
  // Verified once per page visit and reused by every approve/reassign click below, instead of
  // re-fetching auth.getUser()+profiles on every single row — that's what made bulk approval of
  // a large proposal slow (2 extra round trips x every booking).
  const managerRef = useRef(null)
  const chatScrollRef = useRef(null)

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight
    }
  }, [messages, isSending])

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

  const checkPendingAutoProposal = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return
      const response = await fetch('/api/agent', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const data = await response.json().catch(() => null)
      if (!response.ok || !data?.proposal) return

      setProposal(data.proposal.map(row => ({ ...row, uiStatus: row.already_assigned ? 'scheduled' : 'pending', errorMessage: null })))
      setMessages(prev => [...prev, {
        role: 'bot',
        content: `An automatically generated schedule for the week of ${data.range.start_date} to ${data.range.end_date} is ready for review.`,
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

  const openEditModal = (booking) => {
    setEditingBooking(booking)
    setEditStaffId(booking.assigned_staff_id || '')
    setEditDate(booking.scheduled_date || '')
    setEditTime(booking.scheduled_time || '')
    setEditError('')
  }

  const closeEditModal = () => {
    setEditingBooking(null)
    setEditError('')
  }

  const saveEdit = async () => {
    if (!editingBooking) return
    setEditSaving(true)
    setEditError('')

    const manager = await getActiveManager()
    if (!manager) {
      setEditError('Only an active manager can update the schedule.')
      setEditSaving(false)
      return
    }

    const staff = editStaffId ? staffRows.find(item => item.id === editStaffId) : null
    const previousStaff = staffRows.find(item => item.id === editingBooking.assigned_staff_id) || null

    if (staff && isStaffOffOnDate(staff.id, editDate, approvedTimeOff)) {
      setEditError(`${staff.name} has approved time off on ${editDate} and cannot be assigned.`)
      setEditSaving(false)
      return
    }

    const result = await updateBookingAssignment({
      booking: { id: editingBooking.id, status: editingBooking.status },
      staff,
      scheduledDate: editDate,
      scheduledTime: editTime,
      managerUserId: manager.id,
      previousStaff,
    })

    setEditSaving(false)
    if (!result.success) {
      setEditError(result.message)
      return
    }

    setProposal(prev => prev.map(row => row.booking_id === editingBooking.id
      ? (staff
        ? { ...row, recommended_staff_id: staff.id, recommended_staff_name: staff.name, already_assigned: true, uiStatus: 'scheduled', reason: 'Already scheduled', score: null, scheduled_date: editDate, scheduled_time: editTime, errorMessage: null }
        : { ...row, recommended_staff_id: null, recommended_staff_name: null, already_assigned: false, uiStatus: 'pending', reason: 'No recommendation yet — ask the agent to re-schedule this booking.', score: 0, scheduled_date: editDate, scheduled_time: editTime, errorMessage: null })
      : row))

    closeEditModal()
    await loadStaff()
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
        setProposal(data.proposal.map(row => ({ ...row, uiStatus: row.already_assigned ? 'scheduled' : 'pending', errorMessage: null })))
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
    if (isStaffOffOnDate(staff.id, row.scheduled_date, approvedTimeOff)) {
      updateRow(row.booking_id, { uiStatus: 'error', errorMessage: `${staff.name} has approved time off on ${row.scheduled_date}.` })
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
  const conflictCount = proposal.filter(row => row.uiStatus === 'error' || !row.recommended_staff_id).length
  const visibleProposal = proposal.filter(row => {
    const matchesFilter = proposalFilter === 'all'
      || (proposalFilter === 'pending' && row.uiStatus === 'pending')
      || (proposalFilter === 'conflicts' && (row.uiStatus === 'error' || !row.recommended_staff_id))
    const haystack = `${row.service_type || ''} ${row.location || ''} ${row.recommended_staff_name || ''}`.toLowerCase()
    return matchesFilter && haystack.includes(proposalSearch.trim().toLowerCase())
  })
  const scheduleDays = [...new Set(proposal.map(row => row.scheduled_date).filter(Boolean))].sort().slice(0, 7)

  return (
    <Layout role="manager">
      <div className="mx-auto max-w-[1600px] px-4 py-6 lg:px-6">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><Sparkles className="w-6 h-6 text-accent" /> AI Scheduling Agent</h1>
            <p className="text-gray-500 mt-1">Describe what you need in plain language. The agent proposes staff assignments — nothing is saved until you approve.</p>
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

        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_430px]">
        <div className="flex min-w-0 flex-col rounded-2xl border bg-white shadow-sm" style={{ height: 'calc(100vh - 11rem)', minHeight: '34rem' }}>
          <div className="flex items-center gap-2 px-5 py-4 border-b flex-shrink-0">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-white text-xs font-semibold flex-shrink-0">1</span>
            <h2 className="font-semibold text-gray-900">Your request</h2>
          </div>

          <div ref={chatScrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            {messages.map((msg, index) => (
              <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`flex max-w-[85%] items-start gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                    msg.role === 'user' ? 'bg-accent-800 text-white' : msg.isError ? 'bg-red-100 text-red-600' : 'bg-accent-100 text-accent-600'
                  }`}>
                    {msg.role === 'user' ? <User className="h-3.5 w-3.5" /> : msg.isError ? <XCircle className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
                  </span>
                  <div className={msg.role === 'user' ? 'text-right' : ''}>
                    <div className={`rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
                      msg.role === 'user'
                        ? 'bg-accent text-white rounded-tr-sm'
                        : msg.isError
                          ? 'bg-red-50 text-red-700 rounded-tl-sm'
                          : 'bg-gray-100 text-gray-800 rounded-tl-sm'
                    }`}>
                      {msg.content}
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1">{msg.time}</p>
                  </div>
                </div>
              </div>
            ))}
            {isSending && (
              <div className="flex justify-start">
                <div className="flex items-start gap-2">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-100 text-accent-600">
                    <Bot className="h-3.5 w-3.5" />
                  </span>
                  <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-sm bg-gray-100 px-4 py-2.5 text-sm text-gray-500">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking...
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="px-5 py-4 border-t flex-shrink-0">
              <form onSubmit={handleSubmit} className="flex gap-2 items-start">
                <div className="relative flex-1">
                  <Wand2 className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                  <textarea
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        sendMessage(input)
                      }
                    }}
                    placeholder="e.g. Create schedule for one week"
                    disabled={isSending}
                    rows={2}
                    className="w-full pl-9 pr-3 py-2.5 border rounded-lg text-sm resize-y max-h-56 focus:outline-none focus:ring-2 focus:ring-accent-200"
                  />
                </div>
                <button type="submit" disabled={isSending} className="flex items-center gap-1.5 px-4 py-2.5 bg-accent hover:bg-accent-600 text-white rounded-lg text-sm font-semibold transition disabled:opacity-60 flex-shrink-0">
                  <Send className="w-4 h-4" />
                </button>
              </form>
              <p className="text-[11px] text-gray-400 mt-1.5">Press Enter to send, Shift+Enter for a new line</p>
              <div className="flex items-center gap-2 overflow-x-auto pt-3">
                {suggestions.map(label => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => sendMessage(label)}
                    disabled={isSending}
                    className="shrink-0 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600 hover:border-accent-300 hover:bg-accent-100 hover:text-accent-600 transition disabled:opacity-50"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border bg-white shadow-sm xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)]">
            <div className="p-5 border-b flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-purple-600 text-white text-xs font-semibold flex-shrink-0">2</span>
                  <h2 className="font-semibold text-gray-900">Proposed Bookings ({proposal.length})</h2>
                </div>
                <p className="text-xs text-gray-400 mt-1 ml-8">
                  {proposal.length === 0 ? 'AI generated · Review and approve' : `${proposal.length} booking${proposal.length === 1 ? '' : 's'} this week — ${pendingCount} pending review`}
                </p>
              </div>
              <input
                value={proposalSearch}
                onChange={event => setProposalSearch(event.target.value)}
                placeholder="Search"
                aria-label="Search proposed bookings"
                className="min-w-0 flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-purple-200"
              />
              <button
                type="button"
                onClick={() => setProposalFilter(value => value === 'all' ? 'pending' : value === 'pending' ? 'conflicts' : 'all')}
                title="Cycle booking filters"
                className="flex-shrink-0 flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
              >
                <Filter className="w-4 h-4" /> {proposalFilter === 'all' ? 'All' : proposalFilter === 'pending' ? `Pending (${pendingCount})` : `Conflicts (${conflictCount})`}
              </button>
            </div>
            {proposal.length > 0 && (
              <div className="p-4 border-b bg-gray-50 flex justify-end gap-3">
                <button
                  onClick={rejectAll}
                  disabled={pendingCount === 0}
                  className="flex items-center gap-1 px-4 py-2 bg-red-500 text-white rounded-lg text-sm disabled:opacity-50 hover:bg-red-600"
                >
                  <XCircle className="w-4 h-4" /> Reject All ({pendingCount})
                </button>
                <button
                  onClick={approveAll}
                  disabled={pendingCount === 0}
                  className="flex items-center gap-1 px-4 py-2 bg-accent hover:bg-accent-600 text-white rounded-lg text-sm transition disabled:opacity-50"
                >
                  <CheckCircle className="w-4 h-4" /> Approve All ({pendingCount})
                </button>
              </div>
            )}
            <div className="max-h-[calc(100vh-15rem)] space-y-3 overflow-y-auto bg-gray-50/60 p-3">
              {visibleProposal.map(row => (
                <div key={row.booking_id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:border-blue-200 hover:shadow-md">
                  <div className="flex justify-between items-start gap-4">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                        {row.service_type}
                        {row.recurring_booking_id && <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">Recurring</span>}
                      </h3>
                      <p className="text-sm text-gray-500 flex items-center gap-1 mt-1"><MapPin className="w-4 h-4" />{row.location}</p>
                      {row.scheduled_date && (
                        <p className="text-sm text-gray-500 flex items-center gap-1 mt-1"><Calendar className="w-4 h-4" />{row.scheduled_date} {row.scheduled_time}</p>
                      )}
                      {row.already_assigned ? (
                        <div className="mt-2 rounded-lg bg-green-50 border border-green-100 px-3 py-2">
                          <p className="text-sm text-green-700 flex items-center gap-1">
                            <CheckCircle className="w-4 h-4" /> Scheduled: {row.recommended_staff_name}
                          </p>
                        </div>
                      ) : (
                        <div className="mt-2 rounded-lg bg-accent-100 border border-accent-200 px-3 py-2">
                          <p className="text-sm text-accent-800 flex items-center gap-1">
                            <Sparkles className="w-4 h-4" />
                            {row.recommended_staff_name ? `Recommended: ${row.recommended_staff_name}` : 'No suitable staff found'}
                          </p>
                          <p className="text-xs text-accent-600 mt-0.5">{row.reason} (score {row.score})</p>
                        </div>
                      )}
                      {row.errorMessage && <p className="text-sm text-red-500 mt-2">{row.errorMessage}</p>}
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full font-medium flex-shrink-0 ${
                      row.uiStatus === 'assigned' || row.uiStatus === 'scheduled' ? 'bg-green-100 text-green-700'
                        : row.uiStatus === 'skipped' ? 'bg-gray-100 text-gray-500'
                          : row.uiStatus === 'rejected' ? 'bg-red-100 text-red-700'
                            : row.uiStatus === 'error' ? 'bg-red-100 text-red-700'
                              : 'bg-yellow-100 text-yellow-700'
                    }`}>
                      {row.uiStatus === 'assigning' ? 'Assigning...' : row.uiStatus === 'rejecting' ? 'Rejecting...' : row.uiStatus.charAt(0).toUpperCase() + row.uiStatus.slice(1)}
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
                  {row.uiStatus === 'scheduled' && (
                    <div className="flex gap-3 mt-4">
                      <button
                        onClick={() => openEditModal({
                          id: row.booking_id,
                          assigned_staff_id: row.recommended_staff_id,
                          scheduled_date: row.scheduled_date,
                          scheduled_time: row.scheduled_time,
                          status: row.status,
                          service_type: row.service_type,
                          location: row.location,
                        })}
                        className="flex items-center gap-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm"
                      >
                        <User className="w-4 h-4" /> Reassign
                      </button>
                    </div>
                  )}
                </div>
              ))}
              {proposal.length === 0 && (
                <div className="p-10 text-center">
                  <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-xl bg-accent-100">
                    <div className="relative">
                      <Calendar className="w-9 h-9 text-accent-400" />
                      <div className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-accent">
                        <Bot className="w-3 h-3 text-white" />
                      </div>
                    </div>
                  </div>
                  <h3 className="font-semibold text-gray-900">No proposed schedule yet</h3>
                  <p className="text-sm text-gray-400 mt-1">Ask the agent to create a schedule to see this week&apos;s assignments here.</p>

                  <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3 text-left">
                    <div className="rounded-lg border border-gray-100 p-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-purple-100 text-purple-600 mb-2"><RefreshCw className="w-4 h-4" /></div>
                      <p className="text-sm font-medium text-gray-800">Smart matching</p>
                      <p className="text-xs text-gray-400 mt-0.5">Considers availability, skills, and workload to find the best fit.</p>
                    </div>
                    <div className="rounded-lg border border-gray-100 p-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100 text-green-600 mb-2"><ShieldCheck className="w-4 h-4" /></div>
                      <p className="text-sm font-medium text-gray-800">Conflict prevention</p>
                      <p className="text-xs text-gray-400 mt-0.5">Avoids overlaps, rule violations, and overtime issues.</p>
                    </div>
                    <div className="rounded-lg border border-gray-100 p-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-100 text-accent-600 mb-2"><CheckSquare className="w-4 h-4" /></div>
                      <p className="text-sm font-medium text-gray-800">Easy to review</p>
                      <p className="text-xs text-gray-400 mt-0.5">Approve, edit, or reassign with ease.</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="border-t bg-accent-100/60 px-5 py-3 flex items-center gap-2 text-xs text-accent-800">
              <Info className="w-3.5 h-3.5 flex-shrink-0" /> Nothing is saved until you approve the schedule.
            </div>
          </div>
        </div>
      </div>

      {editingBooking && (
        <div className="fixed inset-0 bg-gray-900/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="p-5 border-b flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-900">{editingBooking.service_type}</h3>
                <p className="text-sm text-gray-500 flex items-center gap-1 mt-1"><MapPin className="w-4 h-4" />{editingBooking.location}</p>
              </div>
              <button onClick={closeEditModal} className="p-1 rounded-lg hover:bg-gray-100" aria-label="Close"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Staff</label>
                <select value={editStaffId} onChange={e => setEditStaffId(e.target.value)} className="w-full px-4 py-2 border rounded-lg text-sm">
                  <option value="">Unassign</option>
                  {staffRows.map(staff => {
                    const offOnDate = editDate && isStaffOffOnDate(staff.id, editDate, approvedTimeOff)
                    return (
                      <option key={staff.id} value={staff.id}>{staff.name}{offOnDate ? ' (Off that day)' : !staff.canAssign ? ' (unavailable)' : ''}</option>
                    )
                  })}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Date</label>
                  <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} className="w-full px-4 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Time</label>
                  <TimeInput value={editTime} onChange={setEditTime} />
                </div>
              </div>
              {editError && <p className="text-sm text-red-500">{editError}</p>}
            </div>
            <div className="p-5 border-t flex gap-3">
              <button onClick={saveEdit} disabled={editSaving} className="flex-1 py-2 bg-accent hover:bg-accent-600 text-white rounded-lg text-sm font-semibold transition disabled:opacity-60">
                {editSaving ? 'Saving...' : 'Save'}
              </button>
              <button onClick={closeEditModal} className="flex-1 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
