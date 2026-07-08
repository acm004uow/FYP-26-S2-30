import Layout from '../../../components/Layout'
import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, MapPin, UserCheck } from 'lucide-react'
import { supabase } from '../../../../lib/supabaseClient'

// UTC-only date arithmetic — parsing local time then round-tripping through .toISOString()
// silently shifts dates by a day in timezones ahead of UTC (learned the hard way on the
// Weekly Schedule grid). Always parse with a "Z" suffix and use getUTC*/setUTC*.
function shiftDate(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '0m'
  const totalMinutes = Math.round(ms / 60000)
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function getScheduledDateTime(booking) {
  if (!booking.scheduled_date) return null
  return new Date(`${booking.scheduled_date}T${booking.scheduled_time || '00:00'}:00`)
}

function getLateMinutes(booking) {
  if (booking.attendance_status !== 'late') return null

  const scheduled = getScheduledDateTime(booking)
  const checkedIn = booking.checked_in_at ? new Date(booking.checked_in_at) : null

  if (!scheduled || !checkedIn || Number.isNaN(checkedIn.getTime())) return null

  const diffMinutes = Math.round((checkedIn - scheduled) / 60000)
  return diffMinutes > 0 ? diffMinutes : 0
}

function getAttendanceInfo(booking, now) {
  const scheduled = getScheduledDateTime(booking)
  const attendance = ['present', 'late'].includes(booking.attendance_status) ? booking.attendance_status : null
  const lateMinutes = getLateMinutes(booking)

  if (booking.status === 'completed' && booking.checked_out_at) {
    const checkedIn = booking.checked_in_at ? new Date(booking.checked_in_at) : null
    const checkedOut = new Date(booking.checked_out_at)
    const duration = checkedIn ? formatDuration(checkedOut - checkedIn) : null
    const detailSuffix = lateMinutes !== null ? ` • Late by ${lateMinutes}m` : ''
    return { label: 'Completed', color: 'bg-green-100 text-green-700', detail: duration ? `Worked ${duration}${detailSuffix}` : `Completed${detailSuffix}`, attendance, lateMinutes }
  }

  if (booking.status === 'in_progress' && booking.checked_in_at) {
    const checkedIn = new Date(booking.checked_in_at)
    const elapsed = formatDuration(now - checkedIn)
    const detailSuffix = lateMinutes !== null ? ` • Late by ${lateMinutes}m` : ''
    return { label: 'Checked in', color: 'bg-blue-100 text-blue-700', detail: `${elapsed} ago${detailSuffix}`, attendance, lateMinutes }
  }

  if (['pending', 'approved'].includes(booking.status)) {
    if (scheduled && scheduled < now) {
      return { label: 'Not checked in', color: 'bg-red-100 text-red-700', detail: `Overdue since ${scheduled.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`, attendance: null, lateMinutes: null }
    }
    return { label: 'Scheduled', color: 'bg-gray-100 text-gray-600', detail: scheduled ? scheduled.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'No time set', attendance: null, lateMinutes: null }
  }

  return { label: booking.status, color: 'bg-gray-100 text-gray-600', detail: '', attendance: null, lateMinutes: null }
}

export default function ManagerTracking() {
  const [staffRows, setStaffRows] = useState([])
  const [dayBookings, setDayBookings] = useState([])
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10))
  const [hostAdminId, setHostAdminId] = useState(null)
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    (async () => {
      const id = await loadStaff()
      if (id) await loadDay(id, selectedDate)
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
      .select('id,staff_name')
      .eq('host_admin_id', resolvedHostAdminId)
      .eq('status', 'active')
      .order('staff_name')

    setStaffRows((staff || []).map(row => ({ id: row.id, name: row.staff_name })))
    return resolvedHostAdminId
  }

  const loadDay = async (hostAdminIdParam, dateIso) => {
    if (!hostAdminIdParam) return
    const { data } = await supabase
      .from('bookings')
      .select('id,service_type,location,scheduled_date,scheduled_time,estimated_hours,status,assigned_staff_id,checked_in_at,checked_out_at,attendance_status')
      .eq('host_admin_id', hostAdminIdParam)
      .not('assigned_staff_id', 'is', null)
      .not('status', 'in', '(rejected,cancelled)')
      .eq('scheduled_date', dateIso)

    setDayBookings(data || [])
  }

  const goToDay = async (days) => {
    const next = shiftDate(selectedDate, days)
    setSelectedDate(next)
    await loadDay(hostAdminId, next)
  }

  const checkedInCount = dayBookings.filter(b => b.status === 'in_progress').length
  const completedCount = dayBookings.filter(b => b.status === 'completed').length
  const notCheckedInCount = dayBookings.filter(b => {
    if (!['pending', 'approved'].includes(b.status)) return false
    const scheduled = getScheduledDateTime(b)
    return scheduled && scheduled < now
  }).length
  const workingStaffCount = staffRows.filter(staff => dayBookings.some(b => b.assigned_staff_id === staff.id)).length

  return (
    <Layout role="manager">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold flex items-center gap-2"><UserCheck className="w-6 h-6 text-blue-500" /> Staff Attendance &amp; Progress</h1>
        <p className="text-gray-500 mb-6">Track when staff check in and out of jobs, and how their assigned work is progressing.</p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl border p-4">
            <p className="text-2xl font-bold text-gray-900">{workingStaffCount}</p>
            <p className="text-xs text-gray-500 mt-1">Staff working this day</p>
          </div>
          <div className="bg-white rounded-xl border p-4">
            <p className="text-2xl font-bold text-blue-600">{checkedInCount}</p>
            <p className="text-xs text-gray-500 mt-1">Currently checked in</p>
          </div>
          <div className="bg-white rounded-xl border p-4">
            <p className="text-2xl font-bold text-green-600">{completedCount}</p>
            <p className="text-xs text-gray-500 mt-1">Completed</p>
          </div>
          <div className="bg-white rounded-xl border p-4">
            <p className="text-2xl font-bold text-red-600">{notCheckedInCount}</p>
            <p className="text-xs text-gray-500 mt-1">Not checked in (overdue)</p>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="p-5 border-b flex items-center gap-2">
            <button onClick={() => goToDay(-1)} className="p-1 rounded hover:bg-gray-100" aria-label="Previous day"><ChevronLeft className="w-4 h-4 text-gray-500" /></button>
            <h2 className="font-semibold text-gray-900">
              {new Date(`${selectedDate}T00:00:00Z`).toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })}
            </h2>
            <button onClick={() => goToDay(1)} className="p-1 rounded hover:bg-gray-100" aria-label="Next day"><ChevronRight className="w-4 h-4 text-gray-500" /></button>
          </div>
          <div className="divide-y divide-gray-50">
            {staffRows.map(staff => {
              const jobs = dayBookings.filter(b => b.assigned_staff_id === staff.id)
              return (
                <div key={staff.id} className="p-5">
                  <h3 className="font-semibold text-gray-800 mb-3">{staff.name}</h3>
                  {jobs.length === 0 ? (
                    <p className="text-sm text-gray-400">No jobs scheduled this day.</p>
                  ) : (
                    <div className="space-y-3">
                      {jobs.map(job => {
                        const info = getAttendanceInfo(job, now)
                        return (
                          <div key={job.id} className="flex items-center justify-between gap-4 rounded-lg bg-gray-50 px-4 py-3">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-gray-800">{job.service_type}</p>
                              <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5"><MapPin className="w-3 h-3" />{job.location} — {job.scheduled_time || 'No time set'}</p>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <div className="flex items-center justify-end gap-1.5">
                                {info.attendance === 'late' && info.lateMinutes !== null && (
                                  <span className="text-xs px-2 py-1 rounded-full font-medium bg-red-100 text-red-700">
                                    {info.lateMinutes}m Late
                                  </span>
                                )}
                                <span className={`text-xs px-2 py-1 rounded-full font-medium ${info.color}`}>{info.label}</span>
                              </div>
                              <p className="text-xs text-gray-400 mt-1">{info.detail}</p>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
            {staffRows.length === 0 && <div className="p-8 text-center text-gray-400">No active staff found.</div>}
          </div>
        </div>
      </div>
    </Layout>
  )
}
