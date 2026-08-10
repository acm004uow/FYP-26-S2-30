import Layout from '../../../components/Layout'
import { useEffect, useMemo, useState } from 'react'
import { Calendar, ChevronLeft, ChevronRight, Clock, MapPin } from 'lucide-react'
import { supabase } from '../../../../lib/supabaseClient'
import { formatDuration } from '../../../../lib/attendance'
import { getPeriodRange } from '../../../../lib/reportPeriods'
import { useAuthUser } from '../../../context/AuthUserContext'

const PERIOD_TYPES = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
]

// Real check-in-to-check-out hours per completed task, same source of truth as the weekly
// worked-hours counter (staff-member/dashboard's complete-task handler) and the owner's payroll
// allowance calculation (admin/reports/ReportsPanel.js) — all three read bookings.checked_in_at/
// checked_out_at directly rather than the pre-assigned estimate.
export default function StaffWorkedHours() {
  const { user } = useAuthUser()
  const [periodType, setPeriodType] = useState('weekly')
  const [periodOffset, setPeriodOffset] = useState(0)
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)

  const period = useMemo(() => getPeriodRange(periodType, periodOffset), [periodType, periodOffset])

  useEffect(() => {
    setPeriodOffset(0)
  }, [periodType])

  useEffect(() => {
    if (!user) return
    let cancelled = false

    async function load() {
      setLoading(true)
      const { data: staffProfile } = await supabase
        .from('staff_profiles')
        .select('id')
        .eq('user_id', user.id)
        .single()

      if (!staffProfile?.id || cancelled) {
        setLoading(false)
        return
      }

      const { data: bookings } = await supabase
        .from('bookings')
        .select('id,service_type,location,scheduled_date,checked_in_at,checked_out_at')
        .eq('assigned_staff_id', staffProfile.id)
        .eq('status', 'completed')
        .not('checked_in_at', 'is', null)
        .not('checked_out_at', 'is', null)
        .gte('checked_in_at', period.start.toISOString())
        .lt('checked_in_at', period.end.toISOString())
        .order('checked_in_at', { ascending: false })

      if (cancelled) return
      setTasks((bookings || []).map(booking => ({
        ...booking,
        hours: Math.max(0, (new Date(booking.checked_out_at) - new Date(booking.checked_in_at)) / 3600000),
      })))
      setLoading(false)
    }

    load()

    return () => { cancelled = true }
  }, [user, period.start, period.end])

  const totalHours = tasks.reduce((sum, task) => sum + task.hours, 0)
  const totalMs = totalHours * 3600000

  const byService = useMemo(() => {
    const map = new Map()
    tasks.forEach(task => {
      const key = task.service_type || 'General'
      map.set(key, (map.get(key) || 0) + task.hours)
    })
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1])
  }, [tasks])

  return (
    <Layout role="staffMember">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
            <Clock className="h-7 w-7" />
          </span>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Worked Hours</h1>
            <p className="text-gray-500 text-sm">Hours actually worked, based on your check-in/check-out for each completed task.</p>
          </div>
        </div>

        <div className="my-6 flex flex-col gap-4 rounded-xl border bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="inline-flex rounded-lg border border-gray-200 p-1">
            {PERIOD_TYPES.map(type => (
              <button
                key={type.value}
                type="button"
                onClick={() => setPeriodType(type.value)}
                className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
                  periodType === type.value ? 'bg-emerald-700 text-white' : 'text-gray-500 hover:bg-gray-50'
                }`}
              >
                {type.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPeriodOffset(offset => offset + 1)}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50"
              aria-label="Previous period"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[10rem] text-center text-sm font-semibold text-gray-900">{period.label}</span>
            <button
              type="button"
              onClick={() => setPeriodOffset(offset => Math.max(0, offset - 1))}
              disabled={periodOffset === 0}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Next period"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border bg-white p-5 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Total worked</p>
            <p className="mt-1 text-3xl font-bold text-emerald-700">{formatDuration(totalMs)}</p>
            <p className="mt-1 text-sm text-gray-500">{tasks.length} completed task{tasks.length === 1 ? '' : 's'}</p>
          </div>

          <div className="rounded-xl border bg-white p-5 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">By service type</p>
            {byService.length === 0 ? (
              <p className="mt-2 text-sm text-gray-400">No completed tasks in this period.</p>
            ) : (
              <div className="mt-2 space-y-1.5">
                {byService.map(([serviceType, hours]) => (
                  <div key={serviceType} className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">{serviceType}</span>
                    <span className="font-semibold text-gray-900">{formatDuration(hours * 3600000)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 overflow-hidden rounded-xl border bg-white shadow-sm">
          <div className="border-b p-5">
            <h2 className="text-lg font-bold text-gray-900">Completed tasks this {periodType === 'weekly' ? 'week' : 'month'}</h2>
          </div>

          <div className="divide-y divide-gray-50">
            {loading && <div className="p-8 text-center text-gray-400">Loading...</div>}
            {!loading && tasks.length === 0 && (
              <div className="p-8 text-center text-gray-400">No completed tasks in this period.</div>
            )}
            {!loading && tasks.map(task => (
              <div key={task.id} className="flex items-center justify-between gap-4 px-5 py-4">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{task.service_type}</p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs text-gray-500">
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                    <span className="truncate">{task.location}</span>
                  </p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs text-gray-400">
                    <Calendar className="h-3.5 w-3.5 shrink-0" />
                    {new Date(task.checked_in_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    {' – '}
                    {new Date(task.checked_out_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                <p className="shrink-0 text-sm font-semibold text-emerald-700">{formatDuration(task.hours * 3600000)}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Layout>
  )
}
