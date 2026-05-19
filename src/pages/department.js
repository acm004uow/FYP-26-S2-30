import Layout from '../components/Layout'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { Search, X, Bell, CheckCircle, MapPin, Flag, Plus } from 'lucide-react'

const initialRequests = [
  { id: 'R101', title: 'Floor Cleaning', location: 'Level 2', priority: 'High', status: 'Pending', createdAt: '2026-05-17', urgent: true },
  { id: 'R102', title: 'Equipment Check', location: 'Warehouse', priority: 'Medium', status: 'Approved', createdAt: '2026-05-16', urgent: false },
]

const completedHistory = [
  { id: 'R089', title: 'Restroom Sanitizing', location: 'All Floors', completedDate: '2026-05-15', assignedStaff: 'Amy Tan' },
]

export default function DepartmentDashboard() {
  const router = useRouter()
  const [requests, setRequests] = useState(initialRequests)
  const [search, setSearch] = useState('')
  const [notification, setNotification] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [newTask, setNewTask] = useState({ title: '', location: '', priority: 'Medium', urgent: false })

  useEffect(() => {
    // Simulate approval notification
    const timer = setTimeout(() => {
      setNotification('Task R101 has been approved by manager!')
      setTimeout(() => setNotification(null), 5000)
    }, 2000)
    return () => clearTimeout(timer)
  }, [])

  const handleCancel = (id) => {
    setRequests(requests.filter(r => r.id !== id))
    setNotification(`Task ${id} cancelled.`)
    setTimeout(() => setNotification(null), 3000)
  }

  const handleCreate = () => {
    if (!newTask.title || !newTask.location) return
    const newReq = { id: `R${Date.now()}`, ...newTask, status: 'Pending', createdAt: new Date().toISOString().slice(0,10) }
    setRequests([newReq, ...requests])
    setNewTask({ title: '', location: '', priority: 'Medium', urgent: false })
    setShowForm(false)
    setNotification('Task request submitted! Awaiting manager approval.')
    setTimeout(() => setNotification(null), 3000)
  }

  const filtered = requests.filter(r => r.title.toLowerCase().includes(search.toLowerCase()) || r.id.toLowerCase().includes(search.toLowerCase()))

  return (
    <Layout role="department">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <div><h1 className="text-2xl font-bold">My Task Requests</h1><p className="text-gray-500 text-sm">Create and track your tasks</p></div>
          <button onClick={() => setShowForm(true)} className="bg-gradient-to-r from-blue-500 to-green-500 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2"><Plus className="w-4 h-4" /> New Request</button>
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
                  <span className="text-xs font-mono text-gray-400">{req.id}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${req.priority === 'High' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>{req.priority}</span>
                  {req.urgent && <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full flex items-center gap-1"><Flag className="w-3 h-3" /> Urgent</span>}
                </div>
                <p className="font-medium text-gray-800">{req.title}</p>
                <p className="text-xs text-gray-500 flex items-center gap-1 mt-1"><MapPin className="w-3 h-3" /> {req.location} • Created {req.createdAt}</p>
              </div>
              <div className="text-right">
                <span className={`text-xs px-2 py-1 rounded-full ${req.status === 'Pending' ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}`}>{req.status}</span>
                {req.status === 'Pending' && (
                  <button onClick={() => handleCancel(req.id)} className="block mt-2 text-xs text-red-500 hover:underline">Cancel</button>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="p-4 font-semibold border-b bg-gray-50 flex items-center gap-2"><CheckCircle className="w-4 h-4 text-green-500" /> Completion History</div>
          {completedHistory.map(hist => (
            <div key={hist.id} className="p-4 border-b hover:bg-gray-50">
              <p className="text-sm font-medium text-gray-800">{hist.title}</p>
              <p className="text-xs text-gray-500">{hist.location} • Completed {hist.completedDate} by {hist.assignedStaff}</p>
            </div>
          ))}
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-4"><h3 className="text-lg font-semibold">New Task Request</h3><button onClick={() => setShowForm(false)}><X /></button></div>
            <div className="space-y-3">
              <input placeholder="Task Title" value={newTask.title} onChange={e => setNewTask({...newTask, title: e.target.value})} className="w-full border rounded-lg p-2" />
              <input placeholder="Location" value={newTask.location} onChange={e => setNewTask({...newTask, location: e.target.value})} className="w-full border rounded-lg p-2" />
              <select value={newTask.priority} onChange={e => setNewTask({...newTask, priority: e.target.value})} className="w-full border rounded-lg p-2"><option>Low</option><option>Medium</option><option>High</option></select>
              <label className="flex items-center gap-2"><input type="checkbox" checked={newTask.urgent} onChange={e => setNewTask({...newTask, urgent: e.target.checked})} /> Mark as urgent</label>
              <button onClick={handleCreate} className="w-full bg-gradient-to-r from-blue-500 to-green-500 text-white py-2 rounded-lg">Submit Request</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}