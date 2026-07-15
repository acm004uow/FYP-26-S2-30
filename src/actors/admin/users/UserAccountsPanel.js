import { useEffect, useRef, useState } from 'react'
import { Briefcase, KeyRound, Pencil, Plus, Shield, ShieldCheck, UserCheck, UserMinus, UserRound, Users, X } from 'lucide-react'

export const roleOptions = [
  {
    value: 'manager',
    label: 'Manager',
    permissions: 'Approve requests, assign tasks, manage staff profiles, and view reports.',
  },
  {
    value: 'department_staff',
    label: 'Department Staff',
    permissions: 'Create tasks for their department, view available staff, and assign staff manually or via AI recommendation.',
  },
  {
    value: 'staff_member',
    label: 'Staff Member',
    permissions: 'View assigned tasks, update availability, and submit task proof.',
  },
  {
    value: 'system_admin',
    label: 'Owner',
    permissions: 'Manage user roles, access, security logs, audit logs, and system settings.',
  },
]

const roleLabel = (role) => ({
  manager: 'Manager',
  department_staff: 'Department Staff',
  staff_member: 'Staff Member',
  system_admin: 'Owner',
}[role] || role)

const permissionsFor = (role, options = roleOptions) => options.find(option => option.value === role)?.permissions || 'Custom access level.'

const ROLE_ORDER = ['system_admin', 'manager', 'department_staff', 'staff_member']

const ROLE_META = {
  system_admin: { label: 'Owner', icon: ShieldCheck, ring: 'border-purple-200', avatarBg: 'bg-purple-50', avatarText: 'text-purple-600', select: 'border-purple-200 focus:border-purple-400 focus:ring-purple-100' },
  manager: { label: 'Manager', icon: Users, ring: 'border-blue-200', avatarBg: 'bg-blue-50', avatarText: 'text-blue-600', select: 'border-blue-200 focus:border-blue-400 focus:ring-blue-100' },
  department_staff: { label: 'Department Staff', icon: Briefcase, ring: 'border-orange-200', avatarBg: 'bg-orange-50', avatarText: 'text-orange-600', select: 'border-orange-200 focus:border-orange-400 focus:ring-orange-100' },
  staff_member: { label: 'Staff Member', icon: UserRound, ring: 'border-green-200', avatarBg: 'bg-green-50', avatarText: 'text-green-600', select: 'border-green-200 focus:border-green-400 focus:ring-green-100' },
  other: { label: 'Other', icon: UserRound, ring: 'border-gray-200', avatarBg: 'bg-gray-50', avatarText: 'text-gray-600', select: 'border-gray-200 focus:border-gray-400 focus:ring-gray-100' },
}

const groupUsersByRole = (users) => {
  const groups = ROLE_ORDER
    .map(role => [role, users.filter(user => user.role === role)])
    .filter(([, group]) => group.length > 0)
  const other = users.filter(user => !ROLE_ORDER.includes(user.role))
  if (other.length > 0) groups.push(['other', other])
  return groups
}

function UserManageModal({ user, staffProfile, managers, currentUserId, onClose, onChangeRole, onToggleStatus, onResetUser, onSetManager, isEditingSalary, onEnableSalaryEdit, onSalaryBlur, onSalaryKeyDown, roleOptions: availableRoleOptions, canResetPassword }) {
  const meta = ROLE_META[ROLE_ORDER.includes(user.role) ? user.role : 'other']

  useEffect(() => {
    const onKeyDown = event => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl" onClick={event => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${meta.avatarBg} ${meta.avatarText}`}>
              <meta.icon className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-1.5 text-base font-bold text-gray-900">
                <span className="truncate">{user.full_name}</span>
                {user.id === currentUserId && <span className="shrink-0 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">You</span>}
              </p>
              <p className="truncate text-xs text-gray-500">{user.email}</p>
            </div>
          </div>
          <button onClick={onClose} className="shrink-0 rounded-lg p-1 text-gray-400 hover:bg-gray-50 hover:text-gray-600" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className={`mt-4 inline-block rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${user.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
          {user.status === 'active' ? 'active' : 'inactive'}
        </div>

        <div className="mt-4">
          <label htmlFor={`role-${user.id}`} className="mb-1 block text-xs font-medium text-gray-500">Access role</label>
          <select
            id={`role-${user.id}`}
            value={user.role}
            disabled={user.id === currentUserId || user.status !== 'active'}
            onChange={event => onChangeRole(user.id, event.target.value)}
            className={`w-full rounded-lg border bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400 ${meta.select}`}
            aria-label={`Change role for ${user.full_name}`}
          >
            {availableRoleOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <p className="mt-2 text-xs leading-relaxed text-gray-500">{user.status === 'active' ? permissionsFor(user.role, availableRoleOptions) : 'Access disabled. This user cannot sign in to the system.'}</p>
        </div>

        {user.role === 'staff_member' && staffProfile && (
          <div className="mt-4 space-y-2">
            <div>
              <label htmlFor={`manager-${user.id}`} className="mb-1 block text-xs font-medium text-gray-500">Supervising manager</label>
              <select
                id={`manager-${user.id}`}
                value={staffProfile.manager_id || ''}
                onChange={event => onSetManager(staffProfile.id, event.target.value || null)}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                aria-label={`Supervising manager for ${user.full_name}`}
              >
                <option value="">— No manager assigned —</option>
                {managers.map(manager => <option key={manager.id} value={manager.id}>{manager.full_name}</option>)}
              </select>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
              <span className="text-xs text-gray-500">Basic salary</span>
              {isEditingSalary ? (
                <input
                  autoFocus
                  type="number"
                  min="0"
                  step="0.01"
                  defaultValue={staffProfile.basic_salary || 0}
                  onBlur={event => onSalaryBlur(staffProfile.id, user.id, event.target.value)}
                  onKeyDown={onSalaryKeyDown}
                  className="w-24 rounded-lg border border-blue-200 bg-white px-2 py-1 text-right text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  aria-label={`Basic salary for ${user.full_name}`}
                />
              ) : (
                <div className="flex items-center gap-1">
                  <span className="text-sm font-semibold tabular-nums text-gray-900">${Number(staffProfile.basic_salary || 0).toFixed(2)}</span>
                  <button
                    type="button"
                    onClick={onEnableSalaryEdit}
                    className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                    aria-label={`Edit basic salary for ${user.full_name}`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="mt-6 flex items-center gap-3">
          {canResetPassword && (
            <button onClick={() => onResetUser(user)} className="inline-flex flex-1 items-center justify-center gap-1 rounded-full border border-green-200 bg-white px-4 py-2 text-xs font-medium text-green-700 hover:bg-green-50">
              <KeyRound className="h-3.5 w-3.5" /> Reset
            </button>
          )}
          <button
            onClick={() => onToggleStatus(user)}
            disabled={user.id === currentUserId}
            className={`inline-flex flex-1 items-center justify-center gap-1 rounded-full px-4 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-gray-300 ${user.status === 'active' ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}`}
          >
            {user.status === 'active' ? <UserMinus className="h-3.5 w-3.5" /> : <UserCheck className="h-3.5 w-3.5" />}
            {user.status === 'active' ? 'Deactivate' : 'Reactivate'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function UserAccountsPanel({ users, staffProfiles = [], managers = [], onAddUser, onResetUser, onChangeRole, onToggleStatus, onSetManager, onSetBasicSalary, currentUserId, roleOptions: availableRoleOptions = roleOptions, canResetPassword = true }) {
  const [editingSalary, setEditingSalary] = useState({})
  const [managingUserId, setManagingUserId] = useState(null)
  const salaryRefs = useRef({})

  const enableSalaryEdit = userId => {
    setEditingSalary(prev => ({ ...prev, [userId]: true }))
    setTimeout(() => salaryRefs.current[userId]?.focus(), 0)
  }
  const handleSalaryBlur = (staffProfileId, userId, value) => {
    onSetBasicSalary(staffProfileId, value)
    setEditingSalary(prev => ({ ...prev, [userId]: false }))
  }
  const handleSalaryKeyDown = (event, userId) => {
    if (event.key === 'Enter') event.target.blur()
    if (event.key === 'Escape') {
      event.preventDefault()
      setEditingSalary(prev => ({ ...prev, [userId]: false }))
    }
  }
  const closeManage = () => {
    setManagingUserId(null)
    setEditingSalary({})
  }

  const managingUser = users.find(u => u.id === managingUserId) || null
  const managingStaffProfile = managingUser ? staffProfiles.find(sp => sp.user_id === managingUser.id) : null

  return (
    <div className="bg-white rounded-xl shadow-sm border p-6">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2"><Shield className="w-5 h-5 text-blue-500" /> User Account Access</h2>
          <p className="mt-1 text-xs text-gray-500">Deactivate inactive or departed staff so they can no longer access the system.</p>
        </div>
        <button onClick={onAddUser} className="bg-gradient-to-r from-blue-500 to-green-500 text-white px-3 py-2 rounded-lg text-xs flex items-center justify-center gap-1"><Plus className="w-3 h-3" /> Add User</button>
      </div>

      <div className="space-y-8">
        {groupUsersByRole(users).map(([role, group]) => {
          const meta = ROLE_META[role]
          return (
            <div key={role}>
              <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                <meta.icon className={`h-4 w-4 ${meta.avatarText}`} /> {meta.label}s
                <span className="text-xs font-normal text-gray-400">({group.length})</span>
              </h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
                {group.map(user => (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => setManagingUserId(user.id)}
                    className={`flex flex-col items-center gap-2 rounded-2xl border ${meta.ring} bg-white px-4 py-5 text-center shadow-sm transition hover:-translate-y-0.5 hover:shadow-md`}
                  >
                    <div className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${user.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {user.status === 'active' ? 'active' : 'inactive'}
                    </div>

                    <div className={`flex h-14 w-14 items-center justify-center rounded-full ${meta.avatarBg} ${meta.avatarText}`}>
                      <meta.icon className="h-7 w-7" />
                    </div>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center justify-center gap-1.5">
                        <p className="max-w-[160px] truncate text-sm font-bold text-gray-900">{user.full_name}</p>
                        {user.id === currentUserId && <span className="shrink-0 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">You</span>}
                      </div>
                      <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${meta.avatarBg} ${meta.avatarText}`}>{roleLabel(user.role)}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )
        })}
        {users.length === 0 && <p className="text-sm text-gray-400">No users found.</p>}
      </div>

      {managingUser && (
        <UserManageModal
          user={managingUser}
          staffProfile={managingStaffProfile}
          managers={managers}
          currentUserId={currentUserId}
          onClose={closeManage}
          onChangeRole={onChangeRole}
          onToggleStatus={onToggleStatus}
          onResetUser={onResetUser}
          onSetManager={onSetManager}
          isEditingSalary={!!editingSalary[managingUser.id]}
          onEnableSalaryEdit={() => enableSalaryEdit(managingUser.id)}
          onSalaryBlur={handleSalaryBlur}
          onSalaryKeyDown={event => handleSalaryKeyDown(event, managingUser.id)}
          roleOptions={availableRoleOptions}
          canResetPassword={canResetPassword}
        />
      )}
    </div>
  )
}
