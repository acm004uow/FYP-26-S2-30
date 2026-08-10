import Layout from '../../../components/Layout'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Calendar, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Clock, Download,
  Eye, Filter, ListChecks, MapPin, Search, Sparkles, Timer, TrendingDown, TrendingUp, X,
} from 'lucide-react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, LineChart, Line } from 'recharts'
import { supabase } from '../../../../lib/supabaseClient'
import { formatDuration } from '../../../../lib/attendance'
import { getPeriodRange, getPreviousPeriodRange } from '../../../../lib/reportPeriods'
import { useAuthUser } from '../../../context/AuthUserContext'

const PERIOD_TYPES = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
]

const SERVICE_COLORS = ['#059669', '#f59e0b', '#3b82f6', '#8b5cf6', '#ec4899', '#6b7280']
const PAGE_SIZE = 8

function escapeCsvCell(value) {
  const cell = String(value ?? '')
  return /[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell
}

function toDayKey(iso) {
  return new Date(iso).toISOString().slice(0, 10)
}

function TrendBadge({ direction, text }) {
  if (direction === 'flat') return <p className="mt-2 text-xs font-medium text-gray-400">{text}</p>
  const Icon = direction === 'up' ? TrendingUp : TrendingDown
  const color = direction === 'up' ? 'text-emerald-600' : 'text-red-500'
  return (
    <p className={`mt-2 flex items-center gap-1 text-xs font-medium ${color}`}>
      <Icon className="h-3.5 w-3.5" /> {text}
    </p>
  )
}

// Real check-in-to-check-out hours per completed task, same source of truth as the weekly
// worked-hours counter (staff-member/dashboard's complete-task handler) and the owner's payroll
// allowance calculation (admin/reports/ReportsPanel.js) — all three read bookings.checked_in_at/
// checked_out_at directly rather than the pre-assigned estimate.
export default function StaffWorkedHours() {
  const { user } = useAuthUser()
  const [periodType, setPeriodType] = useState('weekly')
  const [periodOffset, setPeriodOffset] = useState(0)
  const [tasks, setTasks] = useState([])
  const [prevStats, setPrevStats] = useState({ totalHours: 0, taskCount: 0, avgHours: 0 })
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [serviceFilter, setServiceFilter] = useState('All')
  const [serviceFilterOpen, setServiceFilterOpen] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [detailTask, setDetailTask] = useState(null)
  const serviceFilterRef = useRef(null)

  const period = useMemo(() => getPeriodRange(periodType, periodOffset), [periodType, periodOffset])
  const prevPeriod = useMemo(() => getPreviousPeriodRange(periodType, periodOffset), [periodType, periodOffset])
  const periodNoun = periodType === 'weekly' ? 'week' : 'month'

  useEffect(() => {
    setPeriodOffset(0)
    setCurrentPage(1)
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

      const baseFilters = (query) => query
        .eq('assigned_staff_id', staffProfile.id)
        .eq('status', 'completed')
        .not('checked_in_at', 'is', null)
        .not('checked_out_at', 'is', null)

      const [{ data: current }, { data: previous }] = await Promise.all([
        baseFilters(supabase
          .from('bookings')
          .select('id,service_type,location,description,checked_in_at,checked_out_at,task_proofs(file_url)'))
          .gte('checked_in_at', period.start.toISOString())
          .lt('checked_in_at', period.end.toISOString())
          .order('checked_in_at', { ascending: false }),
        baseFilters(supabase
          .from('bookings')
          .select('checked_in_at,checked_out_at'))
          .gte('checked_in_at', prevPeriod.start.toISOString())
          .lt('checked_in_at', prevPeriod.end.toISOString()),
      ])

      if (cancelled) return

      setTasks((current || []).map(booking => ({
        ...booking,
        hours: Math.max(0, (new Date(booking.checked_out_at) - new Date(booking.checked_in_at)) / 3600000),
      })))

      const prevHours = (previous || []).map(booking =>
        Math.max(0, (new Date(booking.checked_out_at) - new Date(booking.checked_in_at)) / 3600000))
      const prevTotalHours = prevHours.reduce((sum, h) => sum + h, 0)
      setPrevStats({
        totalHours: prevTotalHours,
        taskCount: prevHours.length,
        avgHours: prevHours.length ? prevTotalHours / prevHours.length : 0,
      })

      setLoading(false)
    }

    load()

    return () => { cancelled = true }
  }, [user, period.start, period.end, prevPeriod.start, prevPeriod.end])

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (serviceFilterRef.current && !serviceFilterRef.current.contains(event.target)) setServiceFilterOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    setCurrentPage(1)
  }, [search, serviceFilter, periodOffset])

  const totalHours = useMemo(() => tasks.reduce((sum, task) => sum + task.hours, 0), [tasks])
  const taskCount = tasks.length
  const avgHours = taskCount ? totalHours / taskCount : 0

  const byService = useMemo(() => {
    const map = new Map()
    tasks.forEach(task => {
      const key = task.service_type || 'General'
      map.set(key, (map.get(key) || 0) + task.hours)
    })
    return Array.from(map.entries())
      .map(([name, hours], i) => ({ name, hours, color: SERVICE_COLORS[i % SERVICE_COLORS.length] }))
      .sort((a, b) => b.hours - a.hours)
  }, [tasks])

  const dailySparkline = useMemo(() => {
    const map = new Map()
    tasks.forEach(task => {
      const key = toDayKey(task.checked_in_at)
      map.set(key, (map.get(key) || 0) + task.hours)
    })
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, hours]) => ({ date, hours: Math.round(hours * 100) / 100 }))
  }, [tasks])

  const totalPctChange = prevStats.totalHours > 0
    ? Math.round(((totalHours - prevStats.totalHours) / prevStats.totalHours) * 100)
    : (totalHours > 0 ? 100 : 0)
  const taskCountDiff = taskCount - prevStats.taskCount
  const avgDiffMinutes = Math.round((avgHours - prevStats.avgHours) * 60)
  const prevLabel = prevPeriod.label

  const serviceOptions = ['All', ...byService.map(entry => entry.name)]

  const filteredTasks = useMemo(() => tasks.filter(task => {
    if (serviceFilter !== 'All' && (task.service_type || 'General') !== serviceFilter) return false
    const term = search.trim().toLowerCase()
    if (!term) return true
    return (task.service_type || '').toLowerCase().includes(term) || (task.location || '').toLowerCase().includes(term)
  }), [tasks, search, serviceFilter])

  const totalPages = Math.max(1, Math.ceil(filteredTasks.length / PAGE_SIZE))
  const safePage = Math.min(currentPage, totalPages)
  const pagedTasks = filteredTasks.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  const handleExport = () => {
    const header = ['Date', 'Service', 'Location', 'Check In', 'Check Out', 'Duration (h)']
    const rows = filteredTasks.map(task => [
      new Date(task.checked_in_at).toLocaleDateString(),
      task.service_type || 'General',
      task.location || '',
      new Date(task.checked_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      new Date(task.checked_out_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      (Math.round(task.hours * 100) / 100).toFixed(2),
    ])
    const csv = [header, ...rows].map(row => row.map(escapeCsvCell).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `worked-hours-${periodType}-${period.start.toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const sidebarCard = (
    <div className="mt-3 rounded-2xl bg-[#0B2B24] p-4 text-white">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-400/20 text-emerald-300">
          <Sparkles className="h-4 w-4" />
        </span>
        <p className="text-sm font-bold">{totalPctChange >= 0 ? 'Great job!' : 'Keep going!'}</p>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-emerald-100">
        {taskCount === 0
          ? `No completed tasks yet this ${periodNoun}.`
          : totalPctChange > 0
            ? `You've worked ${totalPctChange}% more hours this ${periodNoun} compared to last ${periodNoun}.`
            : totalPctChange < 0
              ? `You've worked ${Math.abs(totalPctChange)}% fewer hours this ${periodNoun} compared to last ${periodNoun}.`
              : `You're matching last ${periodNoun}'s hours.`}
      </p>
      {dailySparkline.length > 1 && (
        <div className="mt-3 h-12">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={dailySparkline}>
              <Line type="monotone" dataKey="hours" stroke="#6EE7B7" strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )

  return (
    <Layout role="staffMember" sidebarExtra={sidebarCard}>
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
            <Clock className="h-7 w-7" />
          </span>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Worked Hours</h1>
            <p className="text-gray-500 text-sm">Hours actually worked, based on your check-in/check-out for each completed task.</p>
          </div>
        </div>

        <div className="my-6 flex flex-col gap-4 rounded-xl border bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
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
            <button
              type="button"
              onClick={() => setPeriodOffset(0)}
              className="inline-flex min-w-[11rem] items-center justify-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-semibold text-gray-900 hover:bg-gray-50"
            >
              <Calendar className="h-3.5 w-3.5 text-emerald-600" />
              {period.label}
              <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
            </button>
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

          <button
            type="button"
            onClick={handleExport}
            disabled={filteredTasks.length === 0}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-emerald-200 px-3.5 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Download className="h-4 w-4" /> Export
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                <Clock className="h-4 w-4" />
              </span>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Total Worked</p>
            </div>
            <p className="mt-3 text-2xl font-bold text-gray-900">{formatDuration(totalHours * 3600000)}</p>
            <p className="mt-1 text-sm text-gray-500">{taskCount} completed task{taskCount === 1 ? '' : 's'}</p>
            <TrendBadge
              direction={taskCount === 0 && prevStats.taskCount === 0 ? 'flat' : totalPctChange > 0 ? 'up' : totalPctChange < 0 ? 'down' : 'flat'}
              text={taskCount === 0 && prevStats.taskCount === 0 ? `No data for ${prevLabel}` : `${Math.abs(totalPctChange)}% vs ${prevLabel}`}
            />
          </div>

          <div className="rounded-xl border bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600">
                <ListChecks className="h-4 w-4" />
              </span>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Tasks Completed</p>
            </div>
            <p className="mt-3 text-2xl font-bold text-gray-900">{taskCount}</p>
            <p className="mt-1 text-sm text-gray-500">This {periodNoun}</p>
            <TrendBadge
              direction={taskCountDiff > 0 ? 'up' : taskCountDiff < 0 ? 'down' : 'flat'}
              text={`${Math.abs(taskCountDiff)} vs ${prevLabel}`}
            />
          </div>

          <div className="rounded-xl border bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-purple-100 text-purple-600">
                <Timer className="h-4 w-4" />
              </span>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Avg. per Task</p>
            </div>
            <p className="mt-3 text-2xl font-bold text-gray-900">{taskCount ? formatDuration(avgHours * 3600000) : '—'}</p>
            <p className="mt-1 text-sm text-gray-500">Per completed task</p>
            <TrendBadge
              direction={taskCount === 0 && prevStats.taskCount === 0 ? 'flat' : avgDiffMinutes > 0 ? 'up' : avgDiffMinutes < 0 ? 'down' : 'flat'}
              text={taskCount === 0 && prevStats.taskCount === 0 ? `No data for ${prevLabel}` : `${Math.abs(avgDiffMinutes)}m vs ${prevLabel}`}
            />
          </div>

          <div className="rounded-xl border bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">By Service Type</p>
            {byService.length === 0 ? (
              <p className="mt-6 text-center text-sm text-gray-400">No completed tasks in this period.</p>
            ) : (
              <div className="mt-1 flex items-center gap-3">
                <div className="relative h-20 w-20 shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={byService} cx="50%" cy="50%" innerRadius={26} outerRadius={38} paddingAngle={1} dataKey="hours" stroke="none">
                        {byService.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                      </Pie>
                      <Tooltip formatter={(value) => formatDuration(value * 3600000)} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-[11px] font-bold text-gray-900">{formatDuration(totalHours * 3600000)}</span>
                    <span className="text-[9px] text-gray-400">Total</span>
                  </div>
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  {byService.map(entry => (
                    <div key={entry.name} className="flex items-center justify-between gap-2 text-xs">
                      <span className="flex min-w-0 items-center gap-1.5 truncate text-gray-600">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: entry.color }} />
                        <span className="truncate">{entry.name}</span>
                      </span>
                      <span className="shrink-0 font-semibold text-gray-900">
                        {formatDuration(entry.hours * 3600000)} ({Math.round((entry.hours / totalHours) * 100)}%)
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 overflow-hidden rounded-xl border bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b p-5">
            <h2 className="text-lg font-bold text-gray-900">Completed tasks this {periodNoun}</h2>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search task, location..."
                  className="w-56 rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div className="relative" ref={serviceFilterRef}>
                <button
                  type="button"
                  onClick={() => setServiceFilterOpen(open => !open)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3.5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  <Filter className="h-3.5 w-3.5" />
                  {serviceFilter === 'All' ? 'Filter' : serviceFilter}
                </button>
                {serviceFilterOpen && (
                  <div className="absolute right-0 z-10 mt-1 w-48 rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
                    {serviceOptions.map(option => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => { setServiceFilter(option); setServiceFilterOpen(false) }}
                        className={`w-full rounded-md px-3 py-2 text-left text-sm hover:bg-emerald-50 ${serviceFilter === option ? 'font-semibold text-emerald-700' : 'text-gray-700'}`}
                      >
                        {option === 'All' ? 'All Services' : option}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3">Task &amp; Location</th>
                  <th className="px-5 py-3">Check In</th>
                  <th className="px-5 py-3">Check Out</th>
                  <th className="px-5 py-3">Duration</th>
                  <th className="px-5 py-3 w-12" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {pagedTasks.map(task => (
                  <tr key={task.id} className="hover:bg-gray-50/60">
                    <td className="px-5 py-4">
                      <div className="inline-flex flex-col items-center rounded-lg bg-emerald-50 px-2.5 py-1.5 text-emerald-700">
                        <span className="text-[10px] font-semibold uppercase">{new Date(task.checked_in_at).toLocaleDateString([], { month: 'short' })}</span>
                        <span className="text-base font-bold leading-tight">{new Date(task.checked_in_at).getDate()}</span>
                        <span className="text-[10px] uppercase text-emerald-500">{new Date(task.checked_in_at).toLocaleDateString([], { weekday: 'short' })}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-semibold text-gray-900">{task.service_type || 'General'}</p>
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-500">
                        <MapPin className="h-3 w-3 shrink-0 text-emerald-600" />
                        <span className="truncate">{task.location}</span>
                      </p>
                    </td>
                    <td className="px-5 py-4 text-gray-600">
                      {new Date(task.checked_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-5 py-4 text-gray-600">
                      {new Date(task.checked_out_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-5 py-4 font-semibold text-emerald-700">
                      {formatDuration(task.hours * 3600000)}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <button
                        type="button"
                        onClick={() => setDetailTask(task)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
                        aria-label="View task detail"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {loading && <div className="p-10 text-center text-gray-400">Loading...</div>}
            {!loading && filteredTasks.length === 0 && (
              <div className="p-10 text-center text-gray-400">
                {tasks.length === 0 ? `No completed tasks in this ${periodNoun}.` : 'No tasks match this search or filter.'}
              </div>
            )}
          </div>

          {!loading && filteredTasks.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 px-5 py-3">
              <p className="flex items-center gap-1.5 text-sm text-gray-500">
                <Calendar className="h-3.5 w-3.5" />
                Showing {pagedTasks.length} of {filteredTasks.length} completed task{filteredTasks.length === 1 ? '' : 's'}
              </p>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setCurrentPage(page => Math.max(1, page - 1))}
                  disabled={safePage === 1}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                {Array.from({ length: totalPages }, (_, index) => index + 1).map(pageNumber => (
                  <button
                    key={pageNumber}
                    type="button"
                    onClick={() => setCurrentPage(pageNumber)}
                    className={`flex h-8 w-8 items-center justify-center rounded-lg border text-sm font-medium ${
                      pageNumber === safePage ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
                    }`}
                  >
                    {pageNumber}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setCurrentPage(page => Math.min(totalPages, page + 1))}
                  disabled={safePage === totalPages}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {detailTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-emerald-700">
                <CheckCircle2 className="h-5 w-5" />
                <h3 className="text-base font-bold text-gray-900">{detailTask.service_type || 'General'}</h3>
              </div>
              <button type="button" onClick={() => setDetailTask(null)} aria-label="Close" className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="mt-2 flex items-start gap-1.5 text-sm text-gray-600">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              {detailTask.location}
            </p>

            {detailTask.description && (
              <p className="mt-3 rounded-lg bg-gray-50 p-3 text-sm text-gray-600">{detailTask.description}</p>
            )}

            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-gray-400">Checked in</p>
                <p className="font-medium text-gray-800">{new Date(detailTask.checked_in_at).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Checked out</p>
                <p className="font-medium text-gray-800">{new Date(detailTask.checked_out_at).toLocaleString()}</p>
              </div>
            </div>

            <p className="mt-3 text-sm">
              <span className="text-gray-400">Duration:</span>{' '}
              <span className="font-semibold text-emerald-700">{formatDuration(detailTask.hours * 3600000)}</span>
            </p>

            {detailTask.task_proofs?.[0]?.file_url && (
              <a
                href={detailTask.task_proofs[0].file_url}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-block text-xs font-medium text-emerald-600 hover:underline"
              >
                View submitted proof
              </a>
            )}
          </div>
        </div>
      )}
    </Layout>
  )
}
