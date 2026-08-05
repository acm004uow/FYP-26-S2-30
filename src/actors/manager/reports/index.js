import Layout from '../../../components/Layout'
import ReportInsights from '../../../components/ReportInsights'
import { useEffect, useRef, useState } from 'react'
import { BarChart, Bar, XAxis, CartesianGrid, ResponsiveContainer, LabelList, Cell } from 'recharts'
import {
  CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, ClipboardList, Download, Printer, RefreshCw, Star, Users,
} from 'lucide-react'
import { supabase } from '../../../../lib/supabaseClient'
import { shiftDate } from '../../../../lib/attendance'
import { getChartWeekDates, getPeriodRange, getPreviousPeriodRange } from '../../../../lib/reportPeriods'
import { useAuthUser } from '../../../context/AuthUserContext'

const REPORT_TYPES = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
]

const DELTA_SUFFIX = { daily: 'vs yesterday', weekly: 'vs last week', monthly: 'vs last month' }

// Darker/more saturated blue for busier days, so the chart's color reinforces the
// bar heights instead of being purely decorative.
const BAR_SHADES = ['#cfe0fc', '#a6c8f9', '#6fa4f0', '#2564cf']
function barColor(count, max) {
  if (max <= 0) return BAR_SHADES[0]
  const ratio = count / max
  const idx = Math.min(BAR_SHADES.length - 1, Math.floor(ratio * BAR_SHADES.length))
  return BAR_SHADES[idx]
}

const STAT_THEME = {
  blue: { bg: 'bg-accent-100', icon: 'text-accent-600' },
  amber: { bg: 'bg-amber-50', icon: 'text-amber-500' },
  green: { bg: 'bg-green-50', icon: 'text-green-600' },
  purple: { bg: 'bg-purple-50', icon: 'text-purple-600' },
}

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function pctDelta(current, previous) {
  if (previous === null || previous === undefined || current === null || current === undefined) return null
  if (previous === 0) return current > 0 ? 100 : 0
  return Math.round(((current - previous) / previous) * 100)
}

function DeltaBadge({ value, suffix, unit = '%' }) {
  if (value === null || value === undefined) return null
  const positive = value > 0
  const flat = value === 0
  return (
    <p className={`mt-1 text-xs font-medium ${flat ? 'text-gray-400' : positive ? 'text-green-600' : 'text-red-500'}`}>
      {flat ? '±0' : positive ? `+${value}` : value}{unit === '%' ? '%' : unit ? ` ${unit}` : ''} {suffix} {!flat && (positive ? '↑' : '↓')}
    </p>
  )
}

function StatCard({ icon: Icon, label, value, theme, delta, deltaSuffix, deltaUnit }) {
  const t = STAT_THEME[theme]
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
      <span className={`inline-flex h-9 w-9 items-center justify-center rounded-lg ${t.bg} mb-2.5`}>
        <Icon className={`h-5 w-5 ${t.icon}`} />
      </span>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="mt-1 text-sm text-gray-500">{label}</p>
      <DeltaBadge value={delta} suffix={deltaSuffix} unit={deltaUnit} />
    </div>
  )
}

export default function ManagerReports() {
  const { user } = useAuthUser()
  const [reportType, setReportType] = useState('daily')
  const [periodOffset, setPeriodOffset] = useState(0)
  const [periodLabel, setPeriodLabel] = useState('')
  const [data, setData] = useState(null)
  const [completionsPerDay, setCompletionsPerDay] = useState([])
  const [loading, setLoading] = useState(true)
  const [showExport, setShowExport] = useState(false)
  const [insights, setInsights] = useState([])
  const [insightsLoading, setInsightsLoading] = useState(false)
  const [insightsError, setInsightsError] = useState('')
  const exportRef = useRef(null)
  const detailsRef = useRef(null)

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (exportRef.current && !exportRef.current.contains(event.target)) setShowExport(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const loadInsights = async (metrics) => {
    setInsightsLoading(true)
    setInsightsError('')
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData?.session?.access_token
      const res = await fetch('/api/reports/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reportLabel: reportType, scope: 'manager', metrics }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Could not generate insights.')
      setInsights(json.insights || [])
    } catch (err) {
      setInsights([])
      setInsightsError(err.message || 'Insights unavailable right now.')
    } finally {
      setInsightsLoading(false)
    }
  }

  const generate = async () => {
    if (!user) return
    setLoading(true)
    const { data: managerProfile } = await supabase
      .from('profiles')
      .select('host_admin_id')
      .eq('id', user?.id)
      .single()
    const hostAdminId = managerProfile?.host_admin_id

    const period = getPeriodRange(reportType, periodOffset)
    const prevPeriod = getPreviousPeriodRange(reportType, periodOffset)
    setPeriodLabel(period.label)

    const chartWeek = getChartWeekDates(period.start)
    const prevChartWeek = chartWeek.map(date => shiftDate(date, -7))

    const fetchStats = async (rangeStart, rangeEnd) => {
      const [{ data: tasks }, { data: staff }, { data: reviews }] = await Promise.all([
        supabase.from('bookings').select('status,assigned_staff_id,attendance_status').eq('host_admin_id', hostAdminId).gte('created_at', rangeStart.toISOString()).lt('created_at', rangeEnd.toISOString()),
        supabase.from('staff_profiles').select('id').eq('host_admin_id', hostAdminId),
        supabase.from('performance_reviews').select('rating').gte('created_at', rangeStart.toISOString()).lt('created_at', rangeEnd.toISOString()),
      ])
      const taskRows = tasks || []
      const staffRows = staff || []
      const completed = taskRows.filter(task => task.status === 'completed').length
      const avgRating = reviews?.length ? reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / reviews.length : null
      const withAttendance = taskRows.filter(task => task.status === 'completed' && ['present', 'late'].includes(task.attendance_status))
      const onTimeCompletion = withAttendance.length
        ? Math.round((withAttendance.filter(task => task.attendance_status === 'present').length / withAttendance.length) * 100)
        : null
      const staffUtilization = staffRows.length
        ? Math.round((taskRows.filter(task => task.assigned_staff_id).length / staffRows.length) * 100)
        : 0
      return { completed, avgRating, onTimeCompletion, staffUtilization }
    }

    const [current, previous, { data: weekBookings }, { data: prevWeekBookings }] = await Promise.all([
      fetchStats(period.start, period.end),
      fetchStats(prevPeriod.start, prevPeriod.end),
      supabase.from('bookings').select('scheduled_date').eq('host_admin_id', hostAdminId).eq('status', 'completed').gte('scheduled_date', chartWeek[0]).lte('scheduled_date', chartWeek[6]),
      supabase.from('bookings').select('scheduled_date').eq('host_admin_id', hostAdminId).eq('status', 'completed').gte('scheduled_date', prevChartWeek[0]).lte('scheduled_date', prevChartWeek[6]),
    ])

    const countsByDate = (weekBookings || []).reduce((acc, booking) => {
      acc[booking.scheduled_date] = (acc[booking.scheduled_date] || 0) + 1
      return acc
    }, {})
    const perDay = chartWeek.map((date, i) => ({ day: WEEKDAY_LABELS[i], count: countsByDate[date] || 0 }))
    setCompletionsPerDay(perDay)

    const weekTotal = (weekBookings || []).length
    const prevWeekTotal = (prevWeekBookings || []).length

    const reportData = {
      completed: current.completed,
      completedDelta: pctDelta(current.completed, previous.completed),
      avgRating: current.avgRating !== null ? current.avgRating.toFixed(1) : '0.0',
      avgRatingDelta: current.avgRating !== null && previous.avgRating !== null
        ? Number((current.avgRating - previous.avgRating).toFixed(1)) : null,
      onTimeCompletion: current.onTimeCompletion,
      onTimeCompletionDelta: (current.onTimeCompletion !== null && previous.onTimeCompletion !== null)
        ? current.onTimeCompletion - previous.onTimeCompletion : null,
      staffUtilization: current.staffUtilization,
      staffUtilizationDelta: previous.staffUtilization !== undefined
        ? current.staffUtilization - previous.staffUtilization : null,
      weekTotal,
      prevWeekTotal,
      weekDelta: pctDelta(weekTotal, prevWeekTotal),
      generatedAt: new Date().toLocaleString(),
    }
    setData(reportData)
    setLoading(false)

    loadInsights({
      period: period.label,
      tasksCompleted: reportData.completed,
      tasksCompletedChangePct: reportData.completedDelta,
      averageRating: reportData.avgRating,
      averageRatingChange: reportData.avgRatingDelta,
      onTimeCompletionPct: reportData.onTimeCompletion,
      onTimeCompletionChangePts: reportData.onTimeCompletionDelta,
      staffUtilizationPct: reportData.staffUtilization,
      staffUtilizationChangePts: reportData.staffUtilizationDelta,
      completionsThisWeek: weekTotal,
      completionsLastWeek: prevWeekTotal,
    })
  }

  useEffect(() => {
    generate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportType, periodOffset, user])

  useEffect(() => {
    setPeriodOffset(0)
  }, [reportType])

  const getReportRows = () => {
    if (!data) return []
    return [
      ['Report Type', reportType],
      ['Period', periodLabel],
      ['Generated At', data.generatedAt],
      ['Tasks Completed', data.completed],
      ['Average Rating', data.avgRating],
      ['On-time Completion', data.onTimeCompletion !== null ? `${data.onTimeCompletion}%` : 'N/A'],
      ['Staff Utilization', `${data.staffUtilization}%`],
      ...completionsPerDay.map(row => [`Completions — ${row.day}`, row.count]),
    ]
  }

  const escapeCsvCell = (value) => {
    const cell = String(value ?? '')
    return /[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell
  }

  const downloadCsv = () => {
    if (!data) return
    const csv = getReportRows().map(row => row.map(escapeCsvCell).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${reportType}-team-report-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    setShowExport(false)
  }

  const exportPdf = () => {
    if (!data) return
    const escapeHtml = (value) => String(value ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const printWindow = window.open('', '_blank', 'width=800,height=650')
    if (!printWindow) return
    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>${escapeHtml(reportType)} Team Report</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 32px; color: #111827; }
            h1 { margin: 0 0 4px; font-size: 20px; text-transform: capitalize; }
            .meta { color: #6b7280; font-size: 12px; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; font-size: 13px; }
            td { padding: 8px 6px; border-bottom: 1px solid #f3f4f6; }
            td:first-child { color: #6b7280; }
            td:last-child { text-align: right; font-weight: 600; }
          </style>
        </head>
        <body>
          <h1>${escapeHtml(reportType)} Team Report</h1>
          <div class="meta">${escapeHtml(periodLabel)} · Generated ${escapeHtml(data.generatedAt)}</div>
          <table>${getReportRows().map(([label, value]) => `<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(value)}</td></tr>`).join('')}</table>
          <script>window.onload = () => { window.print(); window.onafterprint = () => window.close(); };</script>
        </body>
      </html>
    `)
    printWindow.document.close()
    setShowExport(false)
  }

  const maxCount = Math.max(1, ...completionsPerDay.map(d => d.count))

  return (
    <Layout role="manager">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">Manager / Reports</p>
        <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
          <div>
            <h1 className="text-2xl font-bold">Reports</h1>
            <p className="text-base text-gray-500">Operational performance across the business.</p>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 rounded-lg border bg-white px-1.5 py-1.5">
              <button
                type="button"
                onClick={() => setPeriodOffset(offset => offset + 1)}
                className="rounded-md p-1 text-gray-400 hover:bg-gray-50 hover:text-gray-600"
                aria-label="Previous period"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="px-1 text-sm font-medium text-gray-700 whitespace-nowrap">{periodLabel || '—'}</span>
              <button
                type="button"
                onClick={() => setPeriodOffset(offset => Math.max(0, offset - 1))}
                disabled={periodOffset === 0}
                className="rounded-md p-1 text-gray-400 hover:bg-gray-50 hover:text-gray-600 disabled:opacity-30 disabled:hover:bg-transparent"
                aria-label="Next period"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <div className="relative" ref={exportRef}>
              <button
                type="button"
                onClick={() => setShowExport(v => !v)}
                disabled={!data}
                className="inline-flex items-center gap-1.5 rounded-lg border bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                <Download className="h-4 w-4" /> Export <ChevronDown className="h-4 w-4 text-gray-400" />
              </button>
              {showExport && (
                <div className="absolute right-0 z-20 mt-2 w-44 rounded-lg border bg-white p-1 shadow-lg">
                  <button type="button" onClick={downloadCsv} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium text-gray-700 hover:bg-gray-50">
                    <Download className="h-4 w-4" /> Download CSV
                  </button>
                  <button type="button" onClick={exportPdf} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium text-gray-700 hover:bg-gray-50">
                    <Printer className="h-4 w-4" /> Export PDF
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 mb-5">
          {REPORT_TYPES.map(t => (
            <button
              key={t.value}
              onClick={() => setReportType(t.value)}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${reportType === t.value ? 'bg-accent-100 text-accent-700' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {data ? (
          <div ref={detailsRef} className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
            <div className="lg:col-span-2 space-y-5">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <StatCard icon={ClipboardList} value={data.completed} label="Tasks completed" theme="blue" delta={data.completedDelta} deltaSuffix={DELTA_SUFFIX[reportType]} />
                <StatCard icon={Star} value={`${data.avgRating} / 5.0`} label="Average rating" theme="amber" delta={data.avgRatingDelta} deltaSuffix={DELTA_SUFFIX[reportType]} deltaUnit="" />
                <StatCard icon={CheckCircle2} value={data.onTimeCompletion !== null ? `${data.onTimeCompletion}%` : '—'} label="On-time completion" theme="green" delta={data.onTimeCompletionDelta} deltaSuffix={DELTA_SUFFIX[reportType]} deltaUnit="pts" />
                <StatCard icon={Users} value={`${data.staffUtilization}%`} label="Staff utilization" theme="purple" delta={data.staffUtilizationDelta} deltaSuffix={DELTA_SUFFIX[reportType]} deltaUnit="pts" />
              </div>

              <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-semibold text-gray-900">Completions per day</p>
                </div>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={completionsPerDay} barSize={28} margin={{ top: 20, right: 8, left: 8, bottom: 0 }}>
                    <CartesianGrid stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="day" tick={{ fontSize: 13, fill: '#6b7280' }} axisLine={{ stroke: '#e5e7eb' }} tickLine={false} />
                    <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                      {completionsPerDay.map((entry, index) => (
                        <Cell key={index} fill={barColor(entry.count, maxCount)} />
                      ))}
                      <LabelList dataKey="count" position="top" fill="#374151" fontSize={13} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-gray-50 pt-3 text-sm text-gray-500">
                  <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#2564cf]" /> This week <span className="font-semibold text-gray-700">{data.weekTotal} tasks</span></span>
                  <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#cfe0fc]" /> Last week <span className="font-semibold text-gray-700">{data.prevWeekTotal} tasks</span></span>
                  {data.weekDelta !== null && (
                    <span className={`ml-auto font-semibold ${data.weekDelta >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                      {data.weekDelta >= 0 ? `+${data.weekDelta}` : data.weekDelta}% vs last week {data.weekDelta >= 0 ? '↑' : '↓'}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <ReportInsights insights={insights} loading={insightsLoading} error={insightsError} onViewDetails={() => detailsRef.current?.scrollIntoView({ behavior: 'smooth' })} />
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-gray-200 p-10 text-center text-base text-gray-400">
            {loading ? 'Loading report...' : 'No data available for this period yet.'}
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-100 bg-gray-50 px-4 py-3 text-sm text-gray-500">
          <span>All times are shown in Singapore Time (SGT)</span>
          <button type="button" onClick={generate} className="flex items-center gap-1.5 font-medium text-gray-600 hover:text-gray-800">
            Data updates every 5 minutes <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>
    </Layout>
  )
}
