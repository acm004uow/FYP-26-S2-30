import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { ChevronLeft, ChevronRight, Clock, RefreshCw, UserCheck, Users } from 'lucide-react'
import { supabase } from '../../../../lib/supabaseClient'
import { shiftDate, formatDuration } from '../../../../lib/attendance'

function StatCard({ icon: Icon, label, value, color }) {
  return (
    <div className="bg-white rounded-xl border p-4">
      <div className="flex items-center gap-2 text-gray-400 mb-1"><Icon className="w-4 h-4" /><span className="text-xs">{label}</span></div>
      <p className={`text-2xl font-bold ${color || 'text-gray-900'}`}>{value}</p>
    </div>
  )
}

export default function AttendancePanel() {
  const [qr, setQr] = useState({ dataUrl: null, checkinUrl: null, loading: true })
  const [qrMessage, setQrMessage] = useState('')
  const [rotatesIn, setRotatesIn] = useState(null)
  const [hostAdminId, setHostAdminId] = useState(null)
  const [people, setPeople] = useState([])
  const [staffProfiles, setStaffProfiles] = useState([])
  const [attendanceRows, setAttendanceRows] = useState([])
  const [bookings, setBookings] = useState([])
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10))

  const authHeader = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}
  }

  const renderQr = async (checkinUrl) => {
    if (!checkinUrl) return null
    return QRCode.toDataURL(checkinUrl, { width: 220, margin: 1 })
  }

  const loadQr = async (isFirstLoad = false) => {
    if (isFirstLoad) setQr(prev => ({ ...prev, loading: true }))
    const headers = await authHeader()
    const response = await fetch('/api/attendance/qr-token', { headers })
    const result = await response.json()
    if (!response.ok) {
      setQrMessage(result.error || 'Could not load the office QR code.')
      setQr({ dataUrl: null, checkinUrl: null, loading: false })
      return
    }
    const dataUrl = await renderQr(result.checkin_url)
    setQr({ dataUrl, checkinUrl: result.checkin_url, loading: false })
    setRotatesIn(result.rotates_in_seconds ?? null)
  }

  const resetQrSecret = async () => {
    if (!window.confirm('This immediately invalidates the current QR code for everyone. Continue?')) return
    setQr(prev => ({ ...prev, loading: true }))
    const headers = await authHeader()
    const response = await fetch('/api/attendance/qr-token', { method: 'POST', headers })
    const result = await response.json()
    if (!response.ok) {
      setQrMessage(result.error || 'Could not reset the office QR secret.')
      setQr(prev => ({ ...prev, loading: false }))
      return
    }
    const dataUrl = await renderQr(result.checkin_url)
    setQr({ dataUrl, checkinUrl: result.checkin_url, loading: false })
    setRotatesIn(result.rotates_in_seconds ?? null)
    setQrMessage('The QR secret has been reset. The previous code no longer works.')
  }

  const loadOverview = async (dateIso) => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: ownProfile } = await supabase
      .from('profiles')
      .select('host_admin_id')
      .eq('id', user?.id)
      .single()

    const resolvedHostAdminId = ownProfile?.host_admin_id || user?.id || null
    setHostAdminId(resolvedHostAdminId)
    if (!resolvedHostAdminId) return

    const [{ data: profileRows }, { data: staffRows }, { data: attendance }, { data: bookingRows }] = await Promise.all([
      supabase.from('profiles').select('id,full_name,role,status').eq('host_admin_id', resolvedHostAdminId).in('role', ['manager', 'staff_member']),
      supabase.from('staff_profiles').select('id,user_id,staff_name,assigned_region,performance_rating,manager_id').eq('host_admin_id', resolvedHostAdminId),
      supabase.from('attendance_records').select('profile_id,clocked_in_at,clocked_out_at').eq('host_admin_id', resolvedHostAdminId).eq('work_date', dateIso),
      supabase.from('bookings').select('id,status,scheduled_date,scheduled_time,assigned_staff_id').eq('host_admin_id', resolvedHostAdminId).not('status', 'in', '(rejected,cancelled)'),
    ])

    setPeople((profileRows || []).filter(p => p.status === 'active'))
    setStaffProfiles(staffRows || [])
    setAttendanceRows(attendance || [])
    setBookings(bookingRows || [])
  }

  useEffect(() => {
    loadQr(true)
    loadOverview(selectedDate)
    const refreshTimer = setInterval(() => loadQr(false), 60000)
    return () => clearInterval(refreshTimer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (rotatesIn === null) return
    const countdown = setInterval(() => {
      setRotatesIn(prev => (prev === null ? null : prev <= 1 ? 60 : prev - 1))
    }, 1000)
    return () => clearInterval(countdown)
  }, [rotatesIn === null])

  const goToDay = async (days) => {
    const next = shiftDate(selectedDate, days)
    setSelectedDate(next)
    await loadOverview(next)
  }

  const getAttendance = (profileId) => attendanceRows.find(a => a.profile_id === profileId) || null

  const now = new Date()
  const checkedInCount = people.filter(p => {
    const a = getAttendance(p.id)
    return a?.clocked_in_at && !a?.clocked_out_at
  }).length
  const completedCount = people.filter(p => {
    const a = getAttendance(p.id)
    return a?.clocked_in_at && a?.clocked_out_at
  }).length
  const notCheckedInCount = people.length - checkedInCount - completedCount

  const completedTasks = bookings.filter(b => b.status === 'completed').length
  const pendingTasks = bookings.filter(b => ['pending', 'approved'].includes(b.status)).length
  const overdueTasks = bookings.filter(b => {
    if (!['pending', 'approved'].includes(b.status)) return false
    if (!b.scheduled_date) return false
    const scheduled = new Date(`${b.scheduled_date}T${b.scheduled_time || '00:00'}:00`)
    return scheduled < now
  }).length

  const regionPerformance = staffProfiles.reduce((acc, sp) => {
    const region = sp.assigned_region || 'Unassigned region'
    if (!acc[region]) acc[region] = { count: 0, ratingSum: 0 }
    acc[region].count += 1
    acc[region].ratingSum += Number(sp.performance_rating || 0)
    return acc
  }, {})

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2"><UserCheck className="w-5 h-5 text-blue-500" /> Office QR Check-in</h2>
            <p className="mt-1 text-xs text-gray-500 max-w-md">Display this QR code at the office entrance. Staff and managers scan it in-app to clock in, and scan it again to clock out.</p>
            <p className="mt-1 text-xs text-gray-400">Refreshes automatically every minute — no action needed{rotatesIn !== null ? ` (next in ${rotatesIn}s)` : ''}.</p>
            <button onClick={resetQrSecret} disabled={qr.loading} className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-60">
              <RefreshCw className="w-3.5 h-3.5" /> Reset QR Secret
            </button>
            {qrMessage && <p className="mt-2 text-xs text-blue-600">{qrMessage}</p>}
          </div>
          <div className="flex h-56 w-56 shrink-0 items-center justify-center rounded-xl border bg-gray-50">
            {qr.loading ? <p className="text-xs text-gray-400">Loading...</p> : qr.dataUrl ? <img src={qr.dataUrl} alt="Office attendance QR code" className="h-52 w-52" /> : <p className="text-xs text-gray-400 px-4 text-center">QR unavailable</p>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <StatCard icon={UserCheck} label="Checked in now" value={checkedInCount} color="text-blue-600" />
        <StatCard icon={Users} label="Completed today" value={completedCount} color="text-green-600" />
        <StatCard icon={Clock} label="Not checked in" value={notCheckedInCount} color="text-red-600" />
        <StatCard icon={Users} label="Completed tasks" value={completedTasks} color="text-green-600" />
        <StatCard icon={Clock} label="Pending tasks" value={pendingTasks} color="text-orange-500" />
        <StatCard icon={Clock} label="Overdue tasks" value={overdueTasks} color="text-red-600" />
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
          {people.map(person => {
            const a = getAttendance(person.id)
            let label = 'Not checked in'
            let color = 'bg-gray-100 text-gray-600'
            let detail = ''
            if (a?.clocked_in_at && a?.clocked_out_at) {
              label = 'Completed'
              color = 'bg-green-100 text-green-700'
              const checkIn = new Date(a.clocked_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              const checkOut = new Date(a.clocked_out_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              detail = `${checkIn} – ${checkOut} • Worked ${formatDuration(new Date(a.clocked_out_at) - new Date(a.clocked_in_at))}`
            } else if (a?.clocked_in_at) {
              label = 'Checked in'
              color = 'bg-blue-100 text-blue-700'
              detail = `Since ${new Date(a.clocked_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
            }
            return (
              <div key={person.id} className="flex items-center justify-between gap-4 px-5 py-3">
                <div>
                  <p className="text-sm font-medium text-gray-800">{person.full_name}</p>
                  <p className="text-xs text-gray-400">{person.role === 'manager' ? 'Manager' : 'Staff Member'}</p>
                </div>
                <div className="text-right">
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${color}`}>{label}</span>
                  <p className="text-xs text-gray-400 mt-1">{detail}</p>
                </div>
              </div>
            )
          })}
          {people.length === 0 && <div className="p-8 text-center text-gray-400">No active managers or staff found.</div>}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border p-6">
        <h2 className="font-semibold text-gray-900 mb-4">Team / Branch Performance</h2>
        <div className="space-y-3">
          {Object.entries(regionPerformance).map(([region, stats]) => (
            <div key={region} className="flex items-center justify-between text-sm">
              <span className="text-gray-600">{region}</span>
              <span className="text-gray-900 font-medium">{stats.count} staff • Avg rating {(stats.ratingSum / stats.count).toFixed(1)} / 5</span>
            </div>
          ))}
          {Object.keys(regionPerformance).length === 0 && <p className="text-sm text-gray-400">No staff data yet.</p>}
        </div>
      </div>
    </div>
  )
}
