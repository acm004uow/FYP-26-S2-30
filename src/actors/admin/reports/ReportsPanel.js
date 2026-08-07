import { useEffect, useRef, useState } from 'react'
import { Calendar, CalendarDays, CalendarRange, CheckCircle2, ChevronLeft, ChevronRight, ClipboardList, Clock, DollarSign, Download, FileText, Printer, RefreshCw, Star, Sun, Users, X } from 'lucide-react'
import { supabase } from '../../../../lib/supabaseClient'
import { formatDuration } from '../../../../lib/attendance'
import { getPeriodRange, getPreviousPeriodRange } from '../../../../lib/reportPeriods'
import ReportInsights from '../../../components/ReportInsights'

const DELTA_SUFFIX = { daily: 'vs yesterday', weekly: 'vs last week', monthly: 'vs last month' }

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
    <p className={`mt-2 text-[11px] font-medium ${flat ? 'text-gray-400' : positive ? 'text-green-600' : 'text-red-500'}`}>
      {flat ? '±0' : positive ? `+${value}` : value}{unit === '%' ? '%' : unit ? ` ${unit}` : ''} {suffix} {!flat && (positive ? '↑' : '↓')}
    </p>
  )
}

const REPORT_TYPES = [
  { value: 'daily', label: 'Daily', icon: Sun },
  { value: 'weekly', label: 'Weekly', icon: CalendarDays },
  { value: 'monthly', label: 'Monthly', icon: CalendarRange },
]

const STAT_THEME = {
  blue: { bg: 'bg-blue-50', icon: 'text-blue-600', value: 'text-gray-900' },
  green: { bg: 'bg-green-50', icon: 'text-green-600', value: 'text-green-600' },
  orange: { bg: 'bg-orange-50', icon: 'text-orange-500', value: 'text-orange-500' },
  purple: { bg: 'bg-purple-50', icon: 'text-purple-600', value: 'text-gray-900' },
  yellow: { bg: 'bg-yellow-50', icon: 'text-yellow-500', value: 'text-gray-900' },
}

function StatCard({ icon: Icon, label, value, caption, theme = 'blue', size = 'lg', delta, deltaSuffix, deltaUnit }) {
  const t = STAT_THEME[theme]
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm transition hover:shadow-md">
      <div className="flex items-center gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${t.bg}`}>
          <Icon className={`h-5 w-5 ${t.icon}`} />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-medium text-gray-500">{label}</p>
          <p className={`${size === 'lg' ? 'text-xl' : 'text-sm'} truncate font-bold ${t.value}`}>{value}</p>
        </div>
      </div>
      {caption && <p className="mt-2 text-xs text-gray-400">{caption}</p>}
      <DeltaBadge value={delta} suffix={deltaSuffix} unit={deltaUnit} />
    </div>
  )
}

const AVATAR_PALETTE = [
  { bg: 'bg-purple-100', text: 'text-purple-600' },
  { bg: 'bg-teal-100', text: 'text-teal-600' },
  { bg: 'bg-pink-100', text: 'text-pink-600' },
  { bg: 'bg-orange-100', text: 'text-orange-600' },
  { bg: 'bg-blue-100', text: 'text-blue-600' },
  { bg: 'bg-green-100', text: 'text-green-600' },
]

const initialsOf = (name) => name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()

function DetailModal({ title, subtitle, onClose, children }) {
  useEffect(() => {
    const onKeyDown = event => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl" onClick={event => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-base font-bold text-gray-900">{title}</p>
            {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="shrink-0 rounded-lg p-1 text-gray-400 hover:bg-gray-50 hover:text-gray-600" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  )
}

// Owner-facing counterpart to src/actors/manager/reports/index.js — same report shape (stat
// cards, category breakdown, CSV/PDF export) but scoped to the whole business rather than one
// manager's assigned team: every staff member's attendance is included, not just those with
// manager_id set to the viewer.
export default function ReportsPanel() {
  const [reportType, setReportType] = useState('daily')
  const [periodOffset, setPeriodOffset] = useState(0)
  const [periodLabel, setPeriodLabel] = useState('')
  const [data, setData] = useState(null)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [viewingStaffName, setViewingStaffName] = useState(null)
  const [attendanceFilter, setAttendanceFilter] = useState('all')
  const [insights, setInsights] = useState([])
  const [insightsLoading, setInsightsLoading] = useState(false)
  const [insightsError, setInsightsError] = useState('')
  const [showDatePicker, setShowDatePicker] = useState(false)
  const detailsRef = useRef(null)
  const dateInputRef = useRef(null)

  useEffect(() => {
    setPeriodOffset(0)
  }, [reportType])

  useEffect(() => {
    if (!showDatePicker || !dateInputRef.current) return
    dateInputRef.current.focus()
    try {
      dateInputRef.current.showPicker?.()
    } catch {
      // showPicker is unsupported or blocked in this browser — the visible input still works.
    }
  }, [showDatePicker])

  // Converts a picked calendar date into "whole periods back from now" so it lines up with
  // periodOffset's meaning (0 = current daily/weekly/monthly period, 1 = previous, ...).
  const offsetForPickedDate = (pickedIso) => {
    const now = new Date()
    const picked = new Date(`${pickedIso}T00:00:00Z`)

    if (reportType === 'monthly') {
      return (now.getUTCFullYear() * 12 + now.getUTCMonth()) - (picked.getUTCFullYear() * 12 + picked.getUTCMonth())
    }

    const mondayOf = (date) => {
      const anchor = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
      const day = anchor.getUTCDay()
      anchor.setUTCDate(anchor.getUTCDate() + (day === 0 ? -6 : 1 - day))
      return anchor
    }

    if (reportType === 'weekly') {
      return Math.round((mondayOf(now) - mondayOf(picked)) / (7 * 86400000))
    }

    const startOfUtcDay = (date) => Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
    return Math.round((startOfUtcDay(now) - startOfUtcDay(picked)) / 86400000)
  }

  const handlePickDate = (event) => {
    const pickedIso = event.target.value
    if (!pickedIso) return
    setPeriodOffset(Math.max(0, offsetForPickedDate(pickedIso)))
    setShowDatePicker(false)
  }

  const reportLabel = reportType.charAt(0).toUpperCase() + reportType.slice(1)
  const payColumnLabel = reportType === 'daily' ? "Today's Pay" : reportType === 'weekly' ? "This Week's Pay" : "This Month's Pay"
  const hoursColumnLabel = reportType === 'daily' ? "Today's Hours" : reportType === 'weekly' ? "This Week's Hours" : "This Month's Hours"
  const fileStamp = new Date().toISOString().slice(0, 10)

  const resolveHostAdminId = async (userId) => {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role,host_admin_id')
      .eq('id', userId)
      .single()

    return profile?.role === 'system_admin' ? userId : profile?.host_admin_id || null
  }

  const getReportRows = (reportData = data) => {
    if (!reportData) return []
    return [
      ['Report Type', reportLabel],
      ['Generated At', reportData.generatedAt],
      ['Total Tasks', reportData.totalTasks],
      ['Completed', reportData.completed],
      ['Pending', reportData.pending],
      ['Staff Utilization', reportData.staffUtilization],
      ['Average Rating', reportData.avgRating],
      ...Object.entries(reportData.tasksByCategory).map(([category, value]) => [`Category: ${category}`, value]),
      ...reportData.attendanceSummary.map(row => [`Attendance: ${row.name}`, `${row.daysPresent} days present, avg clock-in ${row.avgClockIn}, ${row.totalHours} worked`]),
      ...reportData.paySummary.map(row => [`Pay: ${row.name}`, `${row.breakdown.map(b => `${b.service_type} ${b.hours}h (${formatMoney(b.allowance)})`).join('; ') || 'No completed tasks'} — basic ${formatMoney(row.basicSalary)} + allowance ${formatMoney(row.totalAllowance)} = total ${formatMoney(row.totalPay)}`]),
    ]
  }

  const formatMoney = (value) => `$${Number(value || 0).toFixed(2)}`

  const escapeCsvCell = (value) => {
    const cell = String(value ?? '')
    return /[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell
  }

  const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')

  const loadInsights = async (metrics) => {
    setInsightsLoading(true)
    setInsightsError('')
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData?.session?.access_token
      const res = await fetch('/api/reports/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reportLabel: reportType, scope: 'owner', metrics }),
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
    setLoading(true)
    const period = getPeriodRange(reportType, periodOffset)
    const prevPeriod = getPreviousPeriodRange(reportType, periodOffset)
    setPeriodLabel(period.label)
    const since = period.start.toISOString()
    const { data: { user } } = await supabase.auth.getUser()
    const hostAdminId = await resolveHostAdminId(user?.id)

    const [{ data: tasks }, { data: staff }, { data: reviews }, { data: payRates }, { data: prevTasks }, { data: prevReviews }] = await Promise.all([
      supabase.from('bookings').select('status,service_type,assigned_staff_id,estimated_hours,staff_profiles(staff_name)').eq('host_admin_id', hostAdminId).gte('created_at', period.start.toISOString()).lt('created_at', period.end.toISOString()),
      supabase.from('staff_profiles').select('id,user_id,staff_name,basic_salary').eq('host_admin_id', hostAdminId),
      supabase.from('performance_reviews').select('rating').gte('created_at', period.start.toISOString()).lt('created_at', period.end.toISOString()),
      supabase.from('service_pay_rates').select('service_type,hourly_rate').eq('host_admin_id', hostAdminId),
      supabase.from('bookings').select('status,assigned_staff_id').eq('host_admin_id', hostAdminId).gte('created_at', prevPeriod.start.toISOString()).lt('created_at', prevPeriod.end.toISOString()),
      supabase.from('performance_reviews').select('rating').gte('created_at', prevPeriod.start.toISOString()).lt('created_at', prevPeriod.end.toISOString()),
    ])

    const taskRows = tasks || []
    const staffRows = staff || []

    const staffUserIds = staffRows.map(s => s.user_id).filter(Boolean)
    let attendance = []
    if (staffUserIds.length > 0) {
      const { data: attendanceRows } = await supabase
        .from('attendance_records')
        .select('profile_id,clocked_in_at,clocked_out_at')
        .eq('host_admin_id', hostAdminId)
        .in('profile_id', staffUserIds)
        .gte('work_date', since.slice(0, 10))
      attendance = attendanceRows || []
    }

    const attendanceSummary = staffRows.map(member => {
      const rows = attendance.filter(row => row.profile_id === member.user_id && row.clocked_in_at)
      const daysPresent = rows.length
      const avgClockInMinutes = daysPresent
        ? rows.reduce((sum, row) => {
            const d = new Date(row.clocked_in_at)
            return sum + d.getHours() * 60 + d.getMinutes()
          }, 0) / daysPresent
        : null
      const totalHoursMs = rows.reduce((sum, row) => row.clocked_out_at ? sum + (new Date(row.clocked_out_at) - new Date(row.clocked_in_at)) : sum, 0)
      return {
        id: member.id,
        name: member.staff_name,
        daysPresent,
        avgClockIn: avgClockInMinutes !== null
          ? `${String(Math.floor(avgClockInMinutes / 60)).padStart(2, '0')}:${String(Math.round(avgClockInMinutes % 60)).padStart(2, '0')}`
          : '—',
        totalHours: formatDuration(totalHoursMs),
      }
    })
    const completed = taskRows.filter(task => task.status === 'completed').length
    const totalTasks = taskRows.length
    const assignedCounts = taskRows.reduce((acc, task) => {
      const name = task.staff_profiles?.staff_name
      if (name) acc[name] = (acc[name] || 0) + 1
      return acc
    }, {})
    const topEntry = Object.entries(assignedCounts).sort((a, b) => b[1] - a[1])[0]
    const tasksByCategory = taskRows.reduce((acc, task) => {
      const category = task.service_type || 'General'
      acc[category] = (acc[category] || 0) + 1
      return acc
    }, {})
    const avgRating = reviews?.length ? (reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / reviews.length).toFixed(1) : '0.0'

    const rateMap = {}
    ;(payRates || []).forEach(row => { rateMap[row.service_type] = Number(row.hourly_rate) || 0 })

    const completedTasks = taskRows.filter(task => task.status === 'completed' && task.assigned_staff_id)
    const paySummary = staffRows.map(member => {
      const memberTasks = completedTasks.filter(task => task.assigned_staff_id === member.id)
      const byService = memberTasks.reduce((acc, task) => {
        const serviceType = task.service_type || 'General'
        const hours = Number(task.estimated_hours) || 0
        if (!acc[serviceType]) acc[serviceType] = { hours: 0, allowance: 0 }
        acc[serviceType].hours += hours
        acc[serviceType].allowance += hours * (rateMap[serviceType] || 0)
        return acc
      }, {})
      const breakdown = Object.entries(byService).map(([serviceType, value]) => ({ service_type: serviceType, hours: value.hours, allowance: value.allowance }))
      const totalAllowance = breakdown.reduce((sum, row) => sum + row.allowance, 0)
      const basicSalary = Number(member.basic_salary) || 0
      return {
        id: member.id,
        name: member.staff_name,
        basicSalary,
        breakdown,
        totalAllowance,
        totalPay: basicSalary + totalAllowance,
        hoursWorked: breakdown.reduce((sum, row) => sum + Number(row.hours || 0), 0),
      }
    })

    // attendanceSummary and paySummary both map 1:1 over staffRows, so they line up by index —
    // merge them here instead of asking the table to look name/id up in two separate arrays.
    const staffSummary = staffRows.map((_, index) => ({
      ...attendanceSummary[index],
      ...paySummary[index],
    }))

    const efficiencyPct = totalTasks ? Math.round((completed / totalTasks) * 100) : 0
    const staffUtilizationPct = staffRows.length ? Math.round((taskRows.filter(task => task.assigned_staff_id).length / staffRows.length) * 100) : 0
    const totalPayroll = paySummary.reduce((sum, row) => sum + row.totalPay, 0)

    const prevTaskRows = prevTasks || []
    const prevCompleted = prevTaskRows.filter(task => task.status === 'completed').length
    const prevPending = prevTaskRows.filter(task => task.status === 'pending').length
    const prevTotalTasks = prevTaskRows.length
    const prevEfficiencyPct = prevTotalTasks ? Math.round((prevCompleted / prevTotalTasks) * 100) : null
    const prevStaffUtilizationPct = staffRows.length ? Math.round((prevTaskRows.filter(task => task.assigned_staff_id).length / staffRows.length) * 100) : null
    const prevAvgRating = prevReviews?.length ? prevReviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / prevReviews.length : null

    setData({
      totalTasks,
      totalTasksDelta: pctDelta(totalTasks, prevTotalTasks),
      completed,
      completedDelta: pctDelta(completed, prevCompleted),
      pending: taskRows.filter(task => task.status === 'pending').length,
      pendingDelta: pctDelta(taskRows.filter(task => task.status === 'pending').length, prevPending),
      staffUtilization: `${staffUtilizationPct}%`,
      staffUtilizationDelta: prevStaffUtilizationPct !== null ? staffUtilizationPct - prevStaffUtilizationPct : null,
      avgRating,
      avgRatingDelta: prevAvgRating !== null ? Number((Number(avgRating) - prevAvgRating).toFixed(1)) : null,
      tasksByCategory: Object.keys(tasksByCategory).length ? tasksByCategory : { General: 0 },
      attendanceSummary,
      paySummary,
      staffSummary,
      totalPayroll,
      generatedAt: new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }),
    })
    setMessage('')
    setLoading(false)

    loadInsights({
      period: period.label,
      totalTasks,
      totalTasksChangePct: pctDelta(totalTasks, prevTotalTasks),
      completedTasks: completed,
      completedTasksChangePct: pctDelta(completed, prevCompleted),
      pendingTasks: taskRows.filter(task => task.status === 'pending').length,
      efficiencyPct,
      efficiencyChangePts: prevTotalTasks ? efficiencyPct - prevEfficiencyPct : null,
      staffUtilizationPct: staffUtilizationPct,
      staffUtilizationChangePts: prevStaffUtilizationPct !== null ? staffUtilizationPct - prevStaffUtilizationPct : null,
      averageRating: avgRating,
      averageRatingChange: prevAvgRating !== null ? Number((Number(avgRating) - prevAvgRating).toFixed(1)) : null,
      topPerformer: topEntry ? topEntry[0] : null,
      totalPayroll: Number(totalPayroll.toFixed(2)),
    })
  }

  useEffect(() => {
    generate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportType, periodOffset])

  const downloadCsv = () => {
    if (!data) return
    const csv = getReportRows().map(row => row.map(escapeCsvCell).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${reportType}-business-report-${fileStamp}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    setMessage('CSV report downloaded.')
  }

  const exportPdf = () => {
    if (!data) return
    const maxCategory = Math.max(1, ...Object.values(data.tasksByCategory))

    const ICONS = {
      clipboard: '<path d="M8 2h8a1 1 0 0 1 1 1v2H7V3a1 1 0 0 1 1-1Z"/><path d="M6 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h0"/><path d="M9 12h6"/><path d="M9 16h6"/>',
      check: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
      clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
      users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
      star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
      dollar: '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
    }
    const icon = (name, color) => `<svg viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`
    const statCard = ({ iconName, label, value, caption, bg, color, valueColor = '#111827' }) => `
      <div class="stat-card">
        <span class="stat-icon" style="background:${bg}">${icon(iconName, color)}</span>
        <div>
          <p class="stat-label">${escapeHtml(label)}</p>
          <p class="stat-value" style="color:${valueColor}">${escapeHtml(value)}</p>
          ${caption ? `<p class="stat-caption">${escapeHtml(caption)}</p>` : ''}
        </div>
      </div>`

    const categoryRows = Object.entries(data.tasksByCategory).map(([category, value]) => `
      <div class="cat-row">
        <span class="cat-label">${escapeHtml(category)}</span>
        <div class="cat-track"><div class="cat-fill" style="width:${(value / maxCategory) * 100}%"></div></div>
        <span class="cat-value">${escapeHtml(value)}</span>
      </div>`).join('')

    const payRows = data.paySummary.map(row => `
      <div class="pay-row">
        <div class="pay-row-top">
          <span class="pay-name">${escapeHtml(row.name)}</span>
          <span class="pay-total">${escapeHtml(formatMoney(row.totalPay))}</span>
        </div>
        <div class="pay-detail">Basic ${escapeHtml(formatMoney(row.basicSalary))} + allowance ${escapeHtml(formatMoney(row.totalAllowance))}${row.breakdown.length ? ` (${row.breakdown.map(b => `${escapeHtml(b.service_type)} ${b.hours}h`).join(', ')})` : ' (no completed tasks)'}</div>
      </div>`).join('')

    const printWindow = window.open('', '_blank', 'width=900,height=700')
    if (!printWindow) {
      setMessage('Pop-up blocked. Allow pop-ups for this site, then try Export PDF again.')
      return
    }

    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>${escapeHtml(reportLabel)} Business Report</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 32px; color: #111827; background: #fff; }
            h1 { margin: 0 0 6px; font-size: 22px; }
            .meta { color: #6b7280; font-size: 13px; margin-bottom: 20px; }
            .row-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 12px; }
            .row-2 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 20px; }
            .stat-card { border: 1px solid #f3f4f6; border-radius: 12px; padding: 16px; display: flex; align-items: flex-start; gap: 12px; box-shadow: 0 1px 2px rgba(0,0,0,0.04); break-inside: avoid; }
            .stat-icon { width: 40px; height: 40px; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
            .stat-icon svg { width: 20px; height: 20px; }
            .stat-label { font-size: 12px; color: #6b7280; margin: 0 0 4px; }
            .stat-value { font-size: 20px; font-weight: 700; margin: 0; }
            .stat-caption { font-size: 11px; color: #9ca3af; margin: 6px 0 0; }
            .category-card { border: 1px solid #f3f4f6; border-radius: 12px; padding: 16px; break-inside: avoid; }
            .category-title { font-size: 12px; font-weight: 600; color: #6b7280; margin: 0 0 14px; }
            .cat-row { display: flex; align-items: center; gap: 12px; font-size: 13px; margin-bottom: 10px; }
            .cat-label { width: 140px; flex-shrink: 0; color: #4b5563; }
            .cat-track { flex: 1; height: 8px; border-radius: 9999px; background: #f3f4f6; overflow: hidden; }
            .cat-fill { height: 8px; border-radius: 9999px; background: #3b82f6; }
            .cat-value { width: 24px; text-align: right; font-weight: 600; }
            .pay-card { border: 1px solid #f3f4f6; border-radius: 12px; padding: 16px; margin-top: 12px; break-inside: avoid; }
            .pay-row { padding: 8px 0; border-bottom: 1px solid #f3f4f6; }
            .pay-row:last-child { border-bottom: none; }
            .pay-row-top { display: flex; justify-content: space-between; font-size: 13px; }
            .pay-name { font-weight: 600; color: #111827; }
            .pay-total { font-weight: 700; color: #111827; }
            .pay-detail { font-size: 11px; color: #6b7280; margin-top: 2px; }
            @media print { body { margin: 20px; } }
          </style>
        </head>
        <body>
          <h1>${escapeHtml(reportLabel)} Business Report</h1>
          <div class="meta">Generated at ${escapeHtml(data.generatedAt)}</div>

          <div class="row-3">
            ${statCard({ iconName: 'clipboard', label: 'Total Tasks', value: data.totalTasks, bg: '#eff6ff', color: '#2563eb' })}
            ${statCard({ iconName: 'check', label: 'Completed', value: data.completed, bg: '#f0fdf4', color: '#16a34a', valueColor: '#16a34a' })}
            ${statCard({ iconName: 'clock', label: 'Pending', value: data.pending, bg: '#fff7ed', color: '#f97316', valueColor: '#f97316' })}
          </div>

          <div class="row-2">
            ${statCard({ iconName: 'users', label: 'Staff Utilization', value: data.staffUtilization, caption: 'Avg tasks per staff', bg: '#eff6ff', color: '#2563eb' })}
            ${statCard({ iconName: 'star', label: 'Average Rating', value: `${data.avgRating} / 5`, bg: '#fefce8', color: '#eab308' })}
            ${statCard({ iconName: 'dollar', label: 'Total Payroll', value: formatMoney(data.totalPayroll), caption: 'Basic salary + allowance', bg: '#f0fdf4', color: '#16a34a', valueColor: '#16a34a' })}
          </div>

          <div class="category-card">
            <p class="category-title">Tasks by Category</p>
            ${categoryRows}
          </div>

          <div class="pay-card">
            <p class="category-title">Staff Pay Summary</p>
            ${payRows}
          </div>

          <script>
            window.onload = () => {
              window.print();
              window.onafterprint = () => window.close();
            };
          </script>
        </body>
      </html>
    `)
    printWindow.document.close()
    setMessage('PDF export opened. Choose Save as PDF in the print dialog.')
  }

  const maxCategoryCount = data ? Math.max(1, ...Object.values(data.tasksByCategory)) : 1

  return (
    <div className="max-w-6xl mx-auto">
      <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent-100 text-accent-600">
              <FileText className="h-6 w-6" />
            </span>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Business Reports</h1>
              <p className="mt-1 max-w-xl text-sm text-gray-500">Daily, weekly, or monthly performance across your whole business — every manager&apos;s staff and bookings, not just one team.</p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-3">
            <div className="inline-flex shrink-0 rounded-xl bg-gray-100 p-1">
              {REPORT_TYPES.map(t => (
                <button
                  key={t.value}
                  onClick={() => setReportType(t.value)}
                  className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${reportType === t.value ? 'bg-white text-accent-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  <t.icon className="w-4 h-4" /> {t.label}
                </button>
              ))}
            </div>
            <div className="flex shrink-0 items-center gap-1 rounded-lg border border-gray-200 bg-white px-1.5 py-1.5">
              <button
                type="button"
                onClick={() => setPeriodOffset(offset => offset + 1)}
                className="rounded-md p-1 text-gray-400 hover:bg-gray-50 hover:text-gray-600"
                aria-label="Previous period"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="px-1 text-xs font-medium text-gray-700 whitespace-nowrap">{periodLabel || '—'}</span>
              <button
                type="button"
                onClick={() => setPeriodOffset(offset => Math.max(0, offset - 1))}
                disabled={periodOffset === 0}
                className="rounded-md p-1 text-gray-400 hover:bg-gray-50 hover:text-gray-600 disabled:opacity-30 disabled:hover:bg-transparent"
                aria-label="Next period"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              <div className="relative ml-0.5">
                <button
                  type="button"
                  onClick={() => setShowDatePicker(v => !v)}
                  className="rounded-md p-1 text-gray-400 hover:bg-gray-50 hover:text-gray-600"
                  aria-label="Jump to a specific date"
                >
                  <Calendar className="h-4 w-4" />
                </button>
                {showDatePicker && (
                  <input
                    ref={dateInputRef}
                    type="date"
                    max={new Date().toISOString().slice(0, 10)}
                    onChange={handlePickDate}
                    onBlur={() => setShowDatePicker(false)}
                    className="absolute right-0 top-full z-10 mt-1 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-accent-100"
                  />
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          {data && (
            <>
              <button onClick={downloadCsv} className="border border-gray-200 bg-white text-gray-700 px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium hover:bg-gray-50"><Download className="w-4 h-4" /> Download CSV</button>
              <button onClick={exportPdf} className="border border-gray-200 bg-white text-gray-700 px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium hover:bg-gray-50"><Printer className="w-4 h-4" /> Export PDF</button>
              <span className="text-xs text-gray-400">Generated: {data.generatedAt}</span>
            </>
          )}
          <button onClick={generate} disabled={loading} className="ml-auto bg-accent hover:bg-accent-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-semibold transition disabled:opacity-60"><RefreshCw className="w-4 h-4" /> {loading ? 'Loading...' : data ? 'Refresh' : 'Generate Report'}</button>
        </div>
        {message && <div className="mt-4 rounded-lg border border-accent-200 bg-accent-100 px-4 py-3 text-sm text-accent-800">{message}</div>}

        {data ? (
          <div className="mt-6 space-y-5" ref={detailsRef}>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard icon={ClipboardList} label="Total Tasks" value={data.totalTasks} theme="blue" delta={data.totalTasksDelta} deltaSuffix={DELTA_SUFFIX[reportType]} />
              <StatCard icon={CheckCircle2} label="Completed" value={data.completed} theme="green" delta={data.completedDelta} deltaSuffix={DELTA_SUFFIX[reportType]} />
              <StatCard icon={Clock} label="Pending" value={data.pending} theme="orange" delta={data.pendingDelta} deltaSuffix={DELTA_SUFFIX[reportType]} />
              <StatCard icon={Users} label="Staff Utilization" value={data.staffUtilization} caption="Avg tasks per staff" theme="blue" delta={data.staffUtilizationDelta} deltaSuffix={DELTA_SUFFIX[reportType]} deltaUnit="pts" />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <StatCard icon={Star} label="Average Rating" value={`${data.avgRating} / 5`} theme="yellow" delta={data.avgRatingDelta} deltaSuffix={DELTA_SUFFIX[reportType]} deltaUnit="" />
              <StatCard icon={DollarSign} label="Total Payroll" value={formatMoney(data.totalPayroll)} caption="Basic salary + allowance" theme="green" />
            </div>

            <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-100 text-accent-600">
                    <Clock className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Staff Attendance & Pay Summary ({reportLabel})</p>
                    <p className="text-xs text-gray-400">{reportLabel} attendance and payroll breakdown by staff</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={attendanceFilter}
                    onChange={event => setAttendanceFilter(event.target.value)}
                    className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 focus:outline-none focus:ring-2 focus:ring-accent-100"
                    aria-label="Filter staff by attendance status"
                  >
                    <option value="all">All Staff</option>
                    <option value="present">Present</option>
                    <option value="absent">Absent</option>
                  </select>
                  <span className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600">
                    <CalendarDays className="h-3.5 w-3.5" /> {reportLabel}
                  </span>
                </div>
              </div>

              {data.staffSummary.length > 0 ? (
                <div className="overflow-x-auto rounded-lg border border-gray-100">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-left text-xs font-medium text-gray-400">
                        <th className="px-4 py-2.5 font-medium">Staff Member</th>
                        <th className="px-4 py-2.5 font-medium">{hoursColumnLabel}</th>
                        <th className="px-4 py-2.5 font-medium">Status</th>
                        <th className="px-4 py-2.5 font-medium">{payColumnLabel}</th>
                        <th className="px-4 py-2.5 font-medium">Hours Worked</th>
                        <th className="px-4 py-2.5 font-medium">Estimated Earnings</th>
                        <th className="w-8 px-2 py-2.5"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {data.staffSummary
                        .filter(row => attendanceFilter === 'all' ? true : attendanceFilter === 'present' ? row.daysPresent > 0 : row.daysPresent === 0)
                        .map((row, index) => {
                          const palette = AVATAR_PALETTE[index % AVATAR_PALETTE.length]
                          const present = row.daysPresent > 0
                          return (
                            <tr
                              key={row.id}
                              onClick={() => setViewingStaffName(row.name)}
                              onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setViewingStaffName(row.name) } }}
                              role="button"
                              tabIndex={0}
                              className="cursor-pointer hover:bg-gray-50 focus:bg-gray-50 focus:outline-none"
                            >
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2.5">
                                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${palette.bg} ${palette.text}`}>{initialsOf(row.name)}</span>
                                  <span className="font-medium text-gray-900">{row.name}</span>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-gray-700">{row.totalHours}</td>
                              <td className="px-4 py-3">
                                <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${present ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{present ? 'Present' : 'Absent'}</span>
                              </td>
                              <td className="px-4 py-3 text-gray-700">{formatMoney(row.totalPay)}</td>
                              <td className="px-4 py-3 text-gray-700">{row.hoursWorked.toFixed(1)} hrs</td>
                              <td className="px-4 py-3 font-medium text-gray-900">{formatMoney(row.totalAllowance)}</td>
                              <td className="px-2 py-3">
                                <ChevronRight className="ml-auto h-4 w-4 text-gray-300" />
                              </td>
                            </tr>
                          )
                        })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-gray-400">No staff found.</p>
              )}
            </div>

            <ReportInsights insights={insights} loading={insightsLoading} error={insightsError} onViewDetails={() => detailsRef.current?.scrollIntoView({ behavior: 'smooth' })} />
          </div>
        ) : (
          <div className="mt-6 rounded-xl border border-dashed border-gray-200 p-10 text-center text-sm text-gray-400">
            {loading ? 'Loading report...' : 'No data available for this period yet.'}
          </div>
        )}
      </div>

      {viewingStaffName && (() => {
        const row = data?.staffSummary.find(r => r.name === viewingStaffName)
        if (!row) return null
        return (
          <DetailModal title={row.name} subtitle={`Attendance & Pay — ${reportLabel}`} onClose={() => setViewingStaffName(null)}>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-lg border border-gray-100 bg-gray-50 py-3">
                <p className={`text-lg font-bold ${row.daysPresent > 0 ? 'text-gray-900' : 'text-gray-300'}`}>{row.daysPresent}</p>
                <p className="mt-0.5 text-[11px] text-gray-400">days present</p>
              </div>
              <div className="rounded-lg border border-gray-100 bg-gray-50 py-3">
                <p className={`text-lg font-bold ${row.avgClockIn !== '—' ? 'text-gray-900' : 'text-gray-300'}`}>{row.avgClockIn}</p>
                <p className="mt-0.5 text-[11px] text-gray-400">avg clock-in</p>
              </div>
              <div className="rounded-lg border border-gray-100 bg-gray-50 py-3">
                <p className={`text-lg font-bold ${row.daysPresent > 0 ? 'text-gray-900' : 'text-gray-300'}`}>{row.totalHours}</p>
                <p className="mt-0.5 text-[11px] text-gray-400">worked</p>
              </div>
            </div>

            <div className="mt-4 rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Total pay</span>
                <span className="font-bold text-gray-900">{formatMoney(row.totalPay)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
                <span>Basic salary</span>
                <span className="font-medium text-gray-700">{formatMoney(row.basicSalary)}</span>
              </div>
              <div className="mt-1 flex items-center justify-between text-xs text-gray-500">
                <span>Allowance</span>
                <span className="font-medium text-gray-700">{formatMoney(row.totalAllowance)}</span>
              </div>
            </div>
            {row.breakdown.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {row.breakdown.map(b => (
                  <span key={b.service_type} className="inline-flex items-center gap-1 rounded-full bg-accent-100 px-2 py-0.5 text-xs text-accent-800">
                    {b.service_type}: {b.hours}h ({formatMoney(b.allowance)})
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-xs text-gray-400">No completed tasks this period.</p>
            )}
          </DetailModal>
        )
      })()}
    </div>
  )
}
