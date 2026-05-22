import Layout from '../../../components/Layout'
import { useState } from 'react'
import { FileText, TrendingUp, Users, CheckCircle, Clock, AlertCircle } from 'lucide-react'
import { supabase } from '../../../../lib/supabaseClient'

export default function ManagerReports() {
  const [reportType, setReportType] = useState('daily')
  const [data, setData] = useState(null)

  const generate = async () => {
    const days = reportType === 'daily' ? 1 : reportType === 'weekly' ? 7 : 30
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
    const [{ data: tasks }, { data: staff }, { data: reviews }] = await Promise.all([
      supabase.from('task_requests').select('status,priority,required_skill,assigned_staff_id,staff_profiles(staff_name)').gte('created_at', since),
      supabase.from('staff_profiles').select('id,staff_name,current_workload'),
      supabase.from('performance_reviews').select('rating').gte('created_at', since),
    ])

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
      const category = task.required_skill || 'General'
      acc[category] = (acc[category] || 0) + 1
      return acc
    }, {})
    const avgRating = reviews?.length ? (reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / reviews.length).toFixed(1) : '0.0'

    setData({
      totalTasks,
      completed,
      pending: taskRows.filter(task => task.status === 'pending').length,
      urgent: taskRows.filter(task => task.priority === 'High').length,
      efficiency: totalTasks ? `${Math.round((completed / totalTasks) * 100)}%` : '0%',
      staffUtilization: staffRows.length ? `${Math.round((taskRows.filter(task => task.assigned_staff_id).length / staffRows.length) * 100)}%` : '0%',
      topStaff: topEntry ? `${topEntry[0]} (${topEntry[1]} tasks)` : 'No assigned tasks',
      avgRating,
      tasksByCategory: Object.keys(tasksByCategory).length ? tasksByCategory : { General: 0 },
    })
  }

  return (
    <Layout role="manager">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold">Operational Reports</h1>
        <p className="text-gray-500 text-sm mb-6">Generate daily, weekly, or monthly performance reports with detailed breakdowns.</p>
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <div className="flex gap-2 mb-4">
            {['daily', 'weekly', 'monthly'].map(t => (
              <button key={t} onClick={() => setReportType(t)} className={`px-4 py-2 rounded-lg text-sm font-medium ${reportType === t ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-700'}`}>{t.charAt(0).toUpperCase() + t.slice(1)}</button>
            ))}
          </div>
          <button onClick={generate} className="bg-gradient-to-r from-blue-500 to-green-500 text-white px-4 py-2 rounded-lg flex items-center gap-2"><FileText className="w-4 h-4" /> Generate Report</button>

          {data && (
            <div className="mt-6 space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-gray-50 p-3 rounded-lg"><p className="text-xs text-gray-500">Total Tasks</p><p className="text-xl font-bold">{data.totalTasks}</p></div>
                <div className="bg-gray-50 p-3 rounded-lg"><p className="text-xs text-gray-500">Completed</p><p className="text-xl font-bold text-green-600">{data.completed}</p></div>
                <div className="bg-gray-50 p-3 rounded-lg"><p className="text-xs text-gray-500">Pending</p><p className="text-xl font-bold text-orange-500">{data.pending}</p></div>
                <div className="bg-gray-50 p-3 rounded-lg"><p className="text-xs text-gray-500">Urgent</p><p className="text-xl font-bold text-red-500">{data.urgent}</p></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 p-3 rounded-lg"><p className="text-xs text-gray-500">Efficiency</p><p className="text-lg font-semibold">{data.efficiency}</p><p className="text-xs">(Completed / Total)</p></div>
                <div className="bg-gray-50 p-3 rounded-lg"><p className="text-xs text-gray-500">Staff Utilization</p><p className="text-lg font-semibold">{data.staffUtilization}</p><p className="text-xs">Avg tasks per staff</p></div>
                <div className="bg-gray-50 p-3 rounded-lg"><p className="text-xs text-gray-500">Top Performer</p><p className="text-sm font-medium">{data.topStaff}</p></div>
                <div className="bg-gray-50 p-3 rounded-lg"><p className="text-xs text-gray-500">Average Rating</p><p className="text-lg font-semibold flex items-center gap-1">⭐{data.avgRating}</p></div>
              </div>
              <div className="bg-gray-50 p-3 rounded-lg">
                <p className="text-xs text-gray-500 mb-1">Tasks by Category</p>
                <div className="flex gap-4 text-sm">
                  {Object.entries(data.tasksByCategory).map(([cat, val]) => (<div key={cat}><span className="font-medium">{cat}:</span> {val}</div>))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}
