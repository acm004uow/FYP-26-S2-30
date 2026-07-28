import Layout from '../../../components/Layout'
import AddressFields from '../../../components/AddressFields'
import TimeInput from '../../../components/TimeInput'
import { useEffect, useRef, useState } from 'react'
import { Calendar, ChevronDown, ChevronLeft, ChevronRight, Filter, Lock, MapPin, Plus, Printer, Search, Users, X } from 'lucide-react'
import { supabase } from '../../../../lib/supabaseClient'
import { createManualBooking, updateBookingAssignment } from '../../../../lib/assignBooking'
import { fetchApprovedTimeOffClient, isStaffOffOnDate } from '../../../../lib/staffTimeOff'

const STATUS_META = {
  unavailable: { label: 'Unavailable', badge: 'bg-amber-100 text-amber-700' },
  time_off: { label: 'Time Off', badge: 'bg-green-100 text-green-700' },
}

const STATUS_FILTERS = [
  { value: 'all', label: 'All staff' },
  { value: 'available', label: 'Available' },
  { value: 'unavailable', label: 'Unavailable' },
  { value: 'time_off', label: 'Time off' },
]

// Deterministic per-name color so the same staff member always gets the same avatar color.
const AVATAR_PALETTE = [
  'bg-purple-100 text-purple-700',
  'bg-green-100 text-green-700',
  'bg-teal-100 text-teal-700',
  'bg-orange-100 text-orange-700',
  'bg-indigo-100 text-indigo-700',
  'bg-pink-100 text-pink-700',
  'bg-blue-100 text-blue-700',
]

function avatarColor(name) {
  let hash = 0
  for (let i = 0; i < (name || '').length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length]
}

function initials(name) {
  return (name || '').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?'
}

function shortRef(id) {
  return `#${String(id || '').replace(/-/g, '').slice(0, 6).toUpperCase()}`
}

const SERVICE_TYPES = ['Home Cleaning', 'Office Cleaning', 'Deep Cleaning', 'Move-Out Cleaning', 'Carpet Cleaning']

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

export default function ManagerSchedule() {
  const [staffRows, setStaffRows] = useState([])
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
  const [scheduleStaffId, setScheduleStaffId] = useState('')
  const [scheduleMode, setScheduleMode] = useState('existing')
  const [scheduleBookingId, setScheduleBookingId] = useState('')
  const [scheduleDate, setScheduleDate] = useState('')
  const [scheduleTime, setScheduleTime] = useState('')
  const [newTaskServiceType, setNewTaskServiceType] = useState(SERVICE_TYPES[0])
  const [newTaskLocation, setNewTaskLocation] = useState('')
  const [newTaskCoordinates, setNewTaskCoordinates] = useState(null)
  const [newTaskDescription, setNewTaskDescription] = useState('')
  const [newTaskHours, setNewTaskHours] = useState(2)
  const [scheduleSaving, setScheduleSaving] = useState(false)
  const [scheduleError, setScheduleError] = useState('')
  const [approvedTimeOff, setApprovedTimeOff] = useState([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const jumpDateRef = useRef(null)

  const loadApprovedTimeOff = async (hostAdminIdParam) => {
    if (!hostAdminIdParam) {
      setApprovedTimeOff([])
      return
    }
    const rows = await fetchApprovedTimeOffClient(supabase, hostAdminIdParam)
    setApprovedTimeOff(rows)
  }

  useEffect(() => {
    (async () => {
      const id = await loadStaff()
      if (id) {
        await loadWeeklyGrid(id, weekAnchor)
        await loadUnassignedBookings(id)
        await loadApprovedTimeOff(id)
      }
    })()
  }, [])

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

  const jumpToDate = async (dateIso) => {
    if (!dateIso) return
    setWeekAnchor(dateIso)
    await loadWeeklyGrid(hostAdminId, dateIso)
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

  // staff = null opens the modal from the unassigned pool row, where the manager
  // still has to pick who the task goes to (see the "Assign to" select in the modal).
  const openScheduleModal = (staff, date) => {
    setSchedulingSlot({ staffId: staff?.id || null, staffName: staff?.name || null })
    setScheduleStaffId(staff?.id || '')
    setScheduleMode('existing')
    setScheduleBookingId('')
    setScheduleDate(date)
    setScheduleTime('')
    setNewTaskServiceType(SERVICE_TYPES[0])
    setNewTaskLocation('')
    setNewTaskCoordinates(null)
    setNewTaskDescription('')
    setNewTaskHours(2)
    setScheduleError('')
  }

  const closeScheduleModal = () => {
    setSchedulingSlot(null)
    setScheduleError('')
  }

  const saveManualSchedule = async () => {
    if (!schedulingSlot || !scheduleDate || !scheduleStaffId) return
    if (scheduleMode === 'existing' && !scheduleBookingId) return
    if (scheduleMode === 'new' && !newTaskLocation.trim()) return
    setScheduleSaving(true)
    setScheduleError('')

    const manager = await getActiveManager()
    if (!manager) {
      setScheduleError('Only an active manager can schedule bookings.')
      setScheduleSaving(false)
      return
    }

    const staff = staffRows.find(item => item.id === scheduleStaffId)

    if (staff && isStaffOffOnDate(staff.id, scheduleDate, approvedTimeOff)) {
      setScheduleError(`${staff.name} has approved time off on ${scheduleDate} and cannot be assigned.`)
      setScheduleSaving(false)
      return
    }

    const result = scheduleMode === 'new'
      ? await createManualBooking({
        hostAdminId,
        serviceType: newTaskServiceType,
        location: newTaskLocation.trim(),
        latitude: newTaskCoordinates?.latitude,
        longitude: newTaskCoordinates?.longitude,
        description: newTaskDescription.trim(),
        estimatedHours: Number(newTaskHours) || 2,
        scheduledDate: scheduleDate,
        scheduledTime: scheduleTime,
        staff,
        managerUserId: manager.id,
      })
      : await updateBookingAssignment({
        booking: { id: scheduleBookingId, status: unassignedBookings.find(item => item.id === scheduleBookingId)?.status || 'pending' },
        staff,
        scheduledDate: scheduleDate,
        scheduledTime: scheduleTime,
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

    closeEditModal()
    await loadStaff()
    await loadWeeklyGrid(hostAdminId, weekAnchor)
    await loadUnassignedBookings(hostAdminId)
  }

  const weekDates = getWeekDates(weekAnchor)
  const today = new Date().toISOString().slice(0, 10)
  const scheduledStaffRows = pastSnapshot
    ? pastSnapshot.snapshot.staff
    : staffRows.filter(staff => weekBookings.some(b => b.assigned_staff_id === staff.id))
  // The live grid shows every active staff member (not just those with jobs already)
  // so a manager can manually schedule an unexpected task onto anyone's empty day.
  // Finalized past weeks keep showing only the staff captured in that week's snapshot.
  const gridStaffRows = (pastSnapshot ? scheduledStaffRows : staffRows).filter(staff => {
    if (search.trim() && !staff.name.toLowerCase().includes(search.trim().toLowerCase())) return false
    if (statusFilter === 'all') return true
    if (statusFilter === 'available') return staff.availabilityStatus === 'available'
    return staff.availabilityStatus === statusFilter
  })
  const weekUnassignedBookings = pastSnapshot ? [] : unassignedBookings.filter(b => weekDates.includes(b.scheduled_date))

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
    await loadWeeklyGrid(hostAdminId, weekAnchor)
  }

  const renderBookingBox = (b, onClick) => (
    <button
      type="button"
      key={b.id}
      onClick={onClick}
      disabled={!onClick}
      className={`block w-full text-left rounded-lg border border-blue-200 bg-blue-50 px-2 py-1.5 transition ${onClick ? 'hover:border-blue-300 hover:bg-blue-100' : 'cursor-default'}`}
    >
      <p className="text-xs font-semibold text-blue-900 whitespace-nowrap">
        {b.scheduled_time}{b.scheduled_time && `–${addHoursToTime(b.scheduled_time, b.estimated_hours)}`}
      </p>
      <p className="text-xs text-blue-700">{b.service_type}</p>
      <p className="text-xs text-blue-400">{shortRef(b.id)}</p>
    </button>
  )

  return (
    <Layout role="manager">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="p-5 border-b flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h2 className="font-semibold text-gray-900 flex items-center gap-2 text-xl"><Calendar className="w-5 h-5 text-accent" /> Weekly Schedule</h2>
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
                className="flex items-center gap-1 px-3 py-2 bg-accent hover:bg-accent-600 text-white rounded-lg text-sm transition disabled:opacity-50"
              >
                <Lock className="w-4 h-4" /> {finalizing ? 'Finalizing...' : pastSnapshot ? 'Finalized' : 'Finalize Schedule'}
              </button>
            </div>
          </div>

          <div className="p-4 border-b flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search staff..."
                  className="pl-9 pr-3 py-2 border rounded-lg text-sm w-48 focus:outline-none focus:ring-2 focus:ring-accent-200"
                />
              </div>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setFiltersOpen(open => !open)}
                  className="flex items-center gap-1.5 px-3 py-2 border rounded-lg text-sm text-gray-700 hover:bg-gray-50"
                >
                  <Filter className="w-4 h-4" /> Filters <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                </button>
                {filtersOpen && (
                  <div className="absolute left-0 mt-1 w-40 bg-white border rounded-lg shadow-lg z-10 overflow-hidden">
                    {STATUS_FILTERS.map(option => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => { setStatusFilter(option.value); setFiltersOpen(false) }}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${statusFilter === option.value ? 'text-accent-600 font-medium' : 'text-gray-700'}`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-4 text-xs text-gray-500">
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-500" /> Booking</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-500" /> Unavailable</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-500" /> Time Off</span>
            </div>

            <div className="flex items-center gap-2">
              <div className="px-3 py-2 border rounded-lg text-sm text-gray-700 flex items-center gap-1">
                Week
              </div>
              <button
                type="button"
                onClick={() => jumpDateRef.current?.showPicker ? jumpDateRef.current.showPicker() : jumpDateRef.current?.click()}
                className="p-2 border rounded-lg text-gray-500 hover:bg-gray-50"
                aria-label="Jump to week"
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
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left p-3 border-b font-semibold text-gray-700 sticky left-0 bg-gray-50">Staff</th>
                  {weekDates.map(date => (
                    <th key={date} className={`text-left p-3 border-b font-semibold whitespace-nowrap ${date === today ? 'bg-accent-100 text-accent-800' : 'text-gray-700'}`}>
                      {new Date(`${date}T00:00:00`).toLocaleDateString([], { weekday: 'short' }).toUpperCase()}
                      <div className={`text-xs font-normal ${date === today ? 'text-accent-500' : 'text-gray-400'}`}>{date.slice(5)}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {gridStaffRows.map(staff => {
                  const staffBookingCount = weekBookings.filter(b => b.assigned_staff_id === staff.id).length
                  const statusMeta = STATUS_META[staff.availabilityStatus]
                  return (
                    <tr key={staff.id} className="border-b hover:bg-gray-50/60 transition">
                      <td className="p-3 sticky left-0 bg-white whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${avatarColor(staff.name)}`}>
                            {initials(staff.name)}
                          </div>
                          <div>
                            <p className="font-medium text-gray-800">
                              {staff.name}
                              {statusMeta && (
                                <span className={`ml-2 text-xs px-2 py-0.5 rounded-full align-middle ${statusMeta.badge}`}>
                                  {statusMeta.label}
                                </span>
                              )}
                            </p>
                            <p className="text-xs text-gray-400">{staffBookingCount} job{staffBookingCount === 1 ? '' : 's'}</p>
                          </div>
                        </div>
                      </td>
                      {weekDates.map(date => {
                        const dayBookings = weekBookings.filter(b => b.assigned_staff_id === staff.id && b.scheduled_date === date)
                        return (
                          <td key={date} className={`p-3 align-top ${date === today ? 'bg-accent-100/40' : ''}`}>
                            {dayBookings.length === 0
                              ? (pastSnapshot
                                ? <span className="text-gray-300">–</span>
                                : (
                                  <button
                                    type="button"
                                    onClick={() => openScheduleModal(staff, date)}
                                    title={`Schedule a task for ${staff.name}`}
                                    className="flex h-6 w-6 items-center justify-center rounded text-gray-300 transition hover:bg-accent-100 hover:text-accent-600"
                                  >
                                    <Plus className="w-3.5 h-3.5" />
                                  </button>
                                ))
                              : (
                                <div className="space-y-1.5">
                                  {dayBookings.map(b => renderBookingBox(b, pastSnapshot ? null : () => openEditModal(b)))}
                                  {!pastSnapshot && (
                                    <button
                                      type="button"
                                      onClick={() => openScheduleModal(staff, date)}
                                      className="flex items-center gap-1 text-xs text-gray-400 hover:text-accent-600"
                                    >
                                      <Plus className="w-3 h-3" /> Add
                                    </button>
                                  )}
                                </div>
                              )}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
                {gridStaffRows.length === 0 && (
                  <tr><td colSpan={8} className="p-8 text-center text-gray-400">No staff match this search or filter.</td></tr>
                )}

                {!pastSnapshot && (
                  <tr className="border-b hover:bg-gray-50/60 transition">
                    <td className="p-3 sticky left-0 bg-white whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500">
                          <Users className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-800">Staff</p>
                          <p className="text-xs text-gray-400">{weekUnassignedBookings.length} job{weekUnassignedBookings.length === 1 ? '' : 's'}</p>
                        </div>
                      </div>
                    </td>
                    {weekDates.map(date => {
                      const dayBookings = weekUnassignedBookings.filter(b => b.scheduled_date === date)
                      return (
                        <td key={date} className="p-3 align-top">
                          <div className="space-y-1.5">
                            {dayBookings.map(b => renderBookingBox(b, () => openEditModal({
                              id: b.id,
                              assigned_staff_id: null,
                              scheduled_date: b.scheduled_date,
                              scheduled_time: b.scheduled_time,
                              status: b.status,
                              service_type: b.service_type,
                              location: b.location,
                            })))}
                            <button
                              type="button"
                              onClick={() => openScheduleModal(null, date)}
                              className="flex items-center gap-1 text-xs text-gray-400 hover:text-accent-600"
                            >
                              <Plus className="w-3 h-3" /> Add
                            </button>
                          </div>
                        </td>
                      )
                    })}
                  </tr>
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

      {schedulingSlot && (
        <div className="fixed inset-0 bg-gray-900/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] flex flex-col">
            <div className="p-5 border-b flex items-center justify-between shrink-0">
              <div>
                <h3 className="font-semibold text-gray-900">Schedule task</h3>
                {schedulingSlot.staffName && <p className="text-sm text-gray-500 mt-1">{schedulingSlot.staffName}</p>}
              </div>
              <button onClick={closeScheduleModal} className="p-1 rounded-lg hover:bg-gray-100" aria-label="Close"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto">
              {!schedulingSlot.staffId && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Assign to staff</label>
                  <select value={scheduleStaffId} onChange={e => setScheduleStaffId(e.target.value)} className="w-full px-4 py-2 border rounded-lg text-sm">
                    <option value="">Select staff...</option>
                    {staffRows.map(staff => {
                      const offOnDate = scheduleDate && isStaffOffOnDate(staff.id, scheduleDate, approvedTimeOff)
                      return (
                        <option key={staff.id} value={staff.id}>{staff.name}{offOnDate ? ' (Off that day)' : !staff.canAssign ? ' (unavailable)' : ''}</option>
                      )
                    })}
                  </select>
                </div>
              )}

              <div className="inline-flex rounded-lg bg-gray-100 p-1">
                <button
                  type="button"
                  onClick={() => setScheduleMode('existing')}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition ${scheduleMode === 'existing' ? 'bg-white text-accent-600 shadow-sm' : 'text-gray-500'}`}
                >
                  Existing booking
                </button>
                <button
                  type="button"
                  onClick={() => setScheduleMode('new')}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition ${scheduleMode === 'new' ? 'bg-white text-accent-600 shadow-sm' : 'text-gray-500'}`}
                >
                  New task
                </button>
              </div>

              {scheduleMode === 'existing' ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Unassigned booking</label>
                  <select
                    value={scheduleBookingId}
                    onChange={e => {
                      const selected = unassignedBookings.find(b => b.id === e.target.value)
                      setScheduleBookingId(e.target.value)
                      if (selected?.scheduled_date) setScheduleDate(selected.scheduled_date)
                      if (selected?.scheduled_time) setScheduleTime(selected.scheduled_time)
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
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Service type</label>
                    <select value={newTaskServiceType} onChange={e => setNewTaskServiceType(e.target.value)} className="w-full px-4 py-2 border rounded-lg text-sm">
                      {SERVICE_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
                    </select>
                  </div>
                  <AddressFields compact onLocationChange={setNewTaskLocation} onCoordinatesChange={setNewTaskCoordinates} />
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Description (optional)</label>
                    <textarea
                      value={newTaskDescription}
                      onChange={e => setNewTaskDescription(e.target.value)}
                      rows={2}
                      className="w-full px-4 py-2 border rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Estimated hours</label>
                    <input
                      type="number"
                      min="0.5"
                      step="0.5"
                      value={newTaskHours}
                      onChange={e => setNewTaskHours(e.target.value)}
                      className="w-full px-4 py-2 border rounded-lg text-sm"
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Date</label>
                  <input type="date" value={scheduleDate} onChange={e => setScheduleDate(e.target.value)} className="w-full px-4 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Time</label>
                  <TimeInput value={scheduleTime} onChange={setScheduleTime} />
                </div>
              </div>
              {scheduleError && <p className="text-sm text-red-500">{scheduleError}</p>}
            </div>
            <div className="p-5 border-t flex gap-3 shrink-0">
              <button
                onClick={saveManualSchedule}
                disabled={scheduleSaving || !scheduleDate || !scheduleStaffId || (scheduleMode === 'existing' ? !scheduleBookingId : !newTaskLocation.trim())}
                className="flex-1 py-2 bg-accent hover:bg-accent-600 text-white rounded-lg text-sm font-semibold transition disabled:opacity-60"
              >
                {scheduleSaving ? 'Saving...' : scheduleMode === 'new' ? 'Create & Assign' : 'Schedule'}
              </button>
              <button onClick={closeScheduleModal} className="flex-1 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
