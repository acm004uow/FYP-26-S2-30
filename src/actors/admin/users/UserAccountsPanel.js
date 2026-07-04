import { KeyRound, Plus, Shield, UserCheck, UserMinus, UserRound } from 'lucide-react'

export const roleOptions = [
  {
    value: 'manager',
    label: 'Manager',
    permissions: 'Approve requests, assign tasks, manage staff profiles, and view reports.',
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
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {users.map(user => (
          <div key={user.id} className="flex min-h-[300px] flex-col items-center rounded-2xl border border-green-200 bg-white px-5 py-6 text-center shadow-sm">
            <div className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${user.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
              {user.status === 'active' ? 'active' : 'inactive'}
            </div>

            <div className="mt-4 flex h-20 w-20 items-center justify-center rounded-full bg-green-50 text-green-600">
              <UserRound className="h-10 w-10" />
            </div>

            <div className="mt-4 min-w-0">
              <div className="flex flex-wrap items-center justify-center gap-2">
                <p className="max-w-[180px] truncate text-lg font-bold text-gray-900">{user.full_name}</p>
                {user.id === currentUserId && <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-700">You</span>}
              </div>
              <p className="mt-1 max-w-[210px] truncate text-xs text-gray-500">{user.email}</p>
            </div>

            <div className="mt-4 w-full">
              <label htmlFor={`role-${user.id}`} className="sr-only">Access role</label>
              <select
                id={`role-${user.id}`}
                value={user.role}
                disabled={user.id === currentUserId || user.status !== 'active'}
                onChange={event => onChangeRole(user.id, event.target.value)}
                className="w-full rounded-lg border border-green-200 bg-white px-3 py-2 text-center text-sm text-gray-700 focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-100 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
                aria-label={`Change role for ${user.full_name}`}
              >
                {roleOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>

            <p className="mt-3 min-h-[48px] text-xs leading-relaxed text-gray-500">{user.status === 'active' ? permissionsFor(user.role) : 'Access disabled. This user cannot sign in to the system.'}</p>

            <div className="mt-auto flex w-full flex-col items-center gap-3 pt-5">
              <button onClick={() => onResetUser(user)} className="inline-flex items-center gap-1 rounded-full border border-green-200 bg-white px-5 py-2 text-xs font-medium text-green-700 hover:bg-green-50">
                <KeyRound className="h-3.5 w-3.5" /> Reset
              </button>
              <button
                onClick={() => onToggleStatus(user)}
                disabled={user.id === currentUserId}
                className={`inline-flex w-full items-center justify-center gap-1 rounded-full px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-gray-300 ${user.status === 'active' ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}`}
              >
                {user.status === 'active' ? <UserMinus className="h-3.5 w-3.5" /> : <UserCheck className="h-3.5 w-3.5" />}
                {user.status === 'active' ? 'Deactivate' : 'Reactivate'}
              </button>
              <p className="text-xs font-medium text-gray-400">{roleLabel(user.role)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
