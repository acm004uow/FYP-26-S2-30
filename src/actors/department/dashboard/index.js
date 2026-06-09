import Layout from '../../../components/Layout'
import { useEffect, useState } from 'react'
import { Search, X, Bell, CheckCircle, MapPin, Flag, Plus, Edit3 } from 'lucide-react'
import { useRouter } from 'next/router'
import { supabase } from '../../../../lib/supabaseClient'

export default function DepartmentDashboard() {
  const router = useRouter()
  const [requests, setRequests] = useState([])
  const [completedHistory, setCompletedHistory] = useState([])
  const [search, setSearch] = useState('')
  const [notification, setNotification] = useState(null)
  const [editTask, setEditTask] = useState(null)

  const titleCase = (value) => value.replace('_', ' ').replace(/^\w/, c => c.toUpperCase())

  const formatTask = (task) => ({
    id: task.id,
    title: task.title,
    location: task.location,
    description: task.description || '',
    requiredSkill: task.required_skill || 'General',
    instructions: task.instructions || '',
    priority: task.priority,
    status: titleCase(task.status),
    rawStatus: task.status,
    createdAt: new Date(task.created_at).toISOString().slice(0, 10),
    dueAt: task.scheduled_end ? new Date(task.scheduled_end).toISOString().slice(0, 16) : '',
    urgent: task.priority?.toLowerCase() === 'high',
    assignedStaff: task.staff_profiles?.staff_name || 'Unassigned',
  })

  const loadRequests = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const query = supabase
      .from('task_requests')
      .select('id,title,description,location,required_skill,priority,status,instructions,scheduled_end,created_at,staff_profiles(staff_name)')
      .order('created_at', { ascending: false })

    const { data } = user ? await query.eq('created_by', user.id) : await query
    const rows = (data || []).map(formatTask)
    setRequests(rows.filter(task => !['Completed', 'Cancelled'].includes(task.status)))
    setCompletedHistory(rows.filter(task => task.status === 'Completed'))
  }

  useEffect(() => {
    let channel = null

    loadRequests()

    async function subscribeToUpdates() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      channel = supabase
        .channel(`department-task-updates-${user.id}-${Date.now()}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'task_requests', filter: `created_by=eq.${user.id}` },
          (payload) => {
            const oldStatus = payload.old?.status
            const nextStatus = payload.new?.status
            if (oldStatus !== nextStatus && ['approved', 'rejected', 'completed', 'cancelled'].includes(nextStatus)) {
              setNotification(`${payload.new.title || 'Your task request'} is now ${titleCase(nextStatus)}.`)
              setTimeout(() => setNotification(null), 4000)
            }
            loadRequests()
          }
        )
        .subscribe()
    }

    subscribeToUpdates()

    return () => {
      if (channel) supabase.removeChannel(channel)
    }
  }, [])

  const handleCancel = async (id) => {
    await supabase.from('task_requests').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', id).eq('status', 'pending')
    await supabase.from('audit_logs').insert({ action: 'cancel_task_request', details: `Task ${id}` })
    await loadRequests()
    setNotification(`Task ${id.slice(0, 8)} cancelled.`)
    setTimeout(() => setNotification(null), 3000)
  }

  const handleUpdate = async (event) => {
    event.preventDefault()
    if (!editTask || editTask.rawStatus !== 'pending') return
    const scheduledEnd = editTask.dueAt ? new Date(editTask.dueAt).toISOString() : null
    const priority = editTask.urgent ? 'High' : editTask.priority
    const { error } = await supabase.from('task_requests').update({
      title: editTask.title,
      description: editTask.description,
      location: editTask.location,
      required_skill: editTask.requiredSkill,
      priority,
      instructions: editTask.instructions,
      scheduled_end: scheduledEnd,
      updated_at: new Date().toISOString(),
    }).eq('id', editTask.id).eq('status', 'pending')
    await supabase.from('audit_logs').insert({ action: 'update_task_request', details: editTask.title })
    setEditTask(null)
    await loadRequests()
    setNotification(error ? error.message : 'Task request updated.')
    setTimeout(() => setNotification(null), 3000)
  }

  const filtered = requests.filter(r => [
    r.title,
    r.id,
    r.location,
    r.status,
    r.assignedStaff,
  ].some(value => String(value || '').toLowerCase().includes(search.toLowerCase())))

  return (
    <Layout role="department">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <div><h1 className="text-2xl font-bold">My Task Requests</h1><p className="text-gray-500 text-sm">Create and track your tasks</p></div>
          <button onClick={() => router.push('/tasks/create?role=dept')} className="bg-gradient-to-r from-blue-500 to-green-500 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2"><Plus className="w-4 h-4" /> New Request</button>
        </div>

        {notification && (
          <div className="mb-4 p-3 bg-blue-50 text-blue-700 rounded-lg flex items-center gap-2 border-l-4 border-blue-500">
            <Bell className="w-4 h-4" /> {notification}
          </div>
        )}

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by title or ID..." className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm" />
        </div>

        <div className="bg-white rounded-xl shadow-sm border overflow-hidden mb-8">
          <div className="p-4 font-semibold border-b bg-gray-50">Active Requests</div>
          {filtered.length === 0 && <div className="p-8 text-center text-gray-400">No requests found.</div>}
          {filtered.map(req => (
            <div key={req.id} className="p-4 border-b hover:bg-gray-50 flex justify-between items-center">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-mono text-gray-400">{req.id.slice(0, 8)}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${req.priority === 'High' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>{req.priority}</span>
                  {req.urgent && <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full flex items-center gap-1"><Flag className="w-3 h-3" /> Urgent</span>}
                </div>
                <p className="font-medium text-gray-800">{req.title}</p>
                <p className="text-xs text-gray-500 flex items-center gap-1 mt-1"><MapPin className="w-3 h-3" /> {req.location} - Created {req.createdAt}</p>
                <p className="text-xs text-gray-500 mt-1">Assigned staff: {req.assignedStaff}</p>
              </div>
              <div className="text-right">
                <span className={`text-xs px-2 py-1 rounded-full ${req.status === 'Pending' ? 'bg-yellow-100 text-yellow-700' : req.status === 'Rejected' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>{req.status}</span>
                {req.status === 'Pending' && (
                  <div className="mt-2 flex justify-end gap-3">
                    <button onClick={() => setEditTask(req)} className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"><Edit3 className="h-3 w-3" /> Edit</button>
                    <button onClick={() => handleCancel(req.id)} className="text-xs text-red-500 hover:underline">Cancel</button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="p-4 font-semibold border-b bg-gray-50 flex items-center gap-2"><CheckCircle className="w-4 h-4 text-green-500" /> Completion History</div>
          {completedHistory.length === 0 && <div className="p-8 text-center text-gray-400">No completed tasks yet.</div>}
          {completedHistory.map(hist => (
            <div key={hist.id} className="p-4 border-b hover:bg-gray-50">
              <p className="text-sm font-medium text-gray-800">{hist.title}</p>
              <p className="text-xs text-gray-500">{hist.location} - Completed {hist.createdAt} by {hist.assignedStaff}</p>
            </div>
          ))}
        </div>
      </div>

      {editTask && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <form onSubmit={handleUpdate} className="bg-white rounded-xl max-w-lg w-full p-6">
            <div className="flex justify-between items-center mb-4"><h3 className="text-lg font-semibold">Update Task Request</h3><button type="button" onClick={() => setEditTask(null)}><X /></button></div>
            <div className="space-y-3">
              <input required placeholder="Task Title" value={editTask.title} onChange={e => setEditTask({...editTask, title: e.target.value})} className="w-full border rounded-lg p-2 text-sm" />
              <textarea placeholder="Description" value={editTask.description} onChange={e => setEditTask({...editTask, description: e.target.value})} className="w-full border rounded-lg p-2 text-sm resize-none" rows={3} />
              <input required placeholder="Location" value={editTask.location} onChange={e => setEditTask({...editTask, location: e.target.value})} className="w-full border rounded-lg p-2 text-sm" />
              <input placeholder="Required skill" value={editTask.requiredSkill} onChange={e => setEditTask({...editTask, requiredSkill: e.target.value})} className="w-full border rounded-lg p-2 text-sm" />
              <div className="grid grid-cols-2 gap-3">
                <select value={editTask.priority} onChange={e => setEditTask({...editTask, priority: e.target.value, urgent: e.target.value === 'High' ? editTask.urgent : false})} className="w-full border rounded-lg p-2 text-sm"><option>Low</option><option>Medium</option><option>High</option></select>
                <input type="datetime-local" value={editTask.dueAt} onChange={e => setEditTask({...editTask, dueAt: e.target.value})} className="w-full border rounded-lg p-2 text-sm" />
              </div>
              <textarea placeholder="Additional instructions" value={editTask.instructions} onChange={e => setEditTask({...editTask, instructions: e.target.value})} className="w-full border rounded-lg p-2 text-sm resize-none" rows={2} />
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editTask.urgent} onChange={e => setEditTask({...editTask, urgent: e.target.checked})} /> Mark as urgent</label>
              <button type="submit" className="w-full bg-gradient-to-r from-blue-500 to-green-500 text-white py-2 rounded-lg">Save Changes</button>
            </div>
          </form>
        </div>
      )}
    </Layout>
  )
}
