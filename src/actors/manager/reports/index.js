import Layout from '../../../components/Layout'
import { useEffect, useState } from 'react'
import { Award, CalendarDays, CalendarRange, CheckCircle2, ClipboardList, Clock, Download, FileText, Printer, Star, Sun, TrendingUp, Users } from 'lucide-react'
import { supabase } from '../../../../lib/supabaseClient'
import { formatDuration } from '../../../../lib/attendance'

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

function StatCard({ icon: Icon, label, value, caption, theme = 'blue', size = 'lg' }) {
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
    </div>
  )
}

export default function ManagerReports() {
  const [reportType, setReportType] = useState('daily')
  const [data, setData] = useState(null)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)

  const reportLabel = reportType.charAt(0).toUpperCase() + reportType.slice(1)
  const fileStamp = new Date().toISOString().slice(0, 10)

  const getReportRows = (reportData = data) => {
    if (!reportData) return []
    return [
      ['Report Type', reportLabel],
      ['Generated At', reportData.generatedAt],
      ['Total Tasks', reportData.totalTasks],
      ['Completed', reportData.completed],
      ['Pending', reportData.pending],
      ['Efficiency', reportData.efficiency],
      ['Staff Utilization', reportData.staffUtilization],
      ['Top Performer', reportData.topStaff],
      ['Average Rating', reportData.avgRating],
      ...Object.entries(reportData.tasksByCategory).map(([category, value]) => [`Category: ${category}`, value]),
      ...reportData.attendanceSummary.map(row => [`Attendance: ${row.name}`, `${row.daysPresent} days present, avg clock-in ${row.avgClockIn}, ${row.totalHours} worked`]),
    ]
  }

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

  const generate = async () => {
    setLoading(true)
    const days = reportType === 'daily' ? 1 : reportType === 'weekly' ? 7 : 30
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
    const { data: { user } } = await supabase.auth.getUser()
    const { data: managerProfile } = await supabase
      .from('profiles')
      .select('host_admin_id')
      .eq('id', user?.id)
      .single()
    const hostAdminId = managerProfile?.host_admin_id

    const [{ data: tasks }, { data: staff }, { data: reviews }, { data: teamStaff }] = await Promise.all([
      supabase.from('bookings').select('status,service_type,assigned_staff_id,staff_profiles(staff_name)').eq('host_admin_id', hostAdminId).gte('created_at', since),
      supabase.from('staff_profiles').select('id,staff_name,current_workload').eq('host_admin_id', hostAdminId),
      supabase.from('performance_reviews').select('rating').gte('created_at', since),
      supabase.from('staff_profiles').select('id,user_id,staff_name').eq('host_admin_id', hostAdminId).eq('manager_id', user?.id),
    ])

    let attendanceSummary = []
    const teamUserIds = (teamStaff || []).map(s => s.user_id).filter(Boolean)
    if (teamUserIds.length > 0) {
      const { data: attendance } = await supabase
        .from('attendance_records')
        .select('profile_id,clocked_in_at,clocked_out_at')
        .eq('host_admin_id', hostAdminId)
        .in('profile_id', teamUserIds)
        .gte('work_date', since.slice(0, 10))

      attendanceSummary = teamStaff.map(member => {
        const rows = (attendance || []).filter(row => row.profile_id === member.user_id && row.clocked_in_at)
        const daysPresent = rows.length
        const avgClockInMinutes = daysPresent
          ? rows.reduce((sum, row) => {
              const d = new Date(row.clocked_in_at)
              return sum + d.getHours() * 60 + d.getMinutes()
            }, 0) / daysPresent
          : null
        const totalHoursMs = rows.reduce((sum, row) => row.clocked_out_at ? sum + (new Date(row.clocked_out_at) - new Date(row.clocked_in_at)) : sum, 0)
        return {
          name: member.staff_name,
          daysPresent,
          avgClockIn: avgClockInMinutes !== null
            ? `${String(Math.floor(avgClockInMinutes / 60)).padStart(2, '0')}:${String(Math.round(avgClockInMinutes % 60)).padStart(2, '0')}`
            : '—',
          totalHours: formatDuration(totalHoursMs),
        }
      })
    }

    const taskRows = tasks || []
    const staffRows = staff || []
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

    setData({
      totalTasks,
      completed,
      pending: taskRows.filter(task => task.status === 'pending').length,
      efficiency: totalTasks ? `${Math.round((completed / totalTasks) * 100)}%` : '0%',
      staffUtilization: staffRows.length ? `${Math.round((taskRows.filter(task => task.assigned_staff_id).length / staffRows.length) * 100)}%` : '0%',
      topStaff: topEntry ? `${topEntry[0]} (${topEntry[1]} tasks)` : 'No assigned tasks',
      avgRating,
      tasksByCategory: Object.keys(tasksByCategory).length ? tasksByCategory : { General: 0 },
      attendanceSummary,
      generatedAt: new Date().toLocaleString(),
    })
    setMessage('')
    setLoading(false)
  }

  useEffect(() => {
    generate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportType])

  const downloadCsv = () => {
    if (!data) return
    const csv = getReportRows().map(row => row.map(escapeCsvCell).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${reportType}-operational-report-${fileStamp}.csv`
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
      trending: '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
      users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
      award: '<circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/>',
      star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
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

    const printWindow = window.open('', '_blank', 'width=900,height=700')
    if (!printWindow) {
      setMessage('Pop-up blocked. Allow pop-ups for this site, then try Export PDF again.')
      return
    }

    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>${escapeHtml(reportLabel)} Operational Report</title>
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
            @media print { body { margin: 20px; } }
          </style>
        </head>
        <body>
          <h1>${escapeHtml(reportLabel)} Operational Report</h1>
          <div class="meta">Generated at ${escapeHtml(data.generatedAt)}</div>

          <div class="row-3">
            ${statCard({ iconName: 'clipboard', label: 'Total Tasks', value: data.totalTasks, bg: '#eff6ff', color: '#2563eb' })}
            ${statCard({ iconName: 'check', label: 'Completed', value: data.completed, bg: '#f0fdf4', color: '#16a34a', valueColor: '#16a34a' })}
            ${statCard({ iconName: 'clock', label: 'Pending', value: data.pending, bg: '#fff7ed', color: '#f97316', valueColor: '#f97316' })}
          </div>

          <div class="row-2">
            ${statCard({ iconName: 'trending', label: 'Efficiency', value: data.efficiency, caption: 'Completed / Total', bg: '#faf5ff', color: '#9333ea' })}
            ${statCard({ iconName: 'users', label: 'Staff Utilization', value: data.staffUtilization, caption: 'Avg tasks per staff', bg: '#eff6ff', color: '#2563eb' })}
            ${statCard({ iconName: 'award', label: 'Top Performer', value: data.topStaff, bg: '#fefce8', color: '#eab308' })}
            ${statCard({ iconName: 'star', label: 'Average Rating', value: `${data.avgRating} / 5`, bg: '#fefce8', color: '#eab308' })}
          </div>

          <div class="category-card">
            <p class="category-title">Tasks by Category</p>
            ${categoryRows}
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
    <Layout role="manager">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold">Operational Reports</h1>
        <p className="text-gray-500 text-sm mb-6">Generate daily, weekly, or monthly performance reports with detailed breakdowns.</p>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8">
          <div className="inline-flex rounded-xl bg-gray-100 p-1 mb-5">
            {REPORT_TYPES.map(t => (
              <button
                key={t.value}
                onClick={() => setReportType(t.value)}
                className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${reportType === t.value ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                <t.icon className="w-4 h-4" /> {t.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {data && (
              <>
                <button onClick={downloadCsv} className="border border-gray-200 bg-white text-gray-700 px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium hover:bg-gray-50"><Download className="w-4 h-4" /> Download CSV</button>
                <button onClick={exportPdf} className="border border-gray-200 bg-white text-gray-700 px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium hover:bg-gray-50"><Printer className="w-4 h-4" /> Export PDF</button>
                <span className="text-xs text-gray-400">Generated {data.generatedAt}</span>
              </>
            )}
            <button onClick={generate} disabled={loading} className="ml-auto bg-gradient-to-r from-blue-500 to-green-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium shadow-sm transition hover:shadow-md disabled:opacity-60"><FileText className="w-4 h-4" /> {loading ? 'Loading...' : data ? 'Refresh' : 'Generate Report'}</button>
          </div>
          {message && <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">{message}</div>}

          {data ? (
            <div className="mt-6 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <StatCard icon={ClipboardList} label="Total Tasks" value={data.totalTasks} theme="blue" />
                <StatCard icon={CheckCircle2} label="Completed" value={data.completed} theme="green" />
                <StatCard icon={Clock} label="Pending" value={data.pending} theme="orange" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <StatCard icon={TrendingUp} label="Efficiency" value={data.efficiency} caption="Completed / Total" theme="purple" />
                <StatCard icon={Users} label="Staff Utilization" value={data.staffUtilization} caption="Avg tasks per staff" theme="blue" />
                <StatCard icon={Award} label="Top Performer" value={data.topStaff} theme="yellow" size="sm" />
                <StatCard icon={Star} label="Average Rating" value={`${data.avgRating} / 5`} theme="yellow" />
              </div>
              <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
                <p className="text-xs font-medium text-gray-500 mb-3">Tasks by Category</p>
                <div className="space-y-2.5">
                  {Object.entries(data.tasksByCategory).map(([cat, val]) => (
                    <div key={cat} className="flex items-center gap-3 text-sm">
                      <span className="w-32 shrink-0 truncate text-gray-600">{cat}</span>
                      <div className="h-2 flex-1 rounded-full bg-gray-100">
                        <div className="h-2 rounded-full bg-blue-500" style={{ width: `${(val / maxCategoryCount) * 100}%` }} />
                      </div>
                      <span className="w-6 shrink-0 text-right font-medium text-gray-900">{val}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
                <p className="text-xs font-medium text-gray-500 mb-3">Team Attendance Summary ({reportLabel})</p>
                {data.attendanceSummary.length > 0 ? (
                  <div className="space-y-2.5">
                    {data.attendanceSummary.map(row => (
                      <div key={row.name} className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">{row.name}</span>
                        <span className="text-gray-900 font-medium">{row.daysPresent} days • Avg in {row.avgClockIn} • {row.totalHours} worked</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400">No team members assigned to you yet.</p>
                )}
              </div>
            </div>
          ) : (
            <div className="mt-6 rounded-xl border border-dashed border-gray-200 p-10 text-center text-sm text-gray-400">
              {loading ? 'Loading report...' : 'No data available for this period yet.'}
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}
