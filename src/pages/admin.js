import Layout from '../components/Layout'
import { useEffect, useState } from 'react'
import { Shield, AlertTriangle, FileText, Settings, Plus, X, UserPlus } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'

export default function AdminPanel() {
  const [users, setUsers] = useState([])
  const [securityLogs, setSecurityLogs] = useState([])
  const [auditLogs, setAuditLogs] = useState([])
  const [showReset, setShowReset] = useState(null)
  const [showCreate, setShowCreate] = useState(null)
  const [createForm, setCreateForm] = useState({ full_name: '', email: '', password: '', role: 'manager' })
  const [resetPassword, setResetPassword] = useState('')
  const [params, setParams] = useState({ workloadThreshold: 3, proximityRadius: 10, priorityWeights: 10 })
  const [message, setMessage] = useState('')

  const roleLabel = (role) => ({
    manager: 'Manager',
    department_staff: 'Department Staff',
    staff_member: 'Staff Member',
    system_admin: 'System Admin',
  }[role] || role)

  const loadAdminData = async () => {
    const [{ data: profiles }, { data: security }, { data: audit }, { data: systemParams }] = await Promise.all([
      supabase.from('profiles').select('id,full_name,email,role,status,created_at').order('created_at', { ascending: false }),
      supabase.from('security_logs').select('id,email,event_type,details,created_at').order('created_at', { ascending: false }).limit(20),
      supabase.from('audit_logs').select('id,action,details,created_at,profiles(email)').order('created_at', { ascending: false }).limit(20),
      supabase.from('system_parameters').select('*').eq('id', 1).single(),
    ])

    setUsers(profiles || [])
    setSecurityLogs(security || [])
    setAuditLogs(audit || [])
    if (systemParams) {
      setParams({
        workloadThreshold: systemParams.workload_threshold,
        proximityRadius: systemParams.proximity_radius,
        priorityWeights: systemParams.performance_weight,
      })
    }
  }

  useEffect(() => {
    loadAdminData()
  }, [])

  const handleCreate = async (event) => {
    event.preventDefault()
    const { full_name, email, password, role } = createForm
    if (!full_name || !email || !password || !role) {
      setMessage('Please fill in name, email, password, and role.')
      return
    }

    const response = await fetch('/api/admin/create-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ full_name, email, password, role }),
    })
    const result = await response.json()
    setMessage(response.ok ? 'User account created in Supabase.' : result.error)
    if (response.ok) await loadAdminData()
    if (response.ok) setCreateForm({ full_name: '', email: '', password: '', role: 'manager' })
    setShowCreate(null)
  }

  const handleDeactivate = async (id, status) => {
    const nextStatus = status === 'active' ? 'inactive' : 'active'
    const { error } = await supabase.from('profiles').update({ status: nextStatus }).eq('id', id)
    await supabase.from('audit_logs').insert({ user_id: id, action: 'update_user_status', details: `Status changed to ${nextStatus}` })
    setMessage(error ? error.message : `Account ${nextStatus}.`)
    await loadAdminData()
  }

  const handleReset = async (event) => {
    event.preventDefault()
    if (!resetPassword) {
      setMessage('Please enter a new temporary password.')
      return
    }
    const response = await fetch('/api/admin/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: showReset.id, new_password: resetPassword }),
    })
    const result = await response.json()
    setMessage(response.ok ? `Password reset for ${showReset.email}.` : result.error)
    setResetPassword('')
    setShowReset(null)
  }

  const saveParameters = async () => {
    const { error } = await supabase.from('system_parameters').upsert({
      id: 1,
      workload_threshold: Number(params.workloadThreshold),
      proximity_radius: Number(params.proximityRadius),
      performance_weight: Number(params.priorityWeights),
      updated_at: new Date().toISOString(),
    })
    await supabase.from('audit_logs').insert({ action: 'update_system_parameters', details: 'Global system parameters updated' })
    setMessage(error ? error.message : 'Parameters saved to Supabase.')
  }

  return (
    <Layout role="admin">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold">System Administration</h1>
        <p className="text-gray-500 text-sm mb-6">Manage users, monitor security, and configure system settings.</p>
        {message && <div className="mb-4 rounded-lg border bg-blue-50 px-4 py-3 text-sm text-blue-700">{message}</div>}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2"><Shield className="w-5 h-5 text-blue-500" /> User Accounts</h2>
              <button onClick={() => setShowCreate(true)} className="bg-gradient-to-r from-blue-500 to-green-500 text-white p-1 rounded-lg text-xs flex items-center gap-1"><Plus className="w-3 h-3" /> Add User</button>
            </div>
            <div className="space-y-3">
              {users.map(u => (
                <div key={u.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                  <div><p className="font-medium text-sm">{u.full_name}</p><p className="text-xs text-gray-500">{u.email} - {roleLabel(u.role)}</p></div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${u.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{u.status}</span>
                    <button onClick={() => { setShowReset(u); setResetPassword('') }} className="text-blue-500 text-xs">Reset</button>
                    <button onClick={() => handleDeactivate(u.id, u.status)} className="text-red-500 text-xs">{u.status === 'active' ? 'Deactivate' : 'Activate'}</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border p-6">
            <h2 className="text-lg font-semibold flex items-center gap-2 mb-4"><AlertTriangle className="w-5 h-5 text-red-500" /> Security Logs</h2>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {securityLogs.map(log => (
                <div key={log.id} className="flex items-center justify-between text-sm p-2 border-b gap-3">
                  <span className="text-gray-500">{new Date(log.created_at).toLocaleString()}</span>
                  <span>{log.event_type}</span>
                  <span className={log.event_type.includes('failed') ? 'text-red-500' : 'text-green-500'}>{log.email || '-'}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border p-6">
            <h2 className="text-lg font-semibold flex items-center gap-2 mb-4"><FileText className="w-5 h-5 text-purple-500" /> Audit Logs</h2>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {auditLogs.map(log => (
                <div key={log.id} className="text-sm p-2 border-b"><span className="text-gray-500">{new Date(log.created_at).toLocaleString()}</span> - {log.action} by {log.profiles?.email || 'system'}</div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border p-6">
            <h2 className="text-lg font-semibold flex items-center gap-2 mb-4"><Settings className="w-5 h-5 text-gray-700" /> Global Parameters</h2>
            <div className="space-y-3">
              <div><label className="text-sm">Workload Threshold</label><input type="number" value={params.workloadThreshold} onChange={e => setParams({...params, workloadThreshold: e.target.value})} className="w-full border rounded-lg p-2 text-sm" /></div>
              <div><label className="text-sm">Proximity Radius (km)</label><input type="number" value={params.proximityRadius} onChange={e => setParams({...params, proximityRadius: e.target.value})} className="w-full border rounded-lg p-2 text-sm" /></div>
              <div><label className="text-sm">Performance Weight</label><input type="number" value={params.priorityWeights} onChange={e => setParams({...params, priorityWeights: e.target.value})} className="w-full border rounded-lg p-2 text-sm" /></div>
              <button onClick={saveParameters} className="bg-blue-500 text-white px-4 py-2 rounded-lg text-sm">Save Configuration</button>
            </div>
          </div>
        </div>
      </div>

      {showReset && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <form onSubmit={handleReset} className="bg-white rounded-xl max-w-sm w-full p-6">
            <h3 className="text-lg font-semibold">Reset Password</h3>
            <p className="text-sm my-4">Enter a new temporary password for {showReset.email}.</p>
            <input
              type="password"
              value={resetPassword}
              onChange={e => setResetPassword(e.target.value)}
              className="mb-4 w-full rounded-lg border p-2 text-sm"
              placeholder="New temporary password"
            />
            <div className="flex gap-2"><button type="submit" className="flex-1 bg-blue-500 text-white py-2 rounded-lg">Reset</button><button type="button" onClick={() => setShowReset(null)} className="flex-1 bg-gray-200 py-2 rounded-lg">Cancel</button></div>
          </form>
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <form onSubmit={handleCreate} className="bg-white rounded-xl max-w-md w-full p-6">
            <div className="flex justify-between"><h3 className="text-lg font-semibold">Create User Account</h3><button type="button" onClick={() => setShowCreate(null)}><X /></button></div>
            <div className="space-y-3 mt-4">
              <div>
                <label className="text-sm font-medium text-gray-700">Role</label>
                <select value={createForm.role} onChange={e => setCreateForm({ ...createForm, role: e.target.value })} className="mt-1 w-full border rounded-lg p-2 text-sm">
                  <option value="manager">Manager</option>
                  <option value="department_staff">Department Staff</option>
                  <option value="staff_member">Staff Member</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Full Name</label>
                <input value={createForm.full_name} onChange={e => setCreateForm({ ...createForm, full_name: e.target.value })} className="mt-1 w-full border rounded-lg p-2 text-sm" placeholder="Enter full name" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Email</label>
                <input type="email" value={createForm.email} onChange={e => setCreateForm({ ...createForm, email: e.target.value })} className="mt-1 w-full border rounded-lg p-2 text-sm" placeholder="name@example.com" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Temporary Password</label>
                <input type="password" value={createForm.password} onChange={e => setCreateForm({ ...createForm, password: e.target.value })} className="mt-1 w-full border rounded-lg p-2 text-sm" placeholder="Create temporary password" />
              </div>
              <button type="submit" className="w-full bg-gradient-to-r from-blue-500 to-green-500 text-white py-2 rounded-lg flex items-center justify-center gap-2"><UserPlus className="w-4 h-4" /> Create Account</button>
            </div>
          </form>
        </div>
      )}
    </Layout>
  )
}
