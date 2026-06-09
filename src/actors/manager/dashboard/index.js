import Layout from '../../../components/Layout'
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import {
  Users, ClipboardList, CheckCircle, Clock, TrendingUp,
  MapPin, Star, ChevronRight
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts'
import { supabase } from '../../../../lib/supabaseClient'

const statusColor = {
  'Completed': 'bg-green-100 text-green-700',
  'In Progress': 'bg-blue-100 text-blue-700',
  'Pending': 'bg-yellow-100 text-yellow-700',
  'Approved': 'bg-green-100 text-green-700',
  'Rejected': 'bg-red-100 text-red-700',
  'Cancelled': 'bg-gray-100 text-gray-600',
}

const priorityColor = {
  'High': 'bg-red-100 text-red-600',
  'Medium': 'bg-orange-100 text-orange-600',
  'Low': 'bg-gray-100 text-gray-600',
}

const staffStatusColor = {
  'Available': 'bg-green-100 text-green-700',
  'Busy': 'bg-blue-100 text-blue-700',
  'On Leave': 'bg-gray-100 text-gray-600',
}

export default function ManagerDashboard() {
  const router = useRouter()
  const [stats, setStats] = useState([
    { label: 'Total Staff', value: '0', icon: Users, bg: 'bg-blue-50', text: 'text-blue-600', sub: '0 available today' },
    { label: 'Active Tasks', value: '0', icon: ClipboardList, bg: 'bg-green-50', text: 'text-green-600', sub: 'From Supabase' },
    { label: 'Completed', value: '0', icon: CheckCircle, bg: 'bg-purple-50', text: 'text-purple-600', sub: 'All time' },
    { label: 'Pending', value: '0', icon: Clock, bg: 'bg-orange-50', text: 'text-orange-600', sub: 'Need attention' },
  ])
  const [recentTaskRows, setRecentTaskRows] = useState([])
  const [staffRows, setStaffRows] = useState([])
  const [taskBarData, setTaskBarData] = useState([])
  const [pieData, setPieData] = useState([])

  useEffect(() => {
    async function loadDashboard() {
      const [{ data: staff }, { data: tasks }] = await Promise.all([
        supabase.from('staff_profiles').select('id,staff_name,skills,availability,current_workload,performance_rating,assigned_region,status,is_suspended').limit(8),
        supabase.from('task_requests').select('id,title,location,status,priority,created_at,staff_profiles(staff_name)').order('created_at', { ascending: false }).limit(30),
      ])

      const staffData = staff || []
      const taskData = tasks || []
      const activeTasks = taskData.filter(t => !['completed', 'cancelled', 'rejected'].includes(t.status))
      const completedTasks = taskData.filter(t => t.status === 'completed')
      const pendingTasks = taskData.filter(t => t.status === 'pending')

      setStats([
        { label: 'Total Staff', value: String(staffData.length), icon: Users, bg: 'bg-blue-50', text: 'text-blue-600', sub: `${staffData.filter(s => s.availability === 'available' && !s.is_suspended).length} available today` },
        { label: 'Active Tasks', value: String(activeTasks.length), icon: ClipboardList, bg: 'bg-green-50', text: 'text-green-600', sub: 'From Supabase' },
        { label: 'Completed', value: String(completedTasks.length), icon: CheckCircle, bg: 'bg-purple-50', text: 'text-purple-600', sub: 'Recent records' },
        { label: 'Pending', value: String(pendingTasks.length), icon: Clock, bg: 'bg-orange-50', text: 'text-orange-600', sub: 'Need attention' },
      ])
      setRecentTaskRows(taskData.slice(0, 8).map(t => ({
        id: t.id.slice(0, 8),
        title: t.title,
        location: t.location,
        assignee: t.staff_profiles?.staff_name || 'Unassigned',
        status: t.status === 'in_progress' ? 'In Progress' : t.status.replace('_', ' ').replace(/^\w/, c => c.toUpperCase()),
        priority: t.priority,
      })))
      setStaffRows(staffData.map(s => ({
        name: s.staff_name,
        role: s.skills?.[0] || 'Staff Member',
        status: s.is_suspended ? 'On Leave' : s.availability === 'available' ? 'Available' : 'Busy',
        tasks: s.current_workload || 0,
        rating: s.performance_rating || 0,
      })))
      setTaskBarData(buildWeeklyTaskData(taskData))
      setPieData([
        { name: 'Completed', value: completedTasks.length, color: '#22c55e' },
        { name: 'In Progress', value: taskData.filter(t => t.status === 'in_progress').length, color: '#3b82f6' },
        { name: 'Pending', value: pendingTasks.length, color: '#f59e0b' },
      ].filter(item => item.value > 0))
    }
    loadDashboard()
  }, [])

  const buildWeeklyTaskData = (tasks) => {
    const days = [...Array(7)].map((_, index) => {
      const date = new Date()
      date.setDate(date.getDate() - (6 - index))
      return {
        key: date.toISOString().slice(0, 10),
        day: date.toLocaleDateString(undefined, { weekday: 'short' }),
        completed: 0,
        pending: 0,
      }
    })

    tasks.forEach(task => {
      const key = new Date(task.created_at).toISOString().slice(0, 10)
      const day = days.find(item => item.key === key)
      if (!day) return
      if (task.status === 'completed') day.completed += 1
      if (task.status === 'pending') day.pending += 1
    })

    return days
  }

  return (
    <Layout role="manager">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Manager Dashboard</h1>
            <p className="text-gray-500 text-sm mt-1">Welcome back! Here's an overview of today's operations.</p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => router.push('/tasks/create')}
              className="px-4 py-2 bg-gradient-to-r from-blue-500 to-green-500 text-white rounded-lg text-sm font-medium hover:from-blue-600 hover:to-green-600 transition shadow-sm">
              + Create Task
            </button>
            <button onClick={() => router.push('/staff')}
              className="px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition">
              Manage Staff
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {stats.map(stat => (
            <div key={stat.label} className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
              <div className="flex items-center justify-between mb-3">
                <div className={`w-10 h-10 ${stat.bg} rounded-xl flex items-center justify-center`}>
                  <stat.icon className={`w-5 h-5 ${stat.text}`} />
                </div>
                <TrendingUp className="w-4 h-4 text-green-500" />
              </div>
              <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
              <p className="text-sm font-medium text-gray-600">{stat.label}</p>
              <p className="text-xs text-gray-400 mt-1">{stat.sub}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <div className="lg:col-span-2 bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <h3 className="font-semibold text-gray-800 mb-4">Weekly Task Overview</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={taskBarData} barSize={18}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="day" tick={{ fontSize: 12, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }} />
                <Bar dataKey="completed" fill="#22c55e" radius={[4, 4, 0, 0]} name="Completed" />
                <Bar dataKey="pending" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Pending" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <h3 className="font-semibold text-gray-800 mb-4">Task Status</h3>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={pieData.length ? pieData : [{ name: 'No tasks', value: 1, color: '#e5e7eb' }]} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={3} dataKey="value">
                  {(pieData.length ? pieData : [{ color: '#e5e7eb' }]).map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Legend iconSize={10} iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h3 className="font-semibold text-gray-800">Recent Tasks</h3>
              <button onClick={() => router.push('/manager-task-requests')} className="text-blue-500 text-sm hover:underline flex items-center gap-1">View all <ChevronRight className="w-3 h-3" /></button>
            </div>
            <div className="divide-y divide-gray-50">
              {recentTaskRows.map(task => (
                <div key={task.id} className="p-4 hover:bg-gray-50 transition">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-mono text-gray-400">{task.id}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${priorityColor[task.priority]}`}>{task.priority}</span>
                      </div>
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
              <h3 className="font-semibold text-gray-800">Staff Availability</h3>
              <button onClick={() => router.push('/manager-availability')} className="text-blue-500 text-sm hover:underline flex items-center gap-1">Live view <ChevronRight className="w-3 h-3" /></button>
            </div>
            <div className="divide-y divide-gray-50">
              {staffRows.map(s => (
                <div key={s.name} className="p-4 hover:bg-gray-50 transition">
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
