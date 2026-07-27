import Layout from '../../../components/Layout'
import { useEffect, useState } from 'react'
import { UserPlus, X } from 'lucide-react'
import { supabase } from '../../../../lib/supabaseClient'
import UserAccountsPanel from '../../admin/users/UserAccountsPanel'

const MANAGER_ROLE_OPTIONS = [
  { value: 'manager', label: 'Manager', permissions: 'Approve requests, assign tasks, manage staff profiles, and view reports.' },
  { value: 'staff_member', label: 'Staff Member', permissions: 'View assigned tasks, update availability, and submit task proof.' },
]

export default function ManagerUserAccounts() {
  const [users, setUsers] = useState([])
  const [message, setMessage] = useState('')
  const [currentUserId, setCurrentUserId] = useState('')
  const [currentBusinessName, setCurrentBusinessName] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState({ full_name: '', email: '', role: 'staff_member' })
  const [statusChangeUser, setStatusChangeUser] = useState(null)

  const loadUsers = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    let { data: currentProfile, error: currentProfileError } = await supabase
      .from('profiles')
      .select('business_name,host_admin_id')
      .eq('id', user?.id)
      .single()

    if (currentProfileError) {
      const fallbackProfile = await supabase
        .from('profiles')
        .select('business_name')
        .eq('id', user?.id)
        .single()
      currentProfile = fallbackProfile.data
    }

    const hostAdminId = currentProfile?.host_admin_id || ''
    const businessName = currentProfile?.business_name || ''
    const baseProfileSelect = 'id,full_name,email,role,status,updated_at,business_name'
    const hostProfileSelect = `${baseProfileSelect},host_admin_id`
    const profileRequests = [
      supabase.from('profiles').select(baseProfileSelect).eq('id', user?.id),
    ]

    if (hostAdminId) {
      profileRequests.push(supabase.from('profiles').select(hostProfileSelect).eq('host_admin_id', hostAdminId))
    }

    if (businessName) {
      profileRequests.push(supabase.from('profiles').select(baseProfileSelect).eq('business_name', businessName))
    }

    const results = await Promise.all(profileRequests)
    const error = results.find(result => result.error)?.error
    if (error) setMessage(error.message)

    const profilesById = new Map()
    results.forEach(({ data, error }) => {
      if (error) return
      ;(data || []).forEach(profile => profilesById.set(profile.id, profile))
    })
    const profiles = Array.from(profilesById.values())
      .filter(profile => profile.role !== 'system_admin')
      .sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''))

    setCurrentUserId(user?.id || '')
    setCurrentBusinessName(businessName)
    setUsers(profiles)
  }

  useEffect(() => {
    loadUsers()
  }, [])

  const handleChangeRole = async (id, role) => {
    const { error } = await supabase.from('profiles').update({ role, updated_at: new Date().toISOString() }).eq('id', id)
    setMessage(error ? error.message : 'User role updated.')
    if (!error) {
      await supabase.from('audit_logs').insert({ user_id: id, action: 'update_user_role', details: `Role changed to ${role}` })
      await loadUsers()
    }
  }

  const handleToggleStatus = (user) => {
    setStatusChangeUser(user)
  }

  const confirmStatusChange = async () => {
    if (!statusChangeUser) return
    const nextStatus = statusChangeUser.status === 'active' ? 'inactive' : 'active'
    const { error } = await supabase.from('profiles').update({ status: nextStatus, updated_at: new Date().toISOString() }).eq('id', statusChangeUser.id)
    setMessage(error ? error.message : `User account ${nextStatus === 'active' ? 'reactivated' : 'deactivated'}.`)
    if (!error) {
      await supabase.from('audit_logs').insert({ user_id: statusChangeUser.id, action: 'update_user_status', details: `Status changed to ${nextStatus}` })
      await loadUsers()
    }
    setStatusChangeUser(null)
  }

  const handleCreate = async (event) => {
    event.preventDefault()
    const { full_name, email, role } = createForm
    if (!full_name || !email || !role) {
      setMessage('Please fill in name, email, and role.')
      return
    }

    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) {
      setMessage('Your session has expired. Please log in again.')
      return
    }

    const response = await fetch('/api/admin/create-user', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ full_name, email, role, business_name: currentBusinessName || undefined }),
    })
    const result = await response.json()
    if (!response.ok) {
      setMessage(result.error || 'Invitation could not be sent.')
      return
    }

    setMessage('Invitation sent. The user can set their own password from the email link.')
    await loadUsers()
    setCreateForm({ full_name: '', email: '', role: 'staff_member' })
    setShowCreate(false)
  }

  return (
    <Layout role="manager">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">User Accounts</h1>
          <p className="text-gray-500 text-sm mt-1">Manage system access and permissions</p>
        </div>
        {message && <div className="mb-4 rounded-lg border bg-blue-50 px-4 py-3 text-sm text-blue-700">{message}</div>}

        <UserAccountsPanel
          users={users}
          onAddUser={() => setShowCreate(true)}
          onResetUser={() => {}}
          onChangeRole={handleChangeRole}
          onToggleStatus={handleToggleStatus}
          onSetManager={() => {}}
          onSetBasicSalary={() => {}}
          currentUserId={currentUserId}
          roleOptions={MANAGER_ROLE_OPTIONS}
          canResetPassword={false}
        />
      </div>

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
            <div className="flex justify-between"><h3 className="text-lg font-semibold">Invite User Account</h3><button type="button" onClick={() => setShowCreate(false)}><X /></button></div>
            {message && <div className="mt-4 rounded-lg border bg-blue-50 px-4 py-3 text-sm text-blue-700">{message}</div>}
            <div className="space-y-3 mt-4">
              <div>
                <label className="text-sm font-medium text-gray-700">Role</label>
                <select value={createForm.role} onChange={e => setCreateForm({ ...createForm, role: e.target.value })} className="mt-1 w-full border rounded-lg p-2 text-sm">
                  {MANAGER_ROLE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Full Name</label>
                <input value={createForm.full_name} onChange={e => setCreateForm({ ...createForm, full_name: e.target.value })} className="mt-1 w-full border rounded-lg p-2 text-sm" placeholder="Enter full name" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Email</label>
                <input type="email" value={createForm.email} onChange={e => setCreateForm({ ...createForm, email: e.target.value })} className="mt-1 w-full border rounded-lg p-2 text-sm" placeholder="someone@gmail.com" />
              </div>
              <button type="submit" className="w-full bg-gradient-to-r from-blue-500 to-green-500 text-white py-2 rounded-lg flex items-center justify-center gap-2"><UserPlus className="w-4 h-4" /> Send Invite</button>
            </div>
          </form>
        </div>
      )}
    </Layout>
  )
}
