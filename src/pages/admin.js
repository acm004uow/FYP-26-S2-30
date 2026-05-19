import Layout from '../components/Layout'
import { useState } from 'react'
import { Shield, AlertTriangle, FileText, Settings, Plus, X, UserPlus } from 'lucide-react'

const initialUsers = [
  { id: 1, name: 'Manager Ahmad', email: 'manager@demo.com', role: 'manager', status: 'Active' },
  { id: 2, name: 'Dept Lee', email: 'dept@demo.com', role: 'department', status: 'Active' },
]

const securityLogs = [
  { id: 1, event: 'Failed login attempt', user: 'unknown', time: '2026-05-17 07:02', status: 'Failed' },
  { id: 2, event: 'Successful login', user: 'manager@demo.com', time: '2026-05-17 09:00', status: 'Success' },
]

const auditLogs = [
  { id: 1, action: 'Task created', user: 'dept@demo.com', time: '2026-05-17 10:15' },
  { id: 2, action: 'Staff profile updated', user: 'manager@demo.com', time: '2026-05-17 11:30' },
]

export default function AdminPanel() {
  const [users, setUsers] = useState(initialUsers)
  const [showReset, setShowReset] = useState(null)
  const [showCreate, setShowCreate] = useState(null)
  const [params, setParams] = useState({ workloadThreshold: 5, proximityRadius: 10, priorityWeights: '1.5x for urgent' })

  const handleCreate = (role) => {
    const name = prompt(`Enter ${role} name`)
    if(name) setUsers([...users, { id: Date.now(), name, email: `${name.toLowerCase()}@demo.com`, role, status: 'Active' }])
    setShowCreate(null)
  }
  const handleDeactivate = (id) => setUsers(users.map(u => u.id === id ? { ...u, status: 'Inactive' } : u))
  const handleReset = (user) => { alert(`Password reset link sent to ${user.email}`); setShowReset(null) }

  return (
    <Layout role="admin">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold">System Administration</h1>
        <p className="text-gray-500 text-sm mb-6">Manage users, monitor security, and configure system settings.</p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <div className="flex justify-between items-center mb-4"><h2 className="text-lg font-semibold flex items-center gap-2"><Shield className="w-5 h-5 text-blue-500" /> User Accounts</h2><button onClick={() => setShowCreate(true)} className="bg-gradient-to-r from-blue-500 to-green-500 text-white p-1 rounded-lg text-xs flex items-center gap-1"><Plus className="w-3 h-3" /> Add User</button></div>
            <div className="space-y-3">
              {users.map(u => (
                <div key={u.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                  <div><p className="font-medium text-sm">{u.name}</p><p className="text-xs text-gray-500">{u.email} • {u.role}</p></div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${u.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{u.status}</span>
                    <button onClick={() => setShowReset(u)} className="text-blue-500 text-xs">Reset</button>
                    <button onClick={() => handleDeactivate(u.id)} className="text-red-500 text-xs">Deactivate</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border p-6">
            <h2 className="text-lg font-semibold flex items-center gap-2 mb-4"><AlertTriangle className="w-5 h-5 text-red-500" /> Security Logs</h2>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {securityLogs.map(log => (
                <div key={log.id} className="flex items-center justify-between text-sm p-2 border-b">
                  <span className="text-gray-500">{log.time}</span><span>{log.event}</span><span className={log.status === 'Failed' ? 'text-red-500' : 'text-green-500'}>{log.status}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border p-6">
            <h2 className="text-lg font-semibold flex items-center gap-2 mb-4"><FileText className="w-5 h-5 text-purple-500" /> Audit Logs</h2>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {auditLogs.map(log => (
                <div key={log.id} className="text-sm p-2 border-b"><span className="text-gray-500">{log.time}</span> – {log.action} by {log.user}</div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border p-6">
            <h2 className="text-lg font-semibold flex items-center gap-2 mb-4"><Settings className="w-5 h-5 text-gray-700" /> Global Parameters</h2>
            <div className="space-y-3">
              <div><label className="text-sm">Workload Threshold</label><input type="number" value={params.workloadThreshold} onChange={e => setParams({...params, workloadThreshold: e.target.value})} className="w-full border rounded-lg p-2 text-sm" /></div>
              <div><label className="text-sm">Proximity Radius (km)</label><input type="number" value={params.proximityRadius} onChange={e => setParams({...params, proximityRadius: e.target.value})} className="w-full border rounded-lg p-2 text-sm" /></div>
              <div><label className="text-sm">Priority Weights</label><input value={params.priorityWeights} onChange={e => setParams({...params, priorityWeights: e.target.value})} className="w-full border rounded-lg p-2 text-sm" /></div>
              <button onClick={() => alert('Parameters saved (simulation)')} className="bg-blue-500 text-white px-4 py-2 rounded-lg text-sm">Save Configuration</button>
            </div>
          </div>
        </div>
      </div>

      {showReset && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-sm w-full p-6">
            <h3 className="text-lg font-semibold">Reset Password</h3>
            <p className="text-sm my-4">Send reset link to {showReset.email}?</p>
            <div className="flex gap-2"><button onClick={() => handleReset(showReset)} className="flex-1 bg-blue-500 text-white py-2 rounded-lg">Send</button><button onClick={() => setShowReset(null)} className="flex-1 bg-gray-200 py-2 rounded-lg">Cancel</button></div>
          </div>
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-sm w-full p-6">
            <div className="flex justify-between"><h3 className="text-lg font-semibold">Create User Account</h3><button onClick={() => setShowCreate(null)}><X /></button></div>
            <div className="space-y-3 mt-4">
              <button onClick={() => handleCreate('manager')} className="w-full border p-2 rounded-lg text-left flex items-center gap-2"><UserPlus className="w-4 h-4" /> Create Manager Account</button>
              <button onClick={() => handleCreate('department')} className="w-full border p-2 rounded-lg text-left flex items-center gap-2"><UserPlus className="w-4 h-4" /> Create Department Staff Account</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}