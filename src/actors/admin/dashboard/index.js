import Layout from '../../../components/Layout'
import { useEffect, useState } from 'react'
import { UserPlus, X } from 'lucide-react'
import { useRouter } from 'next/router'
import { supabase } from '../../../../lib/supabaseClient'
import AuditLogsPanel from '../audit-logs/AuditLogsPanel'
import ParametersPanel from '../parameters/ParametersPanel'
import SecurityLogsPanel from '../security-logs/SecurityLogsPanel'
import UserAccountsPanel, { roleOptions } from '../users/UserAccountsPanel'

export default function AdminPanel() {
  const router = useRouter()
  const [users, setUsers] = useState([])
  const [securityLogs, setSecurityLogs] = useState([])
  const [auditLogs, setAuditLogs] = useState([])
  const [activeSection, setActiveSection] = useState('users')
  const [showReset, setShowReset] = useState(null)
  const [showCreate, setShowCreate] = useState(null)
  const [statusChangeUser, setStatusChangeUser] = useState(null)
  const [createForm, setCreateForm] = useState({ full_name: '', email: '', password: '', role: 'manager' })
  const [resetPassword, setResetPassword] = useState('')
  const [params, setParams] = useState({ workloadThreshold: 3, proximityRadius: 10, priorityWeights: 10 })
  const [message, setMessage] = useState('')
  const [currentUserId, setCurrentUserId] = useState('')

  const loadAdminData = async () => {
    const [{ data: { user } }, { data: profiles }, { data: security }, { data: audit }, { data: systemParams }] = await Promise.all([
      supabase.auth.getUser(),
      supabase.from('profiles').select('id,full_name,email,role,status,created_at').order('created_at', { ascending: false }),
      supabase.from('security_logs').select('id,email,event_type,details,created_at').order('created_at', { ascending: false }).limit(20),
      supabase.from('audit_logs').select('id,action,details,created_at,profiles(email)').order('created_at', { ascending: false }).limit(20),
      supabase.from('system_parameters').select('*').eq('id', 1).single(),
    ])

    setCurrentUserId(user?.id || '')
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

  const updateUserAccess = async ({ userId, role, status }) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) {
      setMessage('Your admin session has expired. Please log in again.')
      return false
    }

    const response = await fetch('/api/admin/update-role', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ user_id: userId, role, status }),
    })
    const result = await response.json()
    const successMessage = status === 'inactive'
      ? 'User account deactivated. The user can no longer access the system.'
      : status === 'active'
        ? 'User account reactivated.'
        : 'User access updated.'
    setMessage(response.ok ? successMessage : result.error)
    if (response.ok) await loadAdminData()
    return response.ok
  }

  useEffect(() => {
    loadAdminData()
  }, [])

  useEffect(() => {
    const validSections = ['users', 'security', 'audit', 'parameters']
    const section = Array.isArray(router.query.section) ? router.query.section[0] : router.query.section
    setActiveSection(validSections.includes(section) ? section : 'users')
  }, [router.query.section])

  const handleCreate = async (event) => {
    event.preventDefault()
    const { full_name, email, password, role } = createForm
    if (!full_name || !email || !password || !role) {
      setMessage('Please fill in name, email, password, and role.')
      return
    }

    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) {
      setMessage('Your admin session has expired. Please log in again.')
      return
    }

    const response = await fetch('/api/admin/create-user', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ full_name, email, password, role }),
    })
    const result = await response.json()
    setMessage(response.ok ? 'User account created in Supabase.' : result.error)
    if (response.ok) await loadAdminData()
    if (response.ok) setCreateForm({ full_name: '', email: '', password: '', role: 'manager' })
    setShowCreate(null)
  }

  const handleRoleChange = async (id, role) => {
    await updateUserAccess({ userId: id, role })
  }

  const handleToggleStatus = (user) => {
    setStatusChangeUser(user)
  }

  const confirmStatusChange = async () => {
    if (!statusChangeUser) return
    const nextStatus = statusChangeUser.status === 'active' ? 'inactive' : 'active'
    const ok = await updateUserAccess({ userId: statusChangeUser.id, status: nextStatus })
    if (ok) setStatusChangeUser(null)
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

        <div>
          {activeSection === 'users' && (
            <UserAccountsPanel
              users={users}
              onAddUser={() => setShowCreate(true)}
              onResetUser={(user) => { setShowReset(user); setResetPassword('') }}
              onChangeRole={handleRoleChange}
              onToggleStatus={handleToggleStatus}
              currentUserId={currentUserId}
            />
          )}
          {activeSection === 'security' && <SecurityLogsPanel logs={securityLogs} />}
          {activeSection === 'audit' && <AuditLogsPanel logs={auditLogs} />}
          {activeSection === 'parameters' && <ParametersPanel params={params} setParams={setParams} onSave={saveParameters} />}
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

      {statusChangeUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6">
            <div className="flex justify-between gap-4">
              <h3 className="text-lg font-semibold">
                {statusChangeUser.status === 'active' ? 'Deactivate User Account' : 'Reactivate User Account'}
              </h3>
              <button type="button" onClick={() => setStatusChangeUser(null)} aria-label="Close"><X /></button>
            </div>
            <p className="mt-4 text-sm text-gray-600">
              {statusChangeUser.status === 'active'
                ? `${statusChangeUser.full_name} will be signed out on their next protected page load and blocked from future logins.`
                : `${statusChangeUser.full_name} will be allowed to access the system again with their existing role.`}
            </p>
            <div className="mt-4 rounded-lg bg-gray-50 p-3 text-sm">
              <p className="font-medium text-gray-800">{statusChangeUser.email}</p>
              <p className="text-xs text-gray-500">Current status: {statusChangeUser.status}</p>
            </div>
            <div className="mt-6 flex gap-2">
              <button
                type="button"
                onClick={confirmStatusChange}
                className={`flex-1 rounded-lg py-2 text-sm font-medium text-white ${statusChangeUser.status === 'active' ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'}`}
              >
                {statusChangeUser.status === 'active' ? 'Deactivate Account' : 'Reactivate Account'}
              </button>
              <button type="button" onClick={() => setStatusChangeUser(null)} className="flex-1 rounded-lg bg-gray-200 py-2 text-sm font-medium text-gray-700">Cancel</button>
            </div>
          </div>
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
                  {roleOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
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
