import { KeyRound, Plus, Shield, UserCheck, UserMinus } from 'lucide-react'

export const roleOptions = [
  {
    value: 'manager',
    label: 'Manager',
    permissions: 'Approve requests, assign tasks, manage staff profiles, and view reports.',
  },
  {
    value: 'department_staff',
    label: 'Department Staff',
    permissions: 'Create task requests and track department task history.',
  },
  {
    value: 'staff_member',
    label: 'Staff Member',
    permissions: 'View assigned tasks, update availability, and submit task proof.',
  },
  {
    value: 'system_admin',
    label: 'System Admin',
    permissions: 'Manage user roles, access, security logs, audit logs, and system settings.',
  },
]

const roleLabel = (role) => ({
  manager: 'Manager',
  department_staff: 'Department Staff',
  staff_member: 'Staff Member',
  system_admin: 'System Admin',
}[role] || role)

const permissionsFor = (role) => roleOptions.find(option => option.value === role)?.permissions || 'Custom access level.'

export default function UserAccountsPanel({ users, onAddUser, onResetUser, onChangeRole, onToggleStatus, currentUserId }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border p-6">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2"><Shield className="w-5 h-5 text-blue-500" /> User Account Access</h2>
          <p className="mt-1 text-xs text-gray-500">Deactivate inactive or departed staff so they can no longer access the system.</p>
        </div>
        <button onClick={onAddUser} className="bg-gradient-to-r from-blue-500 to-green-500 text-white px-3 py-2 rounded-lg text-xs flex items-center justify-center gap-1"><Plus className="w-3 h-3" /> Add User</button>
      </div>
      <div className="space-y-3">
        {users.map(user => (
          <div key={user.id} className="grid gap-3 rounded-lg bg-gray-50 p-3 md:grid-cols-[1fr_220px_auto] md:items-center">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium text-sm text-gray-800">{user.full_name}</p>
                {user.id === currentUserId && <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-700">You</span>}
              </div>
              <p className="truncate text-xs text-gray-500">{user.email}</p>
              <p className="mt-1 text-xs text-gray-500">{user.status === 'active' ? permissionsFor(user.role) : 'Access disabled. This user cannot sign in to the system.'}</p>
            </div>
            <div>
              <label htmlFor={`role-${user.id}`} className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-400">Access role</label>
              <select
                id={`role-${user.id}`}
                value={user.role}
                disabled={user.id === currentUserId || user.status !== 'active'}
                onChange={event => onChangeRole(user.id, event.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
                aria-label={`Change role for ${user.full_name}`}
              >
                {roleOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <p className="mt-1 text-[11px] text-gray-400">{roleLabel(user.role)}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 md:justify-end">
              <span className={`text-xs px-2 py-0.5 rounded-full ${user.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{user.status}</span>
              <button onClick={() => onResetUser(user)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50">
                <KeyRound className="h-3.5 w-3.5" /> Reset
              </button>
              <button
                onClick={() => onToggleStatus(user)}
                disabled={user.id === currentUserId}
                className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium disabled:cursor-not-allowed disabled:text-gray-400 ${user.status === 'active' ? 'text-red-600 hover:bg-red-50' : 'text-green-600 hover:bg-green-50'}`}
              >
                {user.status === 'active' ? <UserMinus className="h-3.5 w-3.5" /> : <UserCheck className="h-3.5 w-3.5" />}
                {user.status === 'active' ? 'Deactivate' : 'Reactivate'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
