import Layout from '../../../components/Layout'
import AttendanceScanner from '../../../components/AttendanceScanner'
import { useEffect, useState } from 'react'
import { Calendar, CheckCircle2, Clock, QrCode, UserCheck } from 'lucide-react'
import { supabase } from '../../../../lib/supabaseClient'
import { formatDuration } from '../../../../lib/attendance'

export default function ManagerMyAttendance() {
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [showScanner, setShowScanner] = useState(false)
  const [scannerMessage, setScannerMessage] = useState('')

  const loadRecords = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const { data } = await supabase
      .from('attendance_records')
      .select('work_date,clocked_in_at,clocked_out_at')
      .eq('profile_id', user?.id)
      .gte('work_date', since)
      .order('work_date', { ascending: false })

    setRecords(data || [])
    setLoading(false)
  }

  useEffect(() => {
    loadRecords()
  }, [])

  const handleScanResult = ({ status, message }) => {
    setShowScanner(false)
    if (status === 'clocked_in') setScannerMessage('Clocked in successfully.')
    else if (status === 'clocked_out') setScannerMessage('Clocked out successfully.')
    else if (status === 'already_completed') setScannerMessage("You've already completed attendance for today.")
    else setScannerMessage(message || 'Check-in failed.')
    loadRecords()
  }

  const todayIso = new Date().toISOString().slice(0, 10)
  const today = records.find(r => r.work_date === todayIso) || null
  const isCompletedToday = Boolean(today?.clocked_in_at && today?.clocked_out_at)
  const isCheckedInToday = Boolean(today?.clocked_in_at) && !isCompletedToday

  const daysPresent = records.length
  const totalHoursMs = records.reduce((sum, r) => (
    r.clocked_in_at && r.clocked_out_at ? sum + (new Date(r.clocked_out_at) - new Date(r.clocked_in_at)) : sum
  ), 0)

  const todayTheme = isCompletedToday
    ? { bg: 'bg-green-50', icon: 'text-green-600', Icon: CheckCircle2 }
    : isCheckedInToday
      ? { bg: 'bg-accent-100', icon: 'text-accent-600', Icon: Clock }
      : { bg: 'bg-gray-100', icon: 'text-gray-400', Icon: Clock }

  return (
    <Layout role="manager">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">Manager / My Attendance</p>
        <h1 className="text-2xl font-bold flex items-center gap-2"><UserCheck className="w-6 h-6 text-accent" /> My Attendance</h1>
        <p className="text-gray-500 mb-6">Your last 30 days of office clock-in/out history.</p>

        <div className="mb-4 rounded-xl border bg-white shadow-sm p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${todayTheme.bg}`}>
              <todayTheme.Icon className={`h-5 w-5 ${todayTheme.icon}`} />
            </span>
            <div>
              <p className="text-sm font-semibold text-gray-900">
                {isCompletedToday
                  ? `Completed — worked ${formatDuration(new Date(today.clocked_out_at) - new Date(today.clocked_in_at))} today.`
                  : isCheckedInToday
                    ? `Checked in since ${new Date(today.clocked_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`
                    : "You haven't checked in today."}
              </p>
              {scannerMessage && <p className="text-xs text-accent-600 mt-0.5">{scannerMessage}</p>}
            </div>
          </div>
          {!isCompletedToday && (
            <button
              onClick={() => { setScannerMessage(''); setShowScanner(true) }}
              className="flex items-center justify-center gap-2 rounded-lg bg-accent hover:bg-accent-600 px-4 py-2 text-sm font-semibold text-white transition flex-shrink-0"
            >
              <QrCode className="w-4 h-4" /> {isCheckedInToday ? 'Clock Out' : 'Clock In'}
            </button>
          )}
        </div>

        {showScanner && <AttendanceScanner onClose={() => setShowScanner(false)} onResult={handleScanResult} />}

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="rounded-xl border bg-white shadow-sm p-4 flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-purple-50 text-purple-600">
              <Calendar className="h-5 w-5" />
            </span>
            <div>
              <p className="text-2xl font-bold text-gray-900">{daysPresent}</p>
              <p className="text-xs text-gray-500">Days present (30d)</p>
            </div>
          </div>
          <div className="rounded-xl border bg-white shadow-sm p-4 flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
              <Clock className="h-5 w-5" />
            </span>
            <div>
              <p className="text-2xl font-bold text-gray-900">{formatDuration(totalHoursMs)}</p>
              <p className="text-xs text-gray-500">Total hours (30d)</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="divide-y divide-gray-50">
            {records.map(record => {
              const clockedIn = record.clocked_in_at ? new Date(record.clocked_in_at) : null
              const clockedOut = record.clocked_out_at ? new Date(record.clocked_out_at) : null
              const completed = Boolean(clockedIn && clockedOut)
              return (
                <div key={record.work_date} className="flex items-center justify-between gap-4 px-5 py-4">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Calendar className="h-4 w-4 text-purple-400 shrink-0" />
                    <p className="text-sm font-medium text-gray-800 truncate">
                      {new Date(`${record.work_date}T00:00:00Z`).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="text-right">
                      <p className="text-sm text-gray-700">
                        {clockedIn ? clockedIn.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                        {' – '}
                        {clockedOut ? clockedOut.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : (clockedIn ? 'Still checked in' : '—')}
                      </p>
                      {completed && <p className="text-xs text-gray-400">Worked {formatDuration(clockedOut - clockedIn)}</p>}
                    </div>
                    <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${completed ? 'bg-green-50 text-green-700' : 'bg-accent-100 text-accent-700'}`}>
                      {completed ? 'Completed' : 'Checked in'}
                    </span>
                  </div>
                </div>
              )
            })}
            {!loading && records.length === 0 && <div className="p-8 text-center text-gray-400">No attendance records yet.</div>}
            {loading && <div className="p-8 text-center text-gray-400">Loading...</div>}
          </div>
        </div>
      </div>
    </Layout>
  )
}
