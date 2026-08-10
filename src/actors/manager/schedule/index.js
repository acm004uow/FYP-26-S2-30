import Layout from '../../../components/Layout'
import TimeInput from '../../../components/TimeInput'
import { useEffect, useRef, useState } from 'react'
import { Calendar, ChevronLeft, ChevronRight, Lock, MoreVertical, Pencil, Plus, Printer, Sparkles, Wand2, X } from 'lucide-react'
import { supabase } from '../../../../lib/supabaseClient'
import { useAuthUser } from '../../../context/AuthUserContext'
import { createManualBooking, updateBookingAssignment } from '../../../../lib/assignBooking'
import { fetchApprovedTimeOffClient, isStaffOffOnDate } from '../../../../lib/staffTimeOff'
import { loadServiceTypes, SERVICE_TYPES } from '../../../../lib/serviceTypes'
import TaskCreationForm from '../../../components/TaskCreationForm'

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

function formatTime12h(time) {
  if (!time) return ''
  const [h, m] = time.split(':').map(Number)
  if (Number.isNaN(h)) return time
  const period = h >= 12 ? 'PM' : 'AM'
  const hour12 = h % 12 || 12
  return m ? `${hour12}:${String(m).padStart(2, '0')}${period.toLowerCase()}` : `${hour12}${period.toLowerCase()}`
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

// The "AI Agent" tab of the Add Task modal: a free-text hint (e.g. "Cus Name - Saung, Location -
// 123456 #05-01, tomorrow 2pm") goes to /api/agent/parse-task, which returns structured fields for
// the manager to review/edit before creating the booking via createManualBooking. Kept as its own
// compact panel here rather than reusing the full ManagerNewTask form, per the intended "specific
// UI" for a quick single-task AI add (the full form's own AI assist only drafts a description for
// fields the manager already filled in manually).
function AiTaskPanel({ hostAdminId, staffRows, approvedTimeOff, serviceTypes, defaultDate, getActiveManager, onCreated }) {
  const [hint, setHint] = useState('')
  const [parsing, setParsing] = useState(false)
  const [parseError, setParseError] = useState('')
  const [extracted, setExtracted] = useState(null)
  const [selectedStaffId, setSelectedStaffId] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  const updateField = (field, value) => setExtracted(prev => ({ ...prev, [field]: value }))

  const handleParse = async () => {
    if (!hint.trim()) {
      setParseError('Describe the task first.')
      return
    }
    setParsing(true)
    setParseError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const response = await fetch('/api/agent/parse-task', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ hint }),
      })
      const result = await response.json().catch(() => null)
      if (!response.ok) throw new Error(result?.error || 'Could not parse the task.')

      setExtracted({
        customerName: result.customerName || '',
        location: result.location || '',
        serviceType: serviceTypes.includes(result.serviceType) ? result.serviceType : serviceTypes[0],
        scheduledDate: result.scheduledDate || defaultDate || '',
        scheduledTime: result.scheduledTime || '',
        estimatedHours: result.estimatedHours || 2,
        description: result.description || '',
      })
      setSelectedStaffId('')
      setCreateError('')
    } catch (error) {
      setParseError(error.message)
    } finally {
      setParsing(false)
    }
  }

  const handleCreate = async () => {
    if (!extracted) return
    if (!extracted.location.trim()) {
      setCreateError('Location is required.')
      return
    }
    const staff = staffRows.find(row => row.id === selectedStaffId)
    if (!staff) {
      setCreateError('Select a staff member to assign.')
      return
    }
    const manager = await getActiveManager()
    if (!manager) {
      setCreateError('Only an active manager can create tasks.')
      return
    }

    setCreating(true)
    setCreateError('')
    const result = await createManualBooking({
      hostAdminId,
      serviceType: extracted.serviceType,
      location: extracted.location,
      description: extracted.description,
      estimatedHours: extracted.estimatedHours,
      scheduledDate: extracted.scheduledDate,
      scheduledTime: extracted.scheduledTime,
      staff,
      managerUserId: manager.id,
      guestName: extracted.customerName,
      creationMethod: 'ai',
    })
    setCreating(false)

    if (!result.success) {
      setCreateError(result.message)
      return
    }
    onCreated()
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-start gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-purple-100 text-purple-600">
          <Sparkles className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-gray-900">Add task with AI</h2>
          <p className="text-sm text-gray-500 mt-0.5">Describe the job in your own words — the AI fills in the details for you to review.</p>
        </div>
      </div>

      <div>
        <label className="text-sm font-medium text-gray-700">Describe the task</label>
        <textarea
          value={hint}
          onChange={e => setHint(e.target.value)}
          placeholder="e.g. Cus Name - Saung, Location - postal code and floor, date and time"
          rows={3}
          className="mt-1 w-full rounded-lg border border-gray-200 p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
        />
        {parseError && <p className="mt-1 text-xs text-red-500">{parseError}</p>}
        <button
          type="button"
          onClick={handleParse}
          disabled={parsing}
          className="mt-2 flex items-center gap-1.5 rounded-full bg-purple-50 px-3 py-1.5 text-xs font-medium text-purple-600 hover:bg-purple-100 disabled:opacity-60"
        >
          <Wand2 className="w-3.5 h-3.5" /> {parsing ? 'Reading...' : extracted ? 'Re-generate' : 'Generate details'}
        </button>
      </div>

      {extracted && (
        <div className="space-y-4 rounded-xl border border-gray-100 bg-gray-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Review before creating</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600">Customer Name</label>
              <input value={extracted.customerName} onChange={e => updateField('customerName', e.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 bg-white p-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Service Type</label>
              <select value={extracted.serviceType} onChange={e => updateField('serviceType', e.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 bg-white p-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500">
                {serviceTypes.map(type => <option key={type} value={type}>{type}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Location</label>
            <input value={extracted.location} onChange={e => updateField('location', e.target.value)} placeholder="Postal code and floor/unit" className="mt-1 w-full rounded-lg border border-gray-200 bg-white p-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600">Date</label>
              <input type="date" value={extracted.scheduledDate} onChange={e => updateField('scheduledDate', e.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 bg-white p-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Time</label>
              <TimeInput className="mt-1" value={extracted.scheduledTime} onChange={value => updateField('scheduledTime', value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Est. Hours</label>
              <input type="number" min="1" step="0.5" value={extracted.estimatedHours} onChange={e => updateField('estimatedHours', Number(e.target.value))} className="mt-1 w-full rounded-lg border border-gray-200 bg-white p-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Description</label>
            <textarea value={extracted.description} onChange={e => updateField('description', e.target.value)} rows={2} className="mt-1 w-full rounded-lg border border-gray-200 bg-white p-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Assign Staff <span className="text-red-500">*</span></label>
            <select value={selectedStaffId} onChange={e => setSelectedStaffId(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 bg-white p-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500">
              <option value="">Choose staff...</option>
              {staffRows.map(staff => {
                const offOnDate = extracted.scheduledDate && isStaffOffOnDate(staff.id, extracted.scheduledDate, approvedTimeOff)
                const assignable = staff.canAssign && !offOnDate
                return (
                  <option key={staff.id} value={staff.id} disabled={!assignable}>
                    {staff.name}{assignable ? '' : offOnDate ? ' (Off that day)' : ' (Unavailable)'}
                  </option>
                )
              })}
            </select>
          </div>
          {createError && <p className="text-sm text-red-500">{createError}</p>}
          <button
            type="button"
            onClick={handleCreate}
            disabled={creating}
            className="flex items-center gap-1.5 rounded-lg bg-accent-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#00243d] disabled:opacity-60"
          >
            <Sparkles className="w-4 h-4" /> {creating ? 'Creating...' : 'Create Task'}
          </button>
        </div>
      )}
    </div>
  )
}

export default function ManagerSchedule() {
  const { user } = useAuthUser()
  const [staffRows, setStaffRows] = useState([])
  const [hostAdminId, setHostAdminId] = useState(null)
  const [weekAnchor, setWeekAnchor] = useState(new Date().toISOString().slice(0, 10))
  const [weekBookings, setWeekBookings] = useState([])
  const [pastSnapshot, setPastSnapshot] = useState(null)
  const [finalizing, setFinalizing] = useState(false)
  const [moreMenuOpen, setMoreMenuOpen] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [approvedTimeOff, setApprovedTimeOff] = useState([])
  const [savingBookingId, setSavingBookingId] = useState(null)
  const [editError, setEditError] = useState('')
  const [taskModalDate, setTaskModalDate] = useState(null)
  const [addTaskTab, setAddTaskTab] = useState('manual')
  const [serviceTypes, setServiceTypes] = useState(SERVICE_TYPES)
  const jumpDateRef = useRef(null)

  useEffect(() => {
    if (!user) return
    (async () => {
      const id = await loadStaff()
      if (id) await loadWeeklyGrid(id, weekAnchor)
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
      .select('id,user_id,staff_name,availability,current_workload,is_suspended,status')
      .eq('host_admin_id', resolvedHostAdminId)
      .eq('status', 'active')
      .order('staff_name')

    setStaffRows((staff || []).map(row => ({
      id: row.id,
      userId: row.user_id,
      name: row.staff_name,
      canAssign: !row.is_suspended && row.status === 'active' && row.availability === 'available',
      tasks: row.current_workload || 0,
    })))
    await loadApprovedTimeOff(resolvedHostAdminId)
    setServiceTypes(await loadServiceTypes(supabase, resolvedHostAdminId))
    return resolvedHostAdminId
  }

  const loadApprovedTimeOff = async (hostAdminIdParam) => {
    if (!hostAdminIdParam) {
      setApprovedTimeOff([])
      return
    }
    try {
      setApprovedTimeOff(await fetchApprovedTimeOffClient(supabase, hostAdminIdParam))
    } catch {
      setApprovedTimeOff([])
    }
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
    setEditError('')
    await loadWeeklyGrid(hostAdminId, newAnchor)
  }

  const jumpToDate = async (dateIso) => {
    if (!dateIso) return
    setWeekAnchor(dateIso)
    setEditError('')
    await loadWeeklyGrid(hostAdminId, dateIso)
  }

  const openAddTask = (date) => {
    setTaskModalDate(date)
    setAddTaskTab('manual')
  }

  const closeAddTask = async () => {
    setTaskModalDate(null)
    await loadWeeklyGrid(hostAdminId, weekAnchor)
  }

  const handleReassign = async (booking, staffId) => {
    const manager = await getActiveManager()
    if (!manager) return
    setEditError('')
    const staff = staffId ? staffRows.find(row => row.id === staffId) : null
    const previousStaff = booking.assigned_staff_id ? staffRows.find(row => row.id === booking.assigned_staff_id) : null

    setSavingBookingId(booking.id)
    const result = await updateBookingAssignment({
      booking,
      staff,
      scheduledDate: booking.scheduled_date,
      scheduledTime: booking.scheduled_time,
      managerUserId: manager.id,
      previousStaff,
    })
    setSavingBookingId(null)

    if (!result.success) {
      setEditError(result.message)
      return
    }
    await loadWeeklyGrid(hostAdminId, weekAnchor)
  }

  const getActiveManager = async () => {
    if (!user) return null
    const { data: managerProfile } = await supabase
      .from('profiles')
      .select('role,status')
      .eq('id', user?.id)
      .single()

    if (managerProfile?.role !== 'manager' || managerProfile?.status !== 'active') return null
    return user
  }

  const weekDates = getWeekDates(weekAnchor)
  const today = new Date().toISOString().slice(0, 10)
  const scheduledStaffRows = pastSnapshot ? pastSnapshot.snapshot.staff : staffRows
  const weekOfLabel = new Date(`${weekDates[0]}T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' })

  const exportSchedulePdf = () => {
    setMoreMenuOpen(false)
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
    setMoreMenuOpen(false)
    if (scheduledStaffRows.length === 0 || finalizing || pastSnapshot) return
    setFinalizing(true)

    const manager = await getActiveManager()
    if (!manager) {
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
        staff: scheduledStaffRows.map(staff => ({ id: staff.id, name: staff.name, userId: staff.userId })),
        bookings: weekBookings,
      },
    }, { onConflict: 'host_admin_id,week_start' })

    setFinalizing(false)
    await loadWeeklyGrid(hostAdminId, weekAnchor)
  }

  return (
    <Layout role="manager">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Manager / Schedule</p>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Schedule</h1>
            <p className="text-gray-500 text-sm mt-1">Week of {weekOfLabel}</p>
            {pastSnapshot && (
              <p className="text-xs text-gray-400 mt-1 flex items-center gap-1"><Lock className="w-3 h-3" /> Finalized on {new Date(pastSnapshot.finalized_at).toLocaleString()}</p>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={() => goToWeek(-7)} className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 transition hover:bg-gray-50" aria-label="Previous week"><ChevronLeft className="w-4 h-4" /></button>
            <button onClick={() => goToWeek(7)} className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 transition hover:bg-gray-50" aria-label="Next week"><ChevronRight className="w-4 h-4" /></button>
            <button
              type="button"
              onClick={() => jumpDateRef.current?.showPicker ? jumpDateRef.current.showPicker() : jumpDateRef.current?.click()}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 transition hover:bg-gray-50"
              aria-label="Jump to date"
            >
              <Calendar className="w-4 h-4" />
            </button>
            <input
              ref={jumpDateRef}
              type="date"
              value={weekAnchor}
              onChange={e => jumpToDate(e.target.value)}
              className="sr-only"
              tabIndex={-1}
            />
            <button
              type="button"
              onClick={() => { setEditMode(v => !v); setEditError('') }}
              disabled={!!pastSnapshot}
              aria-pressed={editMode}
              title={pastSnapshot ? 'This week is finalized and read-only' : editMode ? 'Done editing' : 'Edit schedule'}
              className={`flex h-10 w-10 items-center justify-center rounded-full border transition disabled:opacity-50 disabled:cursor-not-allowed ${
                editMode ? 'border-accent bg-accent text-white hover:bg-accent-600' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              <Pencil className="w-4 h-4" />
            </button>
            <div className="relative">
              <button
                type="button"
                onClick={() => setMoreMenuOpen(open => !open)}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 transition hover:bg-gray-50"
                aria-label="More options"
              >
                <MoreVertical className="w-4 h-4" />
              </button>
              {moreMenuOpen && (
                <div className="absolute right-0 mt-1 w-48 bg-white border rounded-lg shadow-lg z-10 overflow-hidden">
                  <button
                    type="button"
                    onClick={exportSchedulePdf}
                    disabled={scheduledStaffRows.length === 0}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    <Printer className="w-4 h-4" /> Export PDF
                  </button>
                  <button
                    type="button"
                    onClick={finalizeSchedule}
                    disabled={scheduledStaffRows.length === 0 || finalizing || !!pastSnapshot}
                    title={pastSnapshot ? 'This week is already finalized' : undefined}
                    className="flex w-full items-center gap-2 border-t px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    <Lock className="w-4 h-4" /> {finalizing ? 'Finalizing...' : pastSnapshot ? 'Finalized' : 'Finalize Schedule'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {editMode && (
          <div className="mt-4 rounded-lg border border-accent-200 bg-accent-100 px-4 py-2 text-sm text-accent-800">
            Edit mode: pick a staff member on any job to reassign it, or click + on a day to add a new task. Changes save immediately.
          </div>
        )}
        {editMode && editError && (
          <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{editError}</div>
        )}

        <div className="mt-6 grid grid-cols-7 overflow-hidden rounded-xl border border-gray-200 bg-white">
          {weekDates.map(date => {
            const dayBookings = weekBookings
              .filter(b => b.scheduled_date === date)
              .sort((a, b) => (a.scheduled_time || '').localeCompare(b.scheduled_time || ''))
            return (
              <div key={date} className="border-r border-gray-200 last:border-r-0">
                <div className={`border-b border-gray-200 py-3 text-center text-xs font-semibold uppercase tracking-wide ${date === today ? 'text-accent-600' : 'text-gray-500'}`}>
                  {new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }).toUpperCase()}
                </div>
                <div className={`min-h-[160px] p-3 ${date === today ? 'bg-accent-100/40' : ''}`}>
                  <p className="text-sm font-bold text-gray-900">{Number(date.slice(8, 10))}</p>
                  <div className="mt-2 space-y-1.5">
                    {dayBookings.map(b => {
                      const assignedStaff = staffRows.find(row => row.id === b.assigned_staff_id)
                      const canReassign = editMode && ['pending', 'approved'].includes(b.status)
                      return (
                        <div key={b.id} className="rounded-md bg-accent-100 px-2 py-1 text-xs text-accent-800">
                          <p className="truncate">
                            {b.scheduled_time ? `${formatTime12h(b.scheduled_time)} ` : ''}{b.service_type}
                          </p>
                          {canReassign ? (
                            <select
                              value={b.assigned_staff_id || ''}
                              disabled={savingBookingId === b.id}
                              onChange={e => handleReassign(b, e.target.value || null)}
                              className="mt-1 w-full rounded border border-accent-200 bg-white px-1 py-0.5 text-[10px] text-gray-700 disabled:opacity-50"
                            >
                              <option value="">Unassigned</option>
                              {staffRows.map(staff => {
                                const offOnDate = isStaffOffOnDate(staff.id, b.scheduled_date, approvedTimeOff)
                                const assignable = staff.canAssign && !offOnDate
                                return (
                                  <option key={staff.id} value={staff.id} disabled={!assignable && staff.id !== b.assigned_staff_id}>
                                    {staff.name}{assignable ? '' : offOnDate ? ' (Off)' : ' (Unavailable)'}
                                  </option>
                                )
                              })}
                            </select>
                          ) : (
                            assignedStaff && <p className="truncate text-[10px] text-accent-600">{assignedStaff.name}</p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                  {editMode && (
                    <button
                      type="button"
                      onClick={() => openAddTask(date)}
                      title="Add a task for this day"
                      className="mt-2 flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-accent-300 py-1 text-[11px] font-medium text-accent-600 hover:bg-accent-100"
                    >
                      <Plus className="w-3 h-3" /> Add
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        <div className="mt-6 bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="p-5 border-b">
            <h2 className="text-base font-bold text-gray-900">Staff on shift this week</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left p-3 border-b font-semibold text-gray-500 text-xs uppercase tracking-wide">Staff</th>
                  {weekDates.map(date => (
                    <th key={date} className="text-left p-3 border-b font-semibold text-gray-500 text-xs uppercase tracking-wide">
                      {new Date(`${date}T00:00:00`).toLocaleDateString([], { weekday: 'short' }).toUpperCase()}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {scheduledStaffRows.map(staff => (
                  <tr key={staff.id} className="border-b">
                    <td className="p-3 font-bold text-gray-900 whitespace-nowrap">{staff.name}</td>
                    {weekDates.map(date => {
                      const onShift = weekBookings.some(b => b.assigned_staff_id === staff.id && b.scheduled_date === date)
                      return (
                        <td key={date} className="p-3">
                          <span className={`inline-block h-2.5 w-2.5 rounded-sm ${onShift ? 'bg-accent' : 'bg-gray-200'}`} />
                        </td>
                      )
                    })}
                  </tr>
                ))}
                {scheduledStaffRows.length === 0 && (
                  <tr><td colSpan={8} className="p-8 text-center text-gray-400">No staff on shift this week.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {taskModalDate && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center">
          <div className="relative w-full max-w-3xl">
            <button
              type="button"
              onClick={closeAddTask}
              aria-label="Close"
              className="absolute -top-3 -right-3 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 shadow-md transition hover:bg-gray-50"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="max-h-[90vh] overflow-y-auto rounded-2xl bg-white">
              <div className="flex gap-1 border-b bg-white px-6 pt-4">
                <button
                  type="button"
                  onClick={() => setAddTaskTab('manual')}
                  className={`rounded-t-lg px-4 py-2 text-sm font-semibold transition ${
                    addTaskTab === 'manual' ? 'border-b-2 border-accent text-accent-600' : 'text-gray-400 hover:text-gray-600'
                  }`}
                >
                  Manual
                </button>
                <button
                  type="button"
                  onClick={() => setAddTaskTab('ai')}
                  className={`flex items-center gap-1 rounded-t-lg px-4 py-2 text-sm font-semibold transition ${
                    addTaskTab === 'ai' ? 'border-b-2 border-accent text-accent-600' : 'text-gray-400 hover:text-gray-600'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" /> AI Agent
                </button>
              </div>
              {addTaskTab === 'manual' ? (
                <TaskCreationForm actorRole="manager" source="manager" backHref="/manager-schedule" initialDate={taskModalDate} />
              ) : (
                <AiTaskPanel
                  hostAdminId={hostAdminId}
                  staffRows={staffRows}
                  approvedTimeOff={approvedTimeOff}
                  serviceTypes={serviceTypes}
                  defaultDate={taskModalDate}
                  getActiveManager={getActiveManager}
                  onCreated={closeAddTask}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
