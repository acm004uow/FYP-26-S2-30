import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { Calendar, CheckCircle2, ChevronLeft, ChevronRight, Clock, RefreshCw, UserCheck, UserRound } from 'lucide-react'
import { supabase } from '../../../../lib/supabaseClient'
import { shiftDate, formatDuration } from '../../../../lib/attendance'

const STAT_THEME = {
  blue: { bg: 'bg-blue-50', icon: 'text-blue-600', value: 'text-gray-900' },
  green: { bg: 'bg-green-50', icon: 'text-green-600', value: 'text-green-600' },
  orange: { bg: 'bg-orange-50', icon: 'text-orange-500', value: 'text-orange-500' },
  red: { bg: 'bg-red-50', icon: 'text-red-600', value: 'text-red-600' },
}

function CompactStat({ icon: Icon, label, value, theme = 'blue' }) {
  const t = STAT_THEME[theme]
  return (
    <div className="flex items-center gap-3">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${t.bg}`}>
        <Icon className={`h-4 w-4 ${t.icon}`} />
      </span>
      <p className="min-w-0 flex-1 truncate text-xs text-gray-500">{label}</p>
      <p className={`shrink-0 text-base font-bold ${t.value}`}>{value}</p>
    </div>
  )
}

export default function AttendancePanel() {
  const [qr, setQr] = useState({ dataUrl: null, checkinUrl: null, loading: true })
  const [qrMessage, setQrMessage] = useState('')
  const [rotatesIn, setRotatesIn] = useState(null)
  const [hostAdminId, setHostAdminId] = useState(null)
  const [people, setPeople] = useState([])
  const [attendanceRows, setAttendanceRows] = useState([])
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10))
  const [showDatePicker, setShowDatePicker] = useState(false)
  const dateInputRef = useRef(null)

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

    const [{ data: profileRows }, { data: attendance }] = await Promise.all([
      supabase.from('profiles').select('id,full_name,role,status').eq('host_admin_id', resolvedHostAdminId).in('role', ['manager', 'staff_member', 'department_staff']),
      supabase.from('attendance_records').select('profile_id,clocked_in_at,clocked_out_at').eq('host_admin_id', resolvedHostAdminId).eq('work_date', dateIso),
    ])

    setPeople((profileRows || []).filter(p => p.status === 'active'))
    setAttendanceRows(attendance || [])
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

  useEffect(() => {
    if (!showDatePicker || !dateInputRef.current) return
    dateInputRef.current.focus()
    try {
      dateInputRef.current.showPicker?.()
    } catch {
      // showPicker is unsupported or blocked in this browser — the visible input still works.
    }
  }, [showDatePicker])

  const goToDay = async (days) => {
    const next = shiftDate(selectedDate, days)
    setSelectedDate(next)
    await loadOverview(next)
  }

  const handleDateInputChange = async (event) => {
    const next = event.target.value
    if (!next) return
    setSelectedDate(next)
    setShowDatePicker(false)
    await loadOverview(next)
  }

  const getAttendance = (profileId) => attendanceRows.find(a => a.profile_id === profileId) || null

  const checkedInCount = people.filter(p => {
    const a = getAttendance(p.id)
    return a?.clocked_in_at && !a?.clocked_out_at
  }).length
  const completedCount = people.filter(p => {
    const a = getAttendance(p.id)
    return a?.clocked_in_at && a?.clocked_out_at
  }).length
  const notCheckedInCount = people.length - checkedInCount - completedCount

  return (
    <div className="flex flex-col lg:flex-row gap-6 pb-16 items-start">
      <div className="w-full lg:w-72 shrink-0 space-y-4">
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <h2 className="text-sm font-semibold flex items-center gap-2 text-gray-900"><UserCheck className="w-4 h-4 text-accent" /> Office QR Check-in</h2>
          <p className="mt-1 text-xs text-gray-500">Display at the office entrance. Staff and managers scan it to clock in, and scan again to clock out.</p>
          <div className="mt-3 flex aspect-square items-center justify-center rounded-xl border bg-gray-50">
            {qr.loading ? <p className="text-xs text-gray-400">Loading...</p> : qr.dataUrl ? <img src={qr.dataUrl} alt="Office attendance QR code" className="h-5/6 w-5/6" /> : <p className="text-xs text-gray-400 px-4 text-center">QR unavailable</p>}
          </div>
          <p className="mt-2 text-xs text-gray-400">Refreshes automatically every minute{rotatesIn !== null ? ` (next in ${rotatesIn}s)` : ''}.</p>
          <button onClick={resetQrSecret} disabled={qr.loading} className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-60">
            <RefreshCw className="w-3.5 h-3.5" /> Reset QR Secret
          </button>
          {qrMessage && <p className="mt-2 text-xs text-accent-600">{qrMessage}</p>}
        </div>

        <div className="bg-white rounded-xl shadow-sm border p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Attendance Today</p>
          <div className="space-y-3">
            <CompactStat icon={UserCheck} label="Checked in now" value={checkedInCount} theme="blue" />
            <CompactStat icon={CheckCircle2} label="Completed today" value={completedCount} theme="green" />
            <CompactStat icon={Clock} label="Not checked in" value={notCheckedInCount} theme="red" />
          </div>
        </div>
      </div>

      <div className="flex-1 w-full bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="p-5 border-b flex items-center gap-2">
          <button onClick={() => goToDay(-1)} className="p-1 rounded hover:bg-gray-100" aria-label="Previous day"><ChevronLeft className="w-4 h-4 text-gray-500" /></button>
          <h2 className="font-semibold text-gray-900">
            {new Date(`${selectedDate}T00:00:00Z`).toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })}
          </h2>
          <button onClick={() => goToDay(1)} className="p-1 rounded hover:bg-gray-100" aria-label="Next day"><ChevronRight className="w-4 h-4 text-gray-500" /></button>
          <div className="relative ml-1">
            <button onClick={() => setShowDatePicker(v => !v)} className="p-1 rounded hover:bg-gray-100" aria-label="Choose a specific date">
              <Calendar className="w-4 h-4 text-gray-500" />
            </button>
            {showDatePicker && (
              <input
                ref={dateInputRef}
                type="date"
                value={selectedDate}
                onChange={handleDateInputChange}
                onBlur={() => setShowDatePicker(false)}
                className="absolute left-0 top-full z-10 mt-1 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-accent-100"
              />
            )}
          </div>
        </div>
        <div className="divide-y divide-gray-50">
          {people.map(person => {
            const a = getAttendance(person.id)
            let label = 'Not checked in'
            let color = 'bg-red-100 text-red-700'
            let dot = 'bg-red-500'
            let detail = ''
            if (a?.clocked_in_at && a?.clocked_out_at) {
              label = 'Completed'
              color = 'bg-green-100 text-green-700'
              dot = 'bg-green-500'
              const checkIn = new Date(a.clocked_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              const checkOut = new Date(a.clocked_out_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              detail = `${checkIn} – ${checkOut} • Worked ${formatDuration(new Date(a.clocked_out_at) - new Date(a.clocked_in_at))}`
            } else if (a?.clocked_in_at) {
              label = 'Checked in'
              color = 'bg-blue-100 text-blue-700'
              dot = 'bg-blue-500'
              detail = `Since ${new Date(a.clocked_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
            }
            const roleTint = person.role === 'manager' ? 'bg-blue-50 text-blue-600' : person.role === 'department_staff' ? 'bg-orange-50 text-orange-600' : 'bg-green-50 text-green-600'
            const roleLabel = person.role === 'manager' ? 'Manager' : person.role === 'department_staff' ? 'Department Staff' : 'Staff Member'
            return (
              <div key={person.id} className="flex items-center justify-between gap-4 px-5 py-4">
                <div className="flex items-center gap-3">
                  <div className="relative shrink-0">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-full ${roleTint}`}>
                      <UserRound className="h-5 w-5" />
                    </div>
                    <span className={`absolute bottom-0 right-0 h-3 w-3 rounded-full ring-2 ring-white ${dot}`} aria-hidden="true" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-800">{person.full_name}</p>
                    <p className="text-xs text-gray-400">{roleLabel}</p>
                  </div>
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
    </div>
  )
}
