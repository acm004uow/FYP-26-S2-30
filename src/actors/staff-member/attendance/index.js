import Layout from '../../../components/Layout'
import AttendanceScanner from '../../../components/AttendanceScanner'
import { useEffect, useState } from 'react'
import { QrCode, UserCheck } from 'lucide-react'
import { supabase } from '../../../../lib/supabaseClient'
import { formatDuration } from '../../../../lib/attendance'
import { useAuthUser } from '../../../context/AuthUserContext'

export default function StaffAttendance() {
  const { user } = useAuthUser()
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [showScanner, setShowScanner] = useState(false)
  const [scannerMessage, setScannerMessage] = useState('')

  const loadRecords = async () => {
    if (!user) return
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
  }, [user])

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

  return (
    <Layout role="staffMember">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold flex items-center gap-2"><UserCheck className="w-6 h-6 text-accent" /> My Attendance</h1>
        <p className="text-gray-500 mb-6">Your last 30 days of office clock-in/out history.</p>

        <div className="mb-6 rounded-xl border bg-white shadow-sm p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-gray-800">
              {today?.clocked_in_at && today?.clocked_out_at
                ? `Completed — worked ${formatDuration(new Date(today.clocked_out_at) - new Date(today.clocked_in_at))} today.`
                : today?.clocked_in_at
                  ? `Checked in since ${new Date(today.clocked_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`
                  : "You haven't checked in today."}
            </p>
            {scannerMessage && <p className="text-xs text-accent-600 mt-1">{scannerMessage}</p>}
          </div>
          {!(today?.clocked_in_at && today?.clocked_out_at) && (
            <button
              onClick={() => { setScannerMessage(''); setShowScanner(true) }}
              className="flex items-center justify-center gap-2 rounded-lg bg-accent hover:bg-accent-600 px-4 py-2 text-sm font-semibold text-white transition"
            >
              <QrCode className="w-4 h-4" /> {today?.clocked_in_at ? 'Clock Out' : 'Clock In'}
            </button>
          )}
        </div>

        {showScanner && <AttendanceScanner onClose={() => setShowScanner(false)} onResult={handleScanResult} />}

        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="divide-y divide-gray-50">
            {records.map(record => {
              const clockedIn = record.clocked_in_at ? new Date(record.clocked_in_at) : null
              const clockedOut = record.clocked_out_at ? new Date(record.clocked_out_at) : null
              return (
                <div key={record.work_date} className="flex items-center justify-between gap-4 px-5 py-4">
                  <p className="text-sm font-medium text-gray-800">
                    {new Date(`${record.work_date}T00:00:00Z`).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })}
                  </p>
                  <div className="text-right">
                    <p className="text-sm text-gray-700">
                      {clockedIn ? clockedIn.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                      {' – '}
                      {clockedOut ? clockedOut.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : (clockedIn ? 'Still checked in' : '—')}
                    </p>
                    {clockedIn && clockedOut && <p className="text-xs text-gray-400">Worked {formatDuration(clockedOut - clockedIn)}</p>}
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
