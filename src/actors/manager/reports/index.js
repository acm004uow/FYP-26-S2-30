import Layout from '../../../components/Layout'
import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, CartesianGrid, ResponsiveContainer, LabelList, Cell } from 'recharts'
import { CheckCircle2, ClipboardList, Star, Users } from 'lucide-react'
import { supabase } from '../../../../lib/supabaseClient'
import { useAuthUser } from '../../../context/AuthUserContext'

const REPORT_TYPES = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
]

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

// Dates are kept entirely in UTC arithmetic (parse/build with getUTC*/setUTC*) so the
// "this week" range doesn't silently shift by a day in timezones ahead of UTC.
function getWeekDates() {
  const now = new Date()
  const anchor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const day = anchor.getUTCDay()
  const diffToMonday = day === 0 ? -6 : 1 - day
  const monday = new Date(anchor)
  monday.setUTCDate(anchor.getUTCDate() + diffToMonday)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setUTCDate(monday.getUTCDate() + i)
    return d.toISOString().slice(0, 10)
  })
}

function StatCard({ icon: Icon, label, value, theme }) {
  const t = STAT_THEME[theme]
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-3.5 shadow-sm">
      <span className={`inline-flex h-7 w-7 items-center justify-center rounded-lg ${t.bg} mb-2`}>
        <Icon className={`h-3.5 w-3.5 ${t.icon}`} />
      </span>
      <p className="text-xl font-bold text-gray-900">{value}</p>
      <p className="mt-0.5 text-xs text-gray-500">{label}</p>
    </div>
  )
}

export default function ManagerReports() {
  const { user } = useAuthUser()
  const [reportType, setReportType] = useState('daily')
  const [data, setData] = useState(null)
  const [completionsPerDay, setCompletionsPerDay] = useState([])
  const [loading, setLoading] = useState(true)

  const generate = async () => {
    if (!user) return
    setLoading(true)
    const days = reportType === 'daily' ? 1 : reportType === 'weekly' ? 7 : 30
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
    const { data: managerProfile } = await supabase
      .from('profiles')
      .select('host_admin_id')
      .eq('id', user?.id)
      .single()
    const hostAdminId = managerProfile?.host_admin_id

    const weekDates = getWeekDates()

    const [{ data: tasks }, { data: staff }, { data: reviews }, { data: weekBookings }] = await Promise.all([
      supabase.from('bookings').select('status,assigned_staff_id,attendance_status').eq('host_admin_id', hostAdminId).gte('created_at', since),
      supabase.from('staff_profiles').select('id').eq('host_admin_id', hostAdminId),
      supabase.from('performance_reviews').select('rating').gte('created_at', since),
      supabase.from('bookings').select('scheduled_date').eq('host_admin_id', hostAdminId).eq('status', 'completed').gte('scheduled_date', weekDates[0]).lte('scheduled_date', weekDates[6]),
    ])

    const taskRows = tasks || []
    const staffRows = staff || []
    const completed = taskRows.filter(task => task.status === 'completed').length
    const avgRating = reviews?.length ? (reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / reviews.length).toFixed(1) : '0.0'

    const withAttendance = taskRows.filter(task => task.status === 'completed' && ['present', 'late'].includes(task.attendance_status))
    const onTimeCompletion = withAttendance.length
      ? Math.round((withAttendance.filter(task => task.attendance_status === 'present').length / withAttendance.length) * 100)
      : null

    const staffUtilization = staffRows.length
      ? Math.round((taskRows.filter(task => task.assigned_staff_id).length / staffRows.length) * 100)
      : 0

    const countsByDate = (weekBookings || []).reduce((acc, booking) => {
      acc[booking.scheduled_date] = (acc[booking.scheduled_date] || 0) + 1
      return acc
    }, {})
    setCompletionsPerDay(weekDates.map((date, i) => ({ day: WEEKDAY_LABELS[i], count: countsByDate[date] || 0 })))

    setData({
      completed,
      avgRating,
      onTimeCompletion,
      staffUtilization,
      generatedAt: new Date().toLocaleString(),
    })
    setLoading(false)
  }

  useEffect(() => {
    generate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportType, user])

  return (
    <Layout role="manager">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Manager / Reports</p>
        <h1 className="text-xl font-bold">Reports</h1>
        <p className="text-sm text-gray-500 mb-5">Operational performance across the business.</p>

        <div className="flex items-center gap-1.5 mb-5">
          {REPORT_TYPES.map(t => (
            <button
              key={t.value}
              onClick={() => setReportType(t.value)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${reportType === t.value ? 'bg-accent-100 text-accent-700' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {data ? (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
              <StatCard icon={ClipboardList} value={data.completed} label="Tasks completed" theme="blue" />
              <StatCard icon={Star} value={`${data.avgRating}`} label="Avg. rating" theme="amber" />
              <StatCard icon={CheckCircle2} value={data.onTimeCompletion !== null ? `${data.onTimeCompletion}%` : '—'} label="On-time completion" theme="green" />
              <StatCard icon={Users} value={`${data.staffUtilization}%`} label="Staff utilization" theme="purple" />
            </div>

            <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold text-gray-900 mb-3">Completions per day</p>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={completionsPerDay} barSize={28} margin={{ top: 16, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={{ stroke: '#e5e7eb' }} tickLine={false} />
                  <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                    {completionsPerDay.map((entry, index) => (
                      <Cell key={index} fill={barColor(entry.count, Math.max(...completionsPerDay.map(d => d.count)))} />
                    ))}
                    <LabelList dataKey="count" position="top" fill="#374151" fontSize={11} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </>
        ) : (
          <div className="rounded-xl border border-dashed border-gray-200 p-10 text-center text-sm text-gray-400">
            {loading ? 'Loading report...' : 'No data available for this period yet.'}
          </div>
        )}
      </div>
    </Layout>
  )
}
