import Layout from './Layout'
import AttendanceScanner from './AttendanceScanner'
import { useEffect, useMemo, useState } from 'react'
import { Calendar, CalendarClock, CalendarDays, Check, ChevronLeft, ChevronRight, Clock, QrCode, ShieldCheck, User } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { formatDuration } from '../../lib/attendance'
import { useAuthUser } from '../context/AuthUserContext'
import { roleTheme } from '../config/roleTheme'

const daysInMonth = (year, month) => new Date(year, month + 1, 0).getDate()
const firstDayOfMonth = (year, month) => (new Date(year, month, 1).getDay() + 6) % 7
const toIsoDate = (date) => date.toISOString().slice(0, 10)

function getRelativeDayLabel(workDateIso, todayIso) {
  const diffDays = Math.round((new Date(`${todayIso}T00:00:00Z`) - new Date(`${workDateIso}T00:00:00Z`)) / 86400000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays > 1) return `${diffDays} days ago`
  return null
}

function getRecordStatus(record) {
  if (!record) return null
  if (record.clocked_in_at && record.clocked_out_at) return 'completed'
  if (record.clocked_in_at) return 'in_progress'
  return null
}

// Reused across every role's "My Attendance" page (staff-member/manager/department) — the
// clock-in/out flow and history views are identical since attendance_records is keyed by
// profile_id, not by any role-specific table. Only the sidebar/header theme differs per role.
export default function AttendancePage({ role }) {
  const theme = roleTheme[role] || roleTheme.manager
  const { user } = useAuthUser()
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [showScanner, setShowScanner] = useState(false)
  const [scannerMessage, setScannerMessage] = useState('')
  const [viewMode, setViewMode] = useState('list')
  const [calendarDate, setCalendarDate] = useState(new Date())

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

  const recordsByDate = useMemo(() => {
    const map = new Map()
    records.forEach(record => map.set(record.work_date, record))
    return map
  }, [records])

  const calendarWeeks = useMemo(() => {
    const year = calendarDate.getFullYear()
    const month = calendarDate.getMonth()
    const totalDays = daysInMonth(year, month)
    const firstDay = firstDayOfMonth(year, month)
    const weeks = []
    let currentDay = 1 - firstDay

    while (currentDay <= totalDays) {
      const week = []
      for (let i = 0; i < 7; i += 1) {
        const date = new Date(year, month, currentDay)
        week.push(date)
        currentDay += 1
      }
      weeks.push(week)
    }
    return weeks
  }, [calendarDate])

  const changeMonth = (delta) => {
    const next = new Date(calendarDate)
    next.setMonth(calendarDate.getMonth() + delta)
    setCalendarDate(next)
  }

  return (
    <Layout role={role}>
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3">
          <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${theme.icon}`}>
            <User className="h-7 w-7" />
          </span>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">My Attendance</h1>
            <p className="text-gray-500 text-sm">Your last 30 days of office clock-in/out history.</p>
          </div>
        </div>

        <div className="my-6 rounded-xl border bg-white shadow-sm p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full ${theme.icon}`}>
              <CalendarClock className="h-6 w-6" />
            </span>
            <div>
              <p className="text-base font-semibold text-gray-900">
                {today?.clocked_in_at && today?.clocked_out_at
                  ? `Completed — worked ${formatDuration(new Date(today.clocked_out_at) - new Date(today.clocked_in_at))} today.`
                  : today?.clocked_in_at
                    ? `Checked in since ${new Date(today.clocked_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`
                    : "You haven't checked in today."}
              </p>
              <p className="text-sm text-gray-500">
                {today?.clocked_in_at && today?.clocked_out_at
                  ? 'See you tomorrow!'
                  : today?.clocked_in_at
                    ? "Don't forget to clock out."
                    : "Let's get started!"}
              </p>
              {scannerMessage && <p className={`text-xs mt-1 ${theme.text600}`}>{scannerMessage}</p>}
            </div>
          </div>

          {!(today?.clocked_in_at && today?.clocked_out_at) && (
            <div className="flex items-center gap-4 sm:pl-4">
              <div className="hidden h-12 w-px bg-gray-200 sm:block" />
              <div>
                <button
                  onClick={() => { setScannerMessage(''); setShowScanner(true) }}
                  className={`flex w-full items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition ${theme.solid}`}
                >
                  <QrCode className="w-4 h-4" /> {today?.clocked_in_at ? 'Clock Out' : 'Check In'}
                </button>
                <p className="mt-1.5 flex items-center justify-center gap-1 text-xs text-gray-500">
                  <ShieldCheck className={`h-3.5 w-3.5 ${theme.text600}`} />
                  Secure • Quick • Easy
                </p>
              </div>
            </div>
          )}
        </div>

        {showScanner && <AttendanceScanner onClose={() => setShowScanner(false)} onResult={handleScanResult} />}

        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="flex items-center justify-between gap-3 p-5 border-b">
            <h2 className="text-lg font-bold text-gray-900">Recent attendance</h2>
            <button
              type="button"
              onClick={() => setViewMode(mode => (mode === 'list' ? 'calendar' : 'list'))}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium ${theme.link}`}
            >
              <Calendar className="h-4 w-4" />
              {viewMode === 'list' ? 'View calendar' : 'View list'}
            </button>
          </div>

          {viewMode === 'calendar' ? (
            <div className="p-5">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-base font-semibold text-gray-900">
                  {calendarDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => changeMonth(-1)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => changeMonth(1)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-7 gap-2 text-center text-xs font-medium uppercase tracking-wide text-gray-400">
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => <div key={day}>{day}</div>)}
              </div>

              <div className="mt-2 space-y-2">
                {calendarWeeks.map((week, weekIndex) => (
                  <div key={weekIndex} className="grid grid-cols-7 gap-2">
                    {week.map(date => {
                      const iso = toIsoDate(date)
                      const isCurrentMonth = date.getMonth() === calendarDate.getMonth()
                      const isToday = iso === todayIso
                      const status = getRecordStatus(recordsByDate.get(iso))
                      const dotColor = status === 'completed' ? theme.dot : status === 'in_progress' ? 'bg-amber-400' : 'bg-transparent'

                      return (
                        <div
                          key={iso}
                          className={`flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-xl border py-2 ${
                            isCurrentMonth ? 'border-gray-100 bg-white' : 'border-transparent bg-gray-50'
                          } ${isToday ? `ring-2 ${theme.ringToday}` : ''}`}
                        >
                          <span className={`text-sm font-medium ${isToday ? `${theme.text600} font-bold` : isCurrentMonth ? 'text-gray-900' : 'text-gray-300'}`}>
                            {date.getDate()}
                          </span>
                          <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>

              <div className="mt-4 flex items-center justify-center gap-4 text-xs text-gray-500">
                <span className="flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${theme.dot}`} /> Completed</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-400" /> In progress</span>
              </div>
            </div>
          ) : (
            <>
              <div className={`hidden grid-cols-[1.2fr_1.6fr_1fr] gap-4 border-b border-gray-100 px-5 py-3 text-xs font-semibold uppercase tracking-wide md:grid ${theme.headerRow}`}>
                <span>Date</span>
                <span>Time in – time out</span>
                <span className="text-right">Worked</span>
              </div>

              <div className="divide-y divide-gray-50">
                {records.map(record => {
                  const clockedIn = record.clocked_in_at ? new Date(record.clocked_in_at) : null
                  const clockedOut = record.clocked_out_at ? new Date(record.clocked_out_at) : null
                  const relativeLabel = getRelativeDayLabel(record.work_date, todayIso)
                  const status = getRecordStatus(record)

                  return (
                    <div key={record.work_date} className="grid grid-cols-[1.2fr_1.6fr_1fr] items-center gap-4 px-5 py-4">
                      <div className="flex items-center gap-3">
                        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${theme.icon}`}>
                          <CalendarDays className="h-5 w-5" />
                        </span>
                        <div>
                          <p className="text-sm font-semibold text-gray-900">
                            {new Date(`${record.work_date}T00:00:00Z`).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })}
                          </p>
                          {relativeLabel && (
                            <p className={`text-xs ${relativeLabel === 'Today' ? `${theme.text600} font-medium` : 'text-gray-400'}`}>{relativeLabel}</p>
                          )}
                        </div>
                      </div>

                      <div>
                        {!clockedIn ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-sm font-medium text-amber-700">
                            <Clock className="h-3.5 w-3.5" />
                            Not checked in
                          </span>
                        ) : (
                          <>
                            <p className="text-sm font-semibold text-gray-900">
                              {clockedIn.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              {' – '}
                              {clockedOut ? clockedOut.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Still checked in'}
                            </p>
                            <span className={`mt-1 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                              status === 'completed' ? theme.badgeStrong : theme.badgeSoft
                            }`}>
                              {status === 'completed' && <Check className="h-3 w-3" />}
                              {status === 'completed' ? 'Completed' : 'In progress'}
                            </span>
                          </>
                        )}
                      </div>

                      <p className="text-right text-sm font-medium text-gray-700">
                        {clockedIn && clockedOut ? formatDuration(clockedOut - clockedIn) : '—'}
                      </p>
                    </div>
                  )
                })}
                {!loading && records.length === 0 && <div className="p-8 text-center text-gray-400">No attendance records yet.</div>}
                {loading && <div className="p-8 text-center text-gray-400">Loading...</div>}
              </div>

              {!loading && records.length > 0 && (
                <p className={`flex items-center justify-center gap-1.5 border-t border-gray-100 py-3 text-xs ${theme.text600}`}>
                  <Clock className="h-3.5 w-3.5" />
                  Showing latest 30 days
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </Layout>
  )
}
