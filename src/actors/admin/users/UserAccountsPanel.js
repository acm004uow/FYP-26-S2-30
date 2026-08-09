import { useEffect, useMemo, useRef, useState } from 'react'
import { Briefcase, ChevronDown, Eye, Filter, KeyRound, Pencil, Plus, Search, ShieldCheck, Star, UserCheck, UserMinus, UserRound, Users, X } from 'lucide-react'

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

const STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'pending', label: 'Pending' },
  { value: 'suspended', label: 'Suspended' },
]

// Invited but never signed in yet — status is already 'active' at invite time (see
// app/api/admin/create-user/route.js), so "accepted the invite" is tracked separately via
// first_login_at (set once, on first successful login — see src/pages/login.js).
const isPending = (user) => user.status === 'active' && !user.first_login_at

const PAGE_SIZE = 8

const avatarInitials = (name) => (name || '?').split(' ').map(part => part[0]).join('').slice(0, 2).toUpperCase()

const metaFor = (role) => ROLE_META[ROLE_ORDER.includes(role) ? role : 'other']

function UserManageModal({ user, staffProfile, managers, currentUserId, onClose, onChangeRole, onToggleStatus, onResetUser, onSetManager, isEditingSalary, onEnableSalaryEdit, onSalaryBlur, onSalaryKeyDown, roleOptions: availableRoleOptions, canResetPassword }) {
  const meta = metaFor(user.role)

  useEffect(() => {
    const onKeyDown = event => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl" onClick={event => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${meta.avatarBg} ${meta.avatarText}`}>
              <meta.icon className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-1.5 text-base font-bold text-gray-900">
                <span className="truncate">{user.full_name}</span>
                {user.id === currentUserId && <span className="shrink-0 rounded-full bg-accent-100 px-1.5 py-0.5 text-[10px] font-medium text-accent-800">You</span>}
              </p>
              <p className="truncate text-xs text-gray-500">{user.email}</p>
            </div>
          </div>
          <button onClick={onClose} className="shrink-0 rounded-lg p-1 text-gray-400 hover:bg-gray-50 hover:text-gray-600" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className={`mt-4 inline-block rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${isPending(user) ? 'bg-amber-100 text-amber-700' : user.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
          {isPending(user) ? 'pending' : user.status === 'active' ? 'active' : 'inactive'}
        </div>
        {isPending(user) && (
          <p className="mt-1.5 text-xs text-amber-700">Invited — hasn&apos;t signed in yet.</p>
        )}

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
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-accent-400 focus:outline-none focus:ring-2 focus:ring-accent-100"
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
                  className="w-24 rounded-lg border border-accent-200 bg-white px-2 py-1 text-right text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-accent-100"
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
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [roleFilter, setRoleFilter] = useState('all')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const salaryRefs = useRef({})

  const staffProfilesByUserId = useMemo(() => {
    const map = {}
    staffProfiles.forEach(profile => { map[profile.user_id] = profile })
    return map
  }, [staffProfiles])

  useEffect(() => {
    setCurrentPage(1)
  }, [search, statusFilter, roleFilter])

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
  const managingStaffProfile = managingUser ? staffProfilesByUserId[managingUser.id] : null

  const roleFilterOptions = useMemo(
    () => [{ value: 'all', label: 'All roles' }, ...availableRoleOptions.map(option => ({ value: option.value, label: option.label }))],
    [availableRoleOptions]
  )

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase()
    return users.filter(user => {
      if (roleFilter !== 'all' && user.role !== roleFilter) return false
      if (statusFilter === 'active' && (user.status !== 'active' || isPending(user))) return false
      if (statusFilter === 'pending' && !isPending(user)) return false
      if (statusFilter === 'suspended' && user.status === 'active') return false
      if (!term) return true
      const staffProfile = staffProfilesByUserId[user.id]
      return [user.full_name, user.email, roleLabel(user.role), staffProfile?.assigned_region, staffProfile?.departments?.name]
        .some(value => String(value || '').toLowerCase().includes(term))
    })
  }, [users, staffProfilesByUserId, search, statusFilter, roleFilter])

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE))
  const safePage = Math.min(currentPage, totalPages)
  const pageUsers = filteredUsers.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Owner / Employees</p>
      <div className="mt-1 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold text-gray-900">Employees</h1>
          <p className="text-gray-500 text-sm mt-1">{filteredUsers.length} of {users.length} employees</p>
        </div>
        <button
          onClick={onAddUser}
          className="inline-flex items-center gap-2 rounded-lg bg-accent hover:bg-accent-600 px-4 py-2.5 text-sm font-semibold text-white transition"
        >
          <Plus className="w-4 h-4" /> Add employee
        </button>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or role..."
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent-200"
          />
        </div>
        <div className="inline-flex overflow-hidden rounded-lg border border-gray-200">
          {STATUS_FILTERS.map(option => (
            <button
              key={option.value}
              type="button"
              onClick={() => setStatusFilter(option.value)}
              className={`px-3.5 py-2 text-sm font-medium transition ${statusFilter === option.value ? 'bg-accent text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="relative sm:ml-auto">
          <button
            type="button"
            onClick={() => setFiltersOpen(open => !open)}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
          >
            <Filter className="w-4 h-4" /> Filters <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
          </button>
          {filtersOpen && (
            <div className="absolute right-0 mt-1 w-48 bg-white border rounded-lg shadow-lg z-10 overflow-hidden">
              <p className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Role</p>
              {roleFilterOptions.map(option => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => { setRoleFilter(option.value); setFiltersOpen(false) }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${roleFilter === option.value ? 'text-accent-600 font-medium' : 'text-gray-700'}`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full table-fixed text-sm">
            <colgroup>
              <col className="w-[24%]" />
              <col className="w-[20%]" />
              <col className="w-[24%]" />
              <col className="w-[16%]" />
              <col className="w-[16%]" />
            </colgroup>
            <thead>
              <tr className="border-b bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                <th className="px-3 py-2.5">Name</th>
                <th className="px-3 py-2.5">Role</th>
                <th className="px-3 py-2.5">Region</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {pageUsers.map(user => {
                const staffProfile = staffProfilesByUserId[user.id]
                const meta = metaFor(user.role)
                const suspended = user.status !== 'active'
                return (
                  <tr key={user.id} className="transition hover:bg-gray-50">
                    <td className="px-3 py-2.5">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${meta.avatarBg} ${meta.avatarText}`}>
                          {avatarInitials(user.full_name)}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-gray-900">
                            {user.full_name}{user.id === currentUserId && <span className="ml-1.5 text-[10px] font-medium text-accent-600">You</span>}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${meta.avatarBg} ${meta.avatarText}`}>{roleLabel(user.role)}</span>
                    </td>
                    <td className="px-3 py-2.5 text-gray-600"><span className="block truncate">{staffProfile?.assigned_region || '—'}</span></td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                        suspended
                          ? 'bg-gray-100 text-gray-600'
                          : isPending(user)
                            ? 'border border-amber-400 text-amber-600'
                            : 'border border-accent-500 text-accent-600'
                      }`}>
                        {suspended ? 'Suspended' : isPending(user) ? 'Pending' : 'Active'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => setManagingUserId(user.id)}
                          aria-label={`View ${user.full_name}`}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition hover:bg-gray-50"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setManagingUserId(user.id)}
                          aria-label={`Edit ${user.full_name}`}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition hover:bg-gray-50"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {filteredUsers.length === 0 && (
          <div className="p-8 text-center text-gray-400">
            {users.length === 0 ? 'No employees found.' : 'No employees match these filters.'}
          </div>
        )}
        {filteredUsers.length > 0 && (
          <div className="flex items-center justify-between border-t px-4 py-3">
            <span className="text-xs text-gray-500">Page {safePage} of {totalPages}</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={safePage <= 1}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Prev
              </button>
              <button
                type="button"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={safePage >= totalPages}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
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
