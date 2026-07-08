import Layout from '../../../components/Layout'
import { useEffect, useRef, useState } from 'react'
import { Bot, Calendar, CheckCircle, ChevronLeft, ChevronRight, Loader2, Lock, MapPin, Plus, Printer, Send, Sparkles, User, X, XCircle } from 'lucide-react'
import { supabase } from '../../../../lib/supabaseClient'
import { assignStaffToBooking, updateBookingAssignment } from '../../../../lib/assignBooking'

const suggestions = ['Create schedule for one week', 'Build a schedule for the next 3 days', 'Schedule bookings for next week']

const availabilityLabel = { unavailable: 'UNAVAILABLE', time_off: 'TIME OFF' }

// Dates are kept entirely in UTC arithmetic (parse with a "Z" suffix, use getUTC*/setUTC*).
// Mixing local-time parsing with .toISOString() (always UTC) would silently shift every
// date back a day for any timezone ahead of UTC — e.g. Singapore (UTC+8).
function getWeekDates(anchorIso) {
  const anchor = new Date(`${anchorIso}T00:00:00Z`)
  const day = anchor.getUTCDay()
  const diffToMonday = day === 0 ? -6 : 1 - day
  const monday = new Date(anchor)
  monday.setUTCDate(anchor.getUTCDate() + diffToMonday)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setUTCDate(monday.getUTCDate() + i)
    return d.toISOString().slice(0, 10)
  })
}

function shiftWeek(anchorIso, days) {
  const d = new Date(`${anchorIso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function addHoursToTime(time, hours) {
  if (!time) return ''
  const [h, m] = time.split(':').map(Number)
  const totalMinutes = h * 60 + (m || 0) + Math.round(Number(hours || 0) * 60)
  const endH = Math.floor((totalMinutes % 1440) / 60)
  const endM = totalMinutes % 60
  return `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`
}

// Full addresses are composed as "..., Singapore 123456" — show just the postal code where
// one is present, since the grid cell has no room for a full street address.
function locationLabel(location) {
  const match = String(location || '').match(/\b(\d{6})\b/)
  return match ? match[1] : location
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]))
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
  const [pastSnapshot, setPastSnapshot] = useState(null)
  const [editingBooking, setEditingBooking] = useState(null)
  const [editStaffId, setEditStaffId] = useState('')
  const [editDate, setEditDate] = useState('')
  const [editTime, setEditTime] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState('')
  const [finalizing, setFinalizing] = useState(false)
  const [unassignedBookings, setUnassignedBookings] = useState([])
  const [schedulingSlot, setSchedulingSlot] = useState(null)
  const [scheduleBookingId, setScheduleBookingId] = useState('')
  const [scheduleTime, setScheduleTime] = useState('')
  const [scheduleSaving, setScheduleSaving] = useState(false)
  const [scheduleError, setScheduleError] = useState('')
  const messagesEndRef = useRef(null)

  useEffect(() => {
    (async () => {
      const id = await loadStaff()
      if (id) {
        await loadWeeklyGrid(id, weekAnchor)
        await loadUnassignedBookings(id)
      }
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
    const todayIso = new Date().toISOString().slice(0, 10)

    if (dates[6] < todayIso) {
      const { data: finalized } = await supabase
        .from('finalized_schedules')
        .select('snapshot,finalized_at')
        .eq('host_admin_id', hostAdminIdParam)
        .eq('week_start', dates[0])
        .maybeSingle()

      if (finalized) {
        setPastSnapshot(finalized)
        setWeekBookings(finalized.snapshot.bookings || [])
        return
      }
    }

    setPastSnapshot(null)
    const { data } = await supabase
      .from('bookings')
      .select('id,assigned_staff_id,service_type,location,scheduled_date,scheduled_time,estimated_hours,status')
      .eq('host_admin_id', hostAdminIdParam)
      .not('assigned_staff_id', 'is', null)
      .not('status', 'in', '(rejected,cancelled)')
      .gte('scheduled_date', dates[0])
      .lte('scheduled_date', dates[6])

    setWeekBookings(data || [])
  }

  const goToWeek = async (days) => {
    const newAnchor = shiftWeek(weekAnchor, days)
    setWeekAnchor(newAnchor)
    await loadWeeklyGrid(hostAdminId, newAnchor)
  }

  const loadUnassignedBookings = async (hostAdminIdParam) => {
    if (!hostAdminIdParam) return
    const { data } = await supabase
      .from('bookings')
      .select('id,service_type,location,scheduled_date,scheduled_time,estimated_hours,status')
      .eq('host_admin_id', hostAdminIdParam)
      .is('assigned_staff_id', null)
      .in('status', ['pending', 'approved'])
      .order('created_at', { ascending: false })
    setUnassignedBookings(data || [])
  }

  const openScheduleModal = (staff, date) => {
    setSchedulingSlot({ staffId: staff.id, staffName: staff.name, date })
    setScheduleBookingId('')
    setScheduleTime('')
    setScheduleError('')
  }

  const closeScheduleModal = () => {
    setSchedulingSlot(null)
    setScheduleError('')
  }

  const saveManualSchedule = async () => {
    if (!schedulingSlot || !scheduleBookingId) return
    setScheduleSaving(true)
    setScheduleError('')

    const manager = await getActiveManager()
    if (!manager) {
      setScheduleError('Only an active manager can schedule bookings.')
      setScheduleSaving(false)
      return
    }

    const staff = staffRows.find(item => item.id === schedulingSlot.staffId)
    const booking = unassignedBookings.find(item => item.id === scheduleBookingId)

    const result = await updateBookingAssignment({
      booking: { id: scheduleBookingId, status: booking?.status || 'pending' },
      staff,
      scheduledDate: schedulingSlot.date,
      scheduledTime: scheduleTime || booking?.scheduled_time || '',
      managerUserId: manager.id,
      previousStaff: null,
    })

    setScheduleSaving(false)
    if (!result.success) {
      setScheduleError(result.message)
      return
    }

    closeScheduleModal()
    await loadStaff()
    await loadWeeklyGrid(hostAdminId, weekAnchor)
    await loadUnassignedBookings(hostAdminId)
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

      setProposal(data.proposal.map(row => ({ ...row, uiStatus: row.already_assigned ? 'scheduled' : 'pending', errorMessage: null })))
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
    await loadWeeklyGrid(hostAdminId, weekAnchor)
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
  const today = new Date().toISOString().slice(0, 10)
  const scheduledStaffRows = pastSnapshot
    ? pastSnapshot.snapshot.staff
    : staffRows.filter(staff => weekBookings.some(b => b.assigned_staff_id === staff.id))
  // The live grid shows every active staff member (not just those with jobs already)
  // so a manager can manually schedule an unexpected task onto anyone's empty day.
  // Finalized past weeks keep showing only the staff captured in that week's snapshot.
  const gridStaffRows = pastSnapshot ? scheduledStaffRows : staffRows

  const exportSchedulePdf = () => {
    const theadHtml = `
      <tr>
        <th>Staff</th>
        ${weekDates.map(date => `
          <th>${new Date(`${date}T00:00:00`).toLocaleDateString([], { weekday: 'short' }).toUpperCase()}<br><span class="date">${date.slice(5)}</span></th>
        `).join('')}
      </tr>
    `

    const rowsHtml = scheduledStaffRows.map(staff => {
      const staffBookingCount = weekBookings.filter(b => b.assigned_staff_id === staff.id).length
      const cellsHtml = weekDates.map(date => {
        const dayBookings = weekBookings
          .filter(b => b.assigned_staff_id === staff.id && b.scheduled_date === date)
          .sort((a, b) => (a.scheduled_time || '').localeCompare(b.scheduled_time || ''))
        if (dayBookings.length === 0) return `<td class="empty">–</td>`
        const jobsHtml = dayBookings.map(b => `
          <div class="job">
            <div class="time">${b.scheduled_time || ''}${b.scheduled_time ? `–${addHoursToTime(b.scheduled_time, b.estimated_hours)}` : ''}</div>
            <div class="service">${escapeHtml(b.service_type)}</div>
            <div class="location">${escapeHtml(locationLabel(b.location))}</div>
          </div>
        `).join('')
        return `<td>${jobsHtml}</td>`
      }).join('')
      return `<tr><td class="staff-name">${escapeHtml(staff.name)}<span class="count">${staffBookingCount} job${staffBookingCount === 1 ? '' : 's'}</span></td>${cellsHtml}</tr>`
    }).join('')

    const html = `
      <html>
        <head>
          <title>Weekly Schedule ${weekDates[0]} to ${weekDates[6]}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; color: #111; }
            h1 { font-size: 18px; margin-bottom: 4px; }
            p { color: #555; margin-top: 0; margin-bottom: 16px; font-size: 13px; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; table-layout: fixed; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; vertical-align: top; }
            th { background: #f5f5f5; }
            .date { color: #888; font-weight: normal; }
            .staff-name { font-weight: bold; white-space: nowrap; }
            .count { font-weight: normal; color: #888; font-size: 11px; margin-left: 6px; }
            .empty { color: #ccc; }
            .job { margin-bottom: 6px; padding-bottom: 6px; border-bottom: 1px dashed #eee; }
            .job:last-child { margin-bottom: 0; padding-bottom: 0; border-bottom: none; }
            .time { font-weight: bold; }
            .service { color: #444; }
            .location { color: #888; }
            @media print { body { padding: 0; } }
          </style>
        </head>
        <body>
          <h1>Weekly Schedule</h1>
          <p>${weekDates[0]} to ${weekDates[6]} — ${weekBookings.length} booking(s) across ${scheduledStaffRows.length} staff member(s)</p>
          <table>
            <thead>${theadHtml}</thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </body>
      </html>
    `

    const printWindow = window.open('', '_blank', 'width=1000,height=700')
    if (!printWindow) return
    printWindow.document.write(html)
    printWindow.document.close()
    printWindow.focus()
    printWindow.print()
  }

  const finalizeSchedule = async () => {
    if (scheduledStaffRows.length === 0 || finalizing || pastSnapshot) return
    setFinalizing(true)

    const manager = await getActiveManager()
    if (!manager) {
      setMessages(prev => [...prev, { role: 'bot', content: 'Only an active manager can finalize the schedule.', time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }])
      setFinalizing(false)
      return
    }

    const notifiable = scheduledStaffRows.filter(staff => staff.userId)
    const notifications = notifiable.map(staff => {
      const jobs = weekBookings
        .filter(b => b.assigned_staff_id === staff.id)
        .sort((a, b) => `${a.scheduled_date}${a.scheduled_time}`.localeCompare(`${b.scheduled_date}${b.scheduled_time}`))
        .map(b => `${b.scheduled_date} ${b.scheduled_time || ''} ${b.service_type} (${b.location})`.trim())
        .join('; ')
      return {
        user_id: staff.userId,
        title: 'Your schedule is finalized',
        message: `Your finalized schedule for ${weekDates[0]} to ${weekDates[6]}: ${jobs}`,
      }
    })

    if (notifications.length > 0) {
      await supabase.from('notifications').insert(notifications)
    }
    await supabase.from('audit_logs').insert({
      user_id: manager.id,
      action: 'finalize_weekly_schedule',
      details: `Finalized schedule for ${weekDates[0]} to ${weekDates[6]}, notified ${notifications.length} staff`,
    })
    await supabase.from('finalized_schedules').upsert({
      host_admin_id: hostAdminId,
      week_start: weekDates[0],
      week_end: weekDates[6],
      finalized_by: manager.id,
      finalized_at: new Date().toISOString(),
      snapshot: {
        staff: scheduledStaffRows.map(staff => ({ id: staff.id, name: staff.name, availabilityStatus: staff.availabilityStatus })),
        bookings: weekBookings,
      },
    }, { onConflict: 'host_admin_id,week_start' })

    setFinalizing(false)
    setMessages(prev => [...prev, {
      role: 'bot',
      content: `Finalized the schedule for ${weekDates[0]} to ${weekDates[6]} — notified ${notifications.length} staff member${notifications.length === 1 ? '' : 's'}.`,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }])
  }

  return (
    <Layout role="manager">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold flex items-center gap-2"><Sparkles className="w-6 h-6 text-blue-500" /> AI Scheduling Agent</h1>
        <p className="text-gray-500 mb-6">Describe what you need in plain language. The agent proposes staff assignments — nothing is saved until you approve.</p>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_420px] gap-6">
          <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
            <div className="p-5 border-b">
              <h2 className="font-semibold text-gray-900">Proposed Schedule</h2>
              <p className="text-sm text-gray-500 mt-1">{proposal.length === 0 ? 'Ask the agent to create a schedule to see this week\'s bookings here.' : `${proposal.length} booking${proposal.length === 1 ? '' : 's'} this week — ${pendingCount} pending review`}</p>
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
                      {row.already_assigned ? (
                        <div className="mt-2 rounded-lg bg-green-50 border border-green-100 px-3 py-2">
                          <p className="text-sm text-green-700 flex items-center gap-1">
                            <CheckCircle className="w-4 h-4" /> Scheduled: {row.recommended_staff_name}
                          </p>
                        </div>
                      ) : (
                        <div className="mt-2 rounded-lg bg-indigo-50 border border-indigo-100 px-3 py-2">
                          <p className="text-sm text-indigo-700 flex items-center gap-1">
                            <Sparkles className="w-4 h-4" />
                            {row.recommended_staff_name ? `Recommended: ${row.recommended_staff_name}` : 'No suitable staff found'}
                          </p>
                          <p className="text-xs text-indigo-500 mt-0.5">{row.reason} (score {row.score})</p>
                        </div>
                      )}
                      {row.errorMessage && <p className="text-sm text-red-500 mt-2">{row.errorMessage}</p>}
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full font-medium flex-shrink-0 ${
                      row.uiStatus === 'assigned' || row.uiStatus === 'scheduled' ? 'bg-green-100 text-green-700'
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
          <div className="p-5 border-b flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h2 className="font-semibold text-gray-900 flex items-center gap-2"><Calendar className="w-5 h-5 text-blue-500" /> Weekly Schedule</h2>
              <div className="flex items-center gap-1 mt-1">
                <button onClick={() => goToWeek(-7)} className="p-1 rounded hover:bg-gray-100" aria-label="Previous week"><ChevronLeft className="w-4 h-4 text-gray-500" /></button>
                <p className="text-sm text-gray-500">
                  {weekDates[0]} to {weekDates[6]} — {weekBookings.length} booking{weekBookings.length === 1 ? '' : 's'} across {scheduledStaffRows.length} staff member{scheduledStaffRows.length === 1 ? '' : 's'}.
                </p>
                <button onClick={() => goToWeek(7)} className="p-1 rounded hover:bg-gray-100" aria-label="Next week"><ChevronRight className="w-4 h-4 text-gray-500" /></button>
              </div>
              {pastSnapshot && (
                <p className="text-xs text-gray-400 mt-1 flex items-center gap-1"><Lock className="w-3 h-3" /> Finalized on {new Date(pastSnapshot.finalized_at).toLocaleString()}</p>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={exportSchedulePdf}
                disabled={scheduledStaffRows.length === 0}
                className="flex items-center gap-1 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm disabled:opacity-50"
              >
                <Printer className="w-4 h-4" /> Export PDF
              </button>
              <button
                onClick={finalizeSchedule}
                disabled={scheduledStaffRows.length === 0 || finalizing || !!pastSnapshot}
                title={pastSnapshot ? 'This week is already finalized' : undefined}
                className="flex items-center gap-1 px-3 py-2 bg-gradient-to-r from-blue-500 to-green-500 text-white rounded-lg text-sm disabled:opacity-50"
              >
                <Lock className="w-4 h-4" /> {finalizing ? 'Finalizing...' : pastSnapshot ? 'Finalized' : 'Finalize Schedule'}
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left p-3 border-b font-semibold text-gray-700 sticky left-0 bg-gray-50">Staff</th>
                  {weekDates.map(date => (
                    <th key={date} className={`text-left p-3 border-b font-semibold whitespace-nowrap ${date === today ? 'bg-blue-50 text-blue-700' : 'text-gray-700'}`}>
                      {new Date(`${date}T00:00:00`).toLocaleDateString([], { weekday: 'short' }).toUpperCase()}
                      <div className={`text-xs font-normal ${date === today ? 'text-blue-400' : 'text-gray-400'}`}>{date.slice(5)}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {gridStaffRows.map(staff => {
                  const staffBookingCount = weekBookings.filter(b => b.assigned_staff_id === staff.id).length
                  return (
                    <tr key={staff.id} className="border-b hover:bg-gray-50/60 transition">
                      <td className="p-3 font-medium text-gray-800 sticky left-0 bg-white whitespace-nowrap">
                        {staff.name}
                        <span className="ml-2 text-xs text-gray-400 align-middle">{staffBookingCount} job{staffBookingCount === 1 ? '' : 's'}</span>
                        {availabilityLabel[staff.availabilityStatus] && (
                          <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 align-middle">
                            {availabilityLabel[staff.availabilityStatus]}
                          </span>
                        )}
                      </td>
                      {weekDates.map(date => {
                        const dayBookings = weekBookings.filter(b => b.assigned_staff_id === staff.id && b.scheduled_date === date)
                        return (
                          <td key={date} className={`p-3 align-top ${date === today ? 'bg-blue-50/40' : ''}`}>
                            {dayBookings.length === 0
                              ? (pastSnapshot
                                ? <span className="text-gray-300">–</span>
                                : (
                                  <button
                                    type="button"
                                    onClick={() => openScheduleModal(staff, date)}
                                    title={`Schedule a task for ${staff.name}`}
                                    className="flex h-6 w-6 items-center justify-center rounded text-gray-300 transition hover:bg-blue-100 hover:text-blue-500"
                                  >
                                    <Plus className="w-3.5 h-3.5" />
                                  </button>
                                ))
                              : (
                                <>
                                  {dayBookings.map((b, i) => (
                                    <button
                                      type="button"
                                      key={b.id}
                                      onClick={pastSnapshot ? undefined : () => openEditModal(b)}
                                      disabled={!!pastSnapshot}
                                      className={`block w-full text-left rounded-lg px-2 py-1.5 -mx-2 transition ${pastSnapshot ? 'cursor-default' : 'hover:bg-blue-100'} ${i > 0 ? 'mt-1.5 border-t border-gray-100 pt-2' : ''}`}
                                    >
                                      <p className="text-xs font-medium text-gray-800 whitespace-nowrap">
                                        {b.scheduled_time}{b.scheduled_time && `–${addHoursToTime(b.scheduled_time, b.estimated_hours)}`}
                                      </p>
                                      <p className="text-xs text-gray-500">{b.service_type}</p>
                                      <p className="text-xs text-gray-400">{locationLabel(b.location)}</p>
                                    </button>
                                  ))}
                                  {!pastSnapshot && (
                                    <button
                                      type="button"
                                      onClick={() => openScheduleModal(staff, date)}
                                      className="mt-1.5 flex items-center gap-1 text-xs text-gray-400 hover:text-blue-500"
                                    >
                                      <Plus className="w-3 h-3" /> Add
                                    </button>
                                  )}
                                </>
                              )}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
                {gridStaffRows.length === 0 && (
                  <tr><td colSpan={8} className="p-8 text-center text-gray-400">No active staff found.</td></tr>
                )}
              </tbody>
            </table>
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
                  {staffRows.map(staff => (
                    <option key={staff.id} value={staff.id}>{staff.name}{!staff.canAssign ? ' (unavailable)' : ''}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Date</label>
                  <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} className="w-full px-4 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Time</label>
                  <input type="time" value={editTime} onChange={e => setEditTime(e.target.value)} className="w-full px-4 py-2 border rounded-lg text-sm" />
                </div>
              </div>
              {editError && <p className="text-sm text-red-500">{editError}</p>}
            </div>
            <div className="p-5 border-t flex gap-3">
              <button onClick={saveEdit} disabled={editSaving} className="flex-1 py-2 bg-gradient-to-r from-blue-500 to-green-500 text-white rounded-lg text-sm font-medium disabled:opacity-60">
                {editSaving ? 'Saving...' : 'Save'}
              </button>
              <button onClick={closeEditModal} className="flex-1 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {schedulingSlot && (
        <div className="fixed inset-0 bg-gray-900/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="p-5 border-b flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-900">Schedule task</h3>
                <p className="text-sm text-gray-500 mt-1">
                  {schedulingSlot.staffName} — {new Date(`${schedulingSlot.date}T00:00:00`).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}
                </p>
              </div>
              <button onClick={closeScheduleModal} className="p-1 rounded-lg hover:bg-gray-100" aria-label="Close"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Unassigned booking</label>
                <select
                  value={scheduleBookingId}
                  onChange={e => {
                    const selected = unassignedBookings.find(b => b.id === e.target.value)
                    setScheduleBookingId(e.target.value)
                    setScheduleTime(selected?.scheduled_time || '')
                  }}
                  className="w-full px-4 py-2 border rounded-lg text-sm"
                >
                  <option value="">Select a booking...</option>
                  {unassignedBookings.map(b => (
                    <option key={b.id} value={b.id}>
                      {b.service_type} — {locationLabel(b.location)}{b.scheduled_date ? ` (requested ${b.scheduled_date})` : ''}
                    </option>
                  ))}
                </select>
                {unassignedBookings.length === 0 && <p className="text-xs text-gray-400 mt-2">No unassigned bookings right now.</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Time</label>
                <input type="time" value={scheduleTime} onChange={e => setScheduleTime(e.target.value)} className="w-full px-4 py-2 border rounded-lg text-sm" />
              </div>
              {scheduleError && <p className="text-sm text-red-500">{scheduleError}</p>}
            </div>
            <div className="p-5 border-t flex gap-3">
              <button onClick={saveManualSchedule} disabled={scheduleSaving || !scheduleBookingId} className="flex-1 py-2 bg-gradient-to-r from-blue-500 to-green-500 text-white rounded-lg text-sm font-medium disabled:opacity-60">
                {scheduleSaving ? 'Scheduling...' : 'Schedule'}
              </button>
              <button onClick={closeScheduleModal} className="flex-1 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
