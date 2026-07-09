import Layout from '../../../components/Layout'
import AttendanceScanner from '../../../components/AttendanceScanner'
import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, MapPin, QrCode, UserCheck } from 'lucide-react'
import { supabase } from '../../../../lib/supabaseClient'
import { shiftDate, formatDuration } from '../../../../lib/attendance'

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
  const [officeAttendance, setOfficeAttendance] = useState([])
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10))
  const [hostAdminId, setHostAdminId] = useState(null)
  const [myAttendance, setMyAttendance] = useState(null)
  const [showScanner, setShowScanner] = useState(false)
  const [scannerMessage, setScannerMessage] = useState('')
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    (async () => {
      const result = await loadStaff()
      if (result) await loadDay(result.hostAdminId, result.staff, selectedDate)
    })()
    loadMyAttendance()
  }, [])

  const handleScanResult = ({ status, message }) => {
    setShowScanner(false)
    if (status === 'clocked_in') setScannerMessage('Clocked in successfully.')
    else if (status === 'clocked_out') setScannerMessage('Clocked out successfully.')
    else if (status === 'already_completed') setScannerMessage("You've already completed attendance for today.")
    else setScannerMessage(message || 'Check-in failed.')
    loadMyAttendance()
  }

  const loadMyAttendance = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.id) return
    const { data } = await supabase
      .from('attendance_records')
      .select('clocked_in_at,clocked_out_at')
      .eq('profile_id', user.id)
      .eq('work_date', new Date().toISOString().slice(0, 10))
      .maybeSingle()
    setMyAttendance(data || null)
  }

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
      .select('id,staff_name,user_id')
      .eq('host_admin_id', resolvedHostAdminId)
      .eq('manager_id', user?.id)
      .eq('status', 'active')
      .order('staff_name')

    const staffList = (staff || []).map(row => ({ id: row.id, name: row.staff_name, userId: row.user_id }))
    setStaffRows(staffList)
    return { hostAdminId: resolvedHostAdminId, staff: staffList }
  }

  const loadDay = async (hostAdminIdParam, staffList, dateIso) => {
    if (!hostAdminIdParam) return
    const { data } = await supabase
      .from('bookings')
      .select('id,service_type,location,scheduled_date,scheduled_time,estimated_hours,status,assigned_staff_id,checked_in_at,checked_out_at,attendance_status')
      .eq('host_admin_id', hostAdminIdParam)
      .not('assigned_staff_id', 'is', null)
      .not('status', 'in', '(rejected,cancelled)')
      .eq('scheduled_date', dateIso)

    setDayBookings(data || [])

    const staffUserIds = (staffList || []).map(s => s.userId).filter(Boolean)
    if (staffUserIds.length > 0) {
      const { data: attendance } = await supabase
        .from('attendance_records')
        .select('profile_id,clocked_in_at,clocked_out_at')
        .eq('host_admin_id', hostAdminIdParam)
        .eq('work_date', dateIso)
        .in('profile_id', staffUserIds)
      setOfficeAttendance(attendance || [])
    } else {
      setOfficeAttendance([])
    }
  }

  const goToDay = async (days) => {
    const next = shiftDate(selectedDate, days)
    setSelectedDate(next)
    await loadDay(hostAdminId, staffRows, next)
  }

  const checkedInCount = dayBookings.filter(b => b.status === 'in_progress').length
  const completedCount = dayBookings.filter(b => b.status === 'completed').length
  const notCheckedInCount = dayBookings.filter(b => {
    if (!['pending', 'approved'].includes(b.status)) return false
    const scheduled = getScheduledDateTime(b)
    return scheduled && scheduled < now
  }).length
  const workingStaffCount = staffRows.filter(staff => dayBookings.some(b => b.assigned_staff_id === staff.id)).length

  const getOfficeAttendance = (userId) => officeAttendance.find(a => a.profile_id === userId) || null

  return (
    <Layout role="manager">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold flex items-center gap-2"><UserCheck className="w-6 h-6 text-blue-500" /> Staff Attendance &amp; Progress</h1>
        <p className="text-gray-500 mb-6">Track when staff check in and out of jobs, and how their assigned work is progressing.</p>

        <div className="bg-white rounded-xl shadow-sm border p-5 mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="font-semibold text-gray-900">My Attendance</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {myAttendance?.clocked_in_at && myAttendance?.clocked_out_at
                ? `Completed — worked ${formatDuration(new Date(myAttendance.clocked_out_at) - new Date(myAttendance.clocked_in_at))} today.`
                : myAttendance?.clocked_in_at
                  ? `Checked in since ${new Date(myAttendance.clocked_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`
                  : "You haven't checked in today."}
            </p>
            {scannerMessage && <p className="text-xs text-blue-600 mt-1">{scannerMessage}</p>}
          </div>
          {!(myAttendance?.clocked_in_at && myAttendance?.clocked_out_at) && (
            <button
              onClick={() => { setScannerMessage(''); setShowScanner(true) }}
              className="flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-blue-500 to-green-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:shadow-md"
            >
              <QrCode className="w-4 h-4" /> {myAttendance?.clocked_in_at ? 'Clock Out' : 'Clock In'}
            </button>
          )}
        </div>

        {showScanner && <AttendanceScanner onClose={() => setShowScanner(false)} onResult={handleScanResult} />}

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

        <div className="bg-white rounded-xl shadow-sm border overflow-hidden mb-6">
          <div className="p-5 border-b">
            <h2 className="font-semibold text-gray-900">Office Attendance (QR Clock-in)</h2>
            <p className="text-xs text-gray-500 mt-0.5">Clock-in/out for your team on {new Date(`${selectedDate}T00:00:00Z`).toLocaleDateString([], { month: 'short', day: 'numeric', timeZone: 'UTC' })}.</p>
          </div>
          <div className="divide-y divide-gray-50">
            {staffRows.map(staff => {
              const record = getOfficeAttendance(staff.userId)
              let label = 'Not checked in'
              let color = 'bg-gray-100 text-gray-600'
              let detail = ''
              if (record?.clocked_in_at && record?.clocked_out_at) {
                label = 'Completed'
                color = 'bg-green-100 text-green-700'
                detail = `${new Date(record.clocked_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – ${new Date(record.clocked_out_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • Worked ${formatDuration(new Date(record.clocked_out_at) - new Date(record.clocked_in_at))}`
              } else if (record?.clocked_in_at) {
                label = 'Checked in'
                color = 'bg-blue-100 text-blue-700'
                detail = `Since ${new Date(record.clocked_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
              }
              return (
                <div key={staff.id} className="flex items-center justify-between gap-4 px-5 py-3">
                  <p className="text-sm font-medium text-gray-800">{staff.name}</p>
                  <div className="text-right">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${color}`}>{label}</span>
                    <p className="text-xs text-gray-400 mt-1">{detail}</p>
                  </div>
                </div>
              )
            })}
            {staffRows.length === 0 && <div className="p-8 text-center text-gray-400">No team members assigned to you yet.</div>}
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
