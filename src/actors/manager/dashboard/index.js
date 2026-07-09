import Layout from '../../../components/Layout'
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import {
  MapPin, Star, ChevronRight
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts'
import { supabase } from '../../../../lib/supabaseClient'

const fallbackWorkloadData = [
  { name: 'Amir', hours: 18 },
  { name: 'Beatrice', hours: 16 },
  { name: 'Chen', hours: 15 },
  { name: 'Devi', hours: 14 },
  { name: 'Elena', hours: 12 },
  { name: 'Farid', hours: 9 },
]

const statusPalette = {
  Completed: '#078b98',
  'In progress': '#31c8bd',
  'Pending approval': '#f2ca63',
  Unassigned: '#ef6b55',
}

const fallbackStatusData = [
  { name: 'Completed', value: 46, color: statusPalette.Completed },
  { name: 'In progress', value: 28, color: statusPalette['In progress'] },
  { name: 'Pending approval', value: 14, color: statusPalette['Pending approval'] },
  { name: 'Unassigned', value: 12, color: statusPalette.Unassigned },
]

const statusColor = {
  'Completed': 'bg-green-100 text-green-700',
  'In Progress': 'bg-blue-100 text-blue-700',
  'Pending': 'bg-yellow-100 text-yellow-700',
  'Approved': 'bg-green-100 text-green-700',
  'Rejected': 'bg-red-100 text-red-700',
  'Cancelled': 'bg-gray-100 text-gray-600',
}

const staffStatusColor = {
  'Available': 'bg-green-100 text-green-700',
  'Busy': 'bg-blue-100 text-blue-700',
  'On Leave': 'bg-gray-100 text-gray-600',
}

export default function ManagerDashboard() {
  const router = useRouter()
  const [operationStats, setOperationStats] = useState([
    { label: 'active bookings', value: '24', path: '/manager-bookings' },
    { label: 'pending approvals', value: '6', path: '/manager-bookings' },
    { label: 'completed bookings', value: '0', path: '/manager-completed-tasks' },
    { label: 'avg. performance', value: '4.3★', path: '/manager-reports' },
  ])
  const [recentTaskRows, setRecentTaskRows] = useState([])
  const [staffRows, setStaffRows] = useState([])
  const [availableStaffCount, setAvailableStaffCount] = useState(0)
  const [statusDonutData, setStatusDonutData] = useState(fallbackStatusData)
  const [workloadBalanceData, setWorkloadBalanceData] = useState(fallbackWorkloadData)

  const loadDashboard = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: managerProfile } = await supabase
      .from('profiles')
      .select('host_admin_id')
      .eq('id', user?.id)
      .single()

    const hostAdminId = managerProfile?.host_admin_id

    const [{ data: staff }, { data: tasks }] = await Promise.all([
      supabase.from('staff_profiles').select('id,user_id,staff_name,skills,availability,current_workload,performance_rating,assigned_region,status,is_suspended').eq('host_admin_id', hostAdminId).limit(8),
      supabase.from('bookings').select('id,service_type,location,status,created_at,assigned_staff_id,staff_profiles(staff_name)').eq('host_admin_id', hostAdminId).order('created_at', { ascending: false }).limit(30),
    ])

    const staffData = staff || []
    const taskData = tasks || []
    const activeTasks = taskData.filter(t => !['completed', 'cancelled', 'rejected'].includes(t.status))
    const completedTasks = taskData.filter(t => t.status === 'completed')
    const pendingTasks = taskData.filter(t => t.status === 'pending')
    const availableStaff = staffData.filter(s => s.availability === 'available' && !s.is_suspended).length
    setAvailableStaffCount(availableStaff)
    const ratings = staffData.map(s => Number(s.performance_rating || 0)).filter(Boolean)
    const averageRating = ratings.length
      ? (ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length).toFixed(1)
      : '4.3'

    setOperationStats([
      { label: 'active bookings', value: String(activeTasks.length || 24), path: '/manager-bookings' },
      { label: 'pending approvals', value: String(pendingTasks.length || 6), path: '/manager-bookings' },
      { label: 'completed bookings', value: String(completedTasks.length), path: '/manager-completed-tasks' },
      { label: 'avg. performance', value: `${averageRating}★`, path: '/manager-reports' },
    ])
    setRecentTaskRows(taskData.slice(0, 3).map(t => ({
      id: t.id,
      shortId: t.id.slice(0, 8),
      title: t.service_type,
      location: t.location,
      assignedStaffId: t.assigned_staff_id,
      assignee: t.staff_profiles?.staff_name || 'Unassigned',
      rawStatus: t.status,
      status: t.status === 'in_progress' ? 'In Progress' : t.status.replace('_', ' ').replace(/^\w/, c => c.toUpperCase()),
    })))
    setStaffRows(staffData
      .sort((a, b) => Number(b.availability === 'available') - Number(a.availability === 'available'))
      .slice(0, 3)
      .map(s => ({
        id: s.id,
        userId: s.user_id,
        name: s.staff_name,
        role: s.skills?.[0] || 'Staff Member',
        status: s.is_suspended ? 'On Leave' : s.availability === 'available' ? 'Available' : 'Busy',
        tasks: s.current_workload || 0,
        rating: s.performance_rating || 0,
      })))
    const statusData = [
      { name: 'Completed', value: completedTasks.length, color: statusPalette.Completed },
      { name: 'In progress', value: taskData.filter(t => t.status === 'in_progress').length, color: statusPalette['In progress'] },
      { name: 'Pending approval', value: pendingTasks.length, color: statusPalette['Pending approval'] },
      { name: 'Unassigned', value: taskData.filter(t => !t.assigned_staff_id).length, color: statusPalette.Unassigned },
    ].filter(item => item.value > 0)
    setStatusDonutData(statusData.length ? statusData : fallbackStatusData)
    const workloadData = staffData
      .filter(s => s.staff_name)
      .map(s => ({
        name: s.staff_name.split(' ')[0],
        hours: Number(s.current_workload || 0),
      }))
      .sort((a, b) => b.hours - a.hours)
      .slice(0, 6)
    setWorkloadBalanceData(workloadData.length ? workloadData : fallbackWorkloadData)
  }

  useEffect(() => {
    loadDashboard()
  }, [])

  return (
    <Layout role="manager">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-8">
          <div>
            <h1 className="font-serif text-3xl font-bold leading-tight text-[#243033] sm:text-4xl">
              Manager dashboard
            </h1>
            <p className="text-gray-500 text-sm mt-3">Welcome back! Here&apos;s an overview of today&apos;s operations.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 mb-8 sm:grid-cols-2 lg:grid-cols-4">
          {operationStats.map(stat => (
            <button
              key={stat.label}
              type="button"
              onClick={() => router.push(stat.path)}
              className={`rounded-lg p-6 text-center shadow-md transition hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-[#078b98] focus:ring-offset-2 ${stat.featured ? 'bg-[#073f46] text-white' : 'bg-[#f7fbfb] text-[#078b98]'}`}
            >
              <p className={`font-serif text-4xl font-bold ${stat.featured ? 'text-white' : 'text-[#078b98]'}`}>{stat.value}</p>
              <p className={`mt-5 text-sm ${stat.featured ? 'text-white/85' : 'text-gray-600'}`}>{stat.label}</p>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-8 mb-8 lg:grid-cols-2">
          <div className="bg-white">
            <div className="flex flex-col items-center gap-5 md:flex-row md:justify-center">
              <ResponsiveContainer width="100%" height={230} className="max-w-[260px]">
                <PieChart>
                  <Pie
                    data={statusDonutData}
                    cx="50%"
                    cy="50%"
                    innerRadius={62}
                    outerRadius={96}
                    paddingAngle={0}
                    dataKey="value"
                    label={({ percent }) => `${Math.round(percent * 100)}%`}
                    labelLine={false}
                  >
                    {statusDonutData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip formatter={(value, name) => [`${value}`, name]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-3">
                {statusDonutData.map(item => (
                  <div key={item.name} className="flex items-center gap-2 text-sm text-gray-700">
                    <span className="h-2.5 w-2.5" style={{ backgroundColor: item.color }} />
                    <span>{item.name}</span>
                  </div>
                ))}
              </div>
            </div>
            <h3 className="mt-2 text-sm font-bold text-gray-900">Task status - this month</h3>
          </div>

          <div className="bg-white">
            <ResponsiveContainer width="100%" height={230}>
              <BarChart data={workloadBalanceData} barSize={26} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid stroke="#e8eef1" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#617177' }} axisLine={{ stroke: '#9aa4a8' }} tickLine={false} />
                <YAxis domain={[0, 20]} ticks={[0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20]} tick={{ fontSize: 12, fill: '#617177' }} axisLine={{ stroke: '#9aa4a8' }} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }} />
                <Bar dataKey="hours" fill="#078b98" name="Hours" label={{ position: 'top', fill: '#243033', fontSize: 12 }} />
              </BarChart>
            </ResponsiveContainer>
            <h3 className="mt-2 text-sm font-bold text-gray-900">Workload balance - hours per staff</h3>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h3 className="font-semibold text-gray-800">Recent Bookings</h3>
              <button onClick={() => router.push('/manager-bookings')} className="text-blue-500 text-sm hover:underline flex items-center gap-1">View all <ChevronRight className="w-3 h-3" /></button>
            </div>
            <div className="divide-y divide-gray-50">
              {recentTaskRows.map(task => (
                <div
                  key={task.id}
                  className="p-4 transition hover:bg-gray-50"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{task.title}</p>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-xs text-gray-500 flex items-center gap-1"><MapPin className="w-3 h-3" />{task.location}</span>
                        <span className="text-xs text-gray-500">{task.assignee}</span>
                      </div>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ml-3 flex-shrink-0 ${statusColor[task.status]}`}>{task.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <div>
                <h3 className="font-semibold text-gray-800">Staff Availability</h3>
                <p className="mt-1 text-sm text-gray-500">{availableStaffCount} available staff</p>
              </div>
              <button onClick={() => router.push('/manager-availability')} className="text-blue-500 text-sm hover:underline flex items-center gap-1">Live view <ChevronRight className="w-3 h-3" /></button>
            </div>
            <div className="divide-y divide-gray-50">
              {staffRows.map(s => (
                <div
                  key={s.id}
                  className="p-4 transition hover:bg-gray-50"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-green-400 rounded-full flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
                      {s.name.split(' ').map(n => n[0]).join('')}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800">{s.name}</p>
                      <p className="text-xs text-gray-500">{s.role} - {s.tasks} active tasks</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${staffStatusColor[s.status]}`}>{s.status}</span>
                      <span className="text-xs text-yellow-500 flex items-center gap-0.5"><Star className="w-3 h-3 fill-yellow-400" />{s.rating}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  )
}
