import Layout from '../../../components/Layout'
import { useEffect, useRef, useState } from 'react'
import { Calendar, ChevronLeft, ChevronRight, Lock, MoreVertical, Printer } from 'lucide-react'
import { supabase } from '../../../../lib/supabaseClient'
import { useAuthUser } from '../../../context/AuthUserContext'

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

export default function ManagerSchedule() {
  const { user } = useAuthUser()
  const [staffRows, setStaffRows] = useState([])
  const [hostAdminId, setHostAdminId] = useState(null)
  const [weekAnchor, setWeekAnchor] = useState(new Date().toISOString().slice(0, 10))
  const [weekBookings, setWeekBookings] = useState([])
  const [pastSnapshot, setPastSnapshot] = useState(null)
  const [finalizing, setFinalizing] = useState(false)
  const [moreMenuOpen, setMoreMenuOpen] = useState(false)
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
      .select('id,user_id,staff_name')
      .eq('host_admin_id', resolvedHostAdminId)
      .eq('status', 'active')
      .order('staff_name')

    setStaffRows((staff || []).map(row => ({ id: row.id, userId: row.user_id, name: row.staff_name })))
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
                    {dayBookings.map(b => (
                      <div key={b.id} className="truncate rounded-md bg-accent-100 px-2 py-1 text-xs text-accent-800">
                        {b.scheduled_time ? `${formatTime12h(b.scheduled_time)} ` : ''}{b.service_type}
                      </div>
                    ))}
                  </div>
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
    </Layout>
  )
}
