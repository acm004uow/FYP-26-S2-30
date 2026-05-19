import Layout from '../components/Layout'
import { useState } from 'react'
import { FileText, TrendingUp, Users, CheckCircle, Clock, AlertCircle } from 'lucide-react'

export default function ManagerReports() {
  const [reportType, setReportType] = useState('daily')
  const [data, setData] = useState(null)

  const generate = () => {
    if (reportType === 'daily') {
      setData({
        totalTasks: 24, completed: 18, pending: 6, urgent: 3,
        efficiency: '75%', staffUtilization: '68%',
        topStaff: 'John Smith (5 tasks)', lowStaff: 'Emma Wong (1 task)',
        avgRating: 4.7, tasksByCategory: { Maintenance: 8, Cleaning: 10, Inspection: 6 }
      })
    } else if (reportType === 'weekly') {
      setData({
        totalTasks: 142, completed: 118, pending: 24, urgent: 12,
        efficiency: '83%', staffUtilization: '79%',
        topStaff: 'Sarah Lee (28 tasks)', lowStaff: 'Mike Chan (12 tasks)',
        avgRating: 4.8, tasksByCategory: { Maintenance: 45, Cleaning: 52, Inspection: 45 }
      })
    } else {
      setData({
        totalTasks: 560, completed: 502, pending: 58, urgent: 45,
        efficiency: '90%', staffUtilization: '85%',
        topStaff: 'John Smith (112 tasks)', lowStaff: 'Emma Wong (48 tasks)',
        avgRating: 4.9, tasksByCategory: { Maintenance: 180, Cleaning: 210, Inspection: 170 }
      })
    }
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