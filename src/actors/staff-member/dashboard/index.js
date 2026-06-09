import Layout from '../../../components/Layout'
import { useEffect, useState } from 'react'
import { MapPin, Clock, CheckCircle, Star, X, Eye, Bell, ChevronRight } from 'lucide-react'
import { supabase } from '../../../../lib/supabaseClient'

const statusColor = { 'In Progress': 'bg-blue-100 text-blue-700', 'Pending': 'bg-yellow-100 text-yellow-700', 'Completed': 'bg-green-100 text-green-700', 'Approved': 'bg-green-100 text-green-700' }
const priorityColor = { 'High': 'border-l-red-500', 'Medium': 'border-l-orange-400', 'Low': 'border-l-gray-300' }

export default function StaffMemberDashboard() {
  const [availability, setAvailability] = useState('Available')
  const [profile, setProfile] = useState(null)
  const [myTasks, setMyTasks] = useState([])
  const [completedTasks, setCompletedTasks] = useState([])
  const [selectedTask, setSelectedTask] = useState(null)
  const [activeTab, setActiveTab] = useState('active')
  const [showProofModal, setShowProofModal] = useState(false)
  const [proofTask, setProofTask] = useState(null)
  const [notification, setNotification] = useState(null)

  const titleCase = (value) => value === 'in_progress' ? 'In Progress' : value.replace('_', ' ').replace(/^\w/, c => c.toUpperCase())

  const formatTask = (task) => ({
    id: task.id,
    title: task.title,
    location: task.location,
    due: task.scheduled_end ? new Date(task.scheduled_end).toLocaleString() : 'No due date',
    priority: task.priority,
    status: titleCase(task.status),
    description: task.description || '',
    supervisor: task.profiles?.full_name || 'Manager',
    rating: task.performance_reviews?.[0]?.rating || 0,
    feedback: task.performance_reviews?.[0]?.feedback || 'No feedback yet',
  })

  const loadDashboard = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: staffProfile } = await supabase.from('staff_profiles').select('*').eq('user_id', user?.id).single()
    setProfile(staffProfile)
    if (!staffProfile) return
    setAvailability(staffProfile.availability === 'available' ? 'Available' : 'Unavailable')
    const { data: tasks } = await supabase
      .from('task_requests')
      .select('id,title,location,scheduled_end,priority,status,description,profiles(full_name),performance_reviews(rating,feedback)')
      .eq('assigned_staff_id', staffProfile.id)
      .order('created_at', { ascending: false })
    const rows = (tasks || []).map(formatTask)
    setMyTasks(rows.filter(task => task.status !== 'Completed'))
    setCompletedTasks(rows.filter(task => task.status === 'Completed'))
  }

  useEffect(() => {
    loadDashboard()
  }, [])

  const handleStartTask = async (taskId) => {
    await supabase.from('task_requests').update({ status: 'in_progress', updated_at: new Date().toISOString() }).eq('id', taskId)
    await supabase.from('audit_logs').insert({ action: 'start_task', details: `Task ${taskId}` })
    await loadDashboard()
    setNotification('Task started.')
    setTimeout(() => setNotification(null), 2000)
  }

  const handleCompleteTask = (taskId) => {
    setProofTask(myTasks.find(t => t.id === taskId))
    setShowProofModal(true)
  }

  const handleUploadProof = async () => {
    if (!proofTask) return
    await supabase.from('task_requests').update({ status: 'completed', updated_at: new Date().toISOString() }).eq('id', proofTask.id)
    await supabase.from('audit_logs').insert({ action: 'complete_task', details: `Task ${proofTask.id}` })
    await loadDashboard()
    setShowProofModal(false)
    setProofTask(null)
    setNotification('Task completed.')
    setTimeout(() => setNotification(null), 2000)
  }

  const toggleAvailability = async () => {
    const next = availability === 'Available' ? 'unavailable' : 'available'
    if (profile) {
      await supabase.from('staff_profiles').update({ availability: next, updated_at: new Date().toISOString() }).eq('id', profile.id)
      const { data: managers } = await supabase.from('profiles').select('id').eq('role', 'manager').eq('status', 'active')
      const nextLabel = next === 'available' ? 'available' : 'unavailable'
      const notifications = (managers || []).map(manager => ({
        user_id: manager.id,
        title: 'Staff availability changed',
        message: `${profile.staff_name || 'A staff member'} is now ${nextLabel}.`,
      }))
      if (notifications.length) await supabase.from('notifications').insert(notifications)
      await supabase.from('audit_logs').insert({ action: 'update_availability', details: `${profile.staff_name || profile.id} set ${nextLabel}` })
    }
    setAvailability(next === 'available' ? 'Available' : 'Unavailable')
    setNotification(`Availability updated to ${next === 'available' ? 'Available' : 'Unavailable'}.`)
    setTimeout(() => setNotification(null), 2000)
  }

  const avgRating = completedTasks.length
    ? (completedTasks.reduce((sum, task) => sum + Number(task.rating || 0), 0) / completedTasks.length).toFixed(1)
    : Number(profile?.performance_rating || 0).toFixed(1)

  return (
    <Layout role="staffMember">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {notification && (
          <div className="mb-4 p-3 bg-blue-50 text-blue-700 rounded-lg flex items-center gap-2 border-l-4 border-blue-500">
            <Bell className="w-4 h-4" /> {notification}
          </div>
        )}

        <div className="bg-gradient-to-r from-blue-500 to-green-500 rounded-2xl p-6 text-white mb-6 shadow-lg">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-blue-100 text-sm">Good Morning,</p>
              <h1 className="text-2xl font-bold">{profile?.staff_name || 'Staff Member'}</h1>
              <p className="text-blue-100 text-sm mt-1">{profile?.skills?.[0] || 'Staff'} - {profile?.assigned_region || 'No region'}</p>
            </div>
            <div className="text-right">
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-2 h-2 rounded-full ${availability === 'Available' ? 'bg-green-300' : 'bg-red-300'}`} />
                <span className="text-sm font-medium">{availability}</span>
              </div>
              <button onClick={toggleAvailability} className="text-xs bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-full transition">
                Toggle Status
              </button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 mt-6 pt-4 border-t border-white/20">
            <div className="text-center"><p className="text-2xl font-bold">{myTasks.length}</p><p className="text-blue-100 text-xs">Active Tasks</p></div>
            <div className="text-center"><p className="text-2xl font-bold">{completedTasks.length}</p><p className="text-blue-100 text-xs">Completed</p></div>
            <div className="text-center"><p className="text-2xl font-bold">{avgRating}</p><p className="text-blue-100 text-xs flex items-center justify-center gap-1"><Star className="w-3 h-3 fill-yellow-300 text-yellow-300" />Rating</p></div>
          </div>
        </div>

        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-6">
          <button onClick={() => setActiveTab('active')} className={`flex-1 py-2 rounded-lg text-sm font-medium ${activeTab === 'active' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'}`}>Active Tasks ({myTasks.length})</button>
          <button onClick={() => setActiveTab('completed')} className={`flex-1 py-2 rounded-lg text-sm font-medium ${activeTab === 'completed' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'}`}>Completed ({completedTasks.length})</button>
        </div>

        {activeTab === 'active' && (
          <div className="space-y-4">
            {myTasks.length === 0 && <div className="bg-white rounded-xl border p-8 text-center text-gray-400">No active tasks assigned.</div>}
            {myTasks.map(task => (
              <div key={task.id} onClick={() => setSelectedTask(selectedTask?.id === task.id ? null : task)} className={`bg-white rounded-xl shadow-sm border-l-4 border border-gray-100 p-5 cursor-pointer hover:shadow-md transition ${priorityColor[task.priority] || priorityColor.Low}`}>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-mono text-gray-400">{task.id.slice(0, 8)}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[task.status] || statusColor.Pending}`}>{task.status}</span>
                    </div>
                    <h3 className="font-semibold text-gray-800 text-sm">{task.title}</h3>
                    <div className="flex items-center gap-4 mt-2">
                      <span className="text-xs text-gray-500 flex items-center gap-1"><MapPin className="w-3 h-3" />{task.location}</span>
                      <span className="text-xs text-gray-500 flex items-center gap-1"><Clock className="w-3 h-3" />{task.due}</span>
                    </div>
                  </div>
                  <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${selectedTask?.id === task.id ? 'rotate-90' : ''}`} />
                </div>
                {selectedTask?.id === task.id && (
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <p className="text-sm text-gray-600 mb-3">{task.description}</p>
                    <p className="text-xs text-gray-500 mb-4">Assigned by: {task.supervisor}</p>
                    <div className="flex gap-3">
                      {['Pending', 'Approved'].includes(task.status) && <button onClick={() => handleStartTask(task.id)} className="flex-1 py-2 bg-gradient-to-r from-blue-500 to-green-500 text-white rounded-lg text-sm font-medium">Start Task</button>}
                      {task.status === 'In Progress' && <button onClick={() => handleCompleteTask(task.id)} className="flex-1 py-2 bg-gradient-to-r from-green-500 to-teal-500 text-white rounded-lg text-sm font-medium">Mark Complete</button>}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {activeTab === 'completed' && (
          <div className="space-y-3">
            {completedTasks.length === 0 && <div className="bg-white rounded-xl border p-8 text-center text-gray-400">No completed tasks yet.</div>}
            {completedTasks.map(task => (
              <div key={task.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center"><CheckCircle className="w-5 h-5 text-green-500" /></div>
                  <div className="flex-1"><p className="text-sm font-semibold text-gray-800">{task.title}</p><p className="text-xs text-gray-500">{task.location} - {task.due}</p></div>
                  <button onClick={() => alert(`Feedback: ${task.feedback}\nRating: ${task.rating}/5`)} className="text-xs text-blue-500"><Eye className="w-4 h-4" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showProofModal && proofTask && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-sm w-full p-6">
            <div className="flex justify-between items-center mb-4"><h3 className="font-semibold">Confirm Completion</h3><button onClick={() => setShowProofModal(false)}><X className="w-5 h-5" /></button></div>
            <p className="text-sm text-gray-600 mb-4">Task: {proofTask.title}</p>
            <input type="file" accept="image/*" className="mb-4 text-sm" />
            <button onClick={handleUploadProof} className="w-full py-2 bg-blue-500 text-white rounded-lg text-sm">Complete Task</button>
          </div>
        </div>
      )}
    </Layout>
  )
}
