import Layout from '../../../components/Layout'
import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, Eye, Filter, Pencil, Plus, Search, Star, UserPlus, X } from 'lucide-react'
import { supabase } from '../../../../lib/supabaseClient'
import { useAuthUser } from '../../../context/AuthUserContext'

const MANAGER_ROLE_OPTIONS = [
  { value: 'manager', label: 'Manager', permissions: 'Approve requests, assign tasks, manage staff profiles, and view reports.' },
  { value: 'staff_member', label: 'Staff Member', permissions: 'View assigned tasks, update availability, and submit task proof.' },
]

const ROLE_FILTERS = [
  { value: 'all', label: 'All roles' },
  { value: 'manager', label: 'Manager' },
  { value: 'staff_member', label: 'Staff Member' },
]

const STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
]

const PAGE_SIZE = 8

const roleLabel = (role) => ({ manager: 'Manager', staff_member: 'Staff Member' }[role] || role)

const avatarInitials = (name) => (name || '?').split(' ').map(part => part[0]).join('').slice(0, 2).toUpperCase()

export default function ManagerUserAccounts() {
  const { user } = useAuthUser()
  const [users, setUsers] = useState([])
  const [staffProfilesByUserId, setStaffProfilesByUserId] = useState({})
  const [message, setMessage] = useState('')
  const [currentUserId, setCurrentUserId] = useState('')
  const [currentBusinessName, setCurrentBusinessName] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState({ full_name: '', email: '', role: 'staff_member' })
  const [managingUser, setManagingUser] = useState(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [roleFilter, setRoleFilter] = useState('all')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)

  const loadUsers = async () => {
    if (!user) return
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

    const [results, staffProfileResult] = await Promise.all([
      Promise.all(profileRequests),
      hostAdminId
        ? supabase.from('staff_profiles').select('id,user_id,assigned_region,current_workload,performance_rating,department_id,departments(name)').eq('host_admin_id', hostAdminId)
        : Promise.resolve({ data: [] }),
    ])
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

    const staffMap = {}
    ;(staffProfileResult.data || []).forEach(row => { staffMap[row.user_id] = row })

    setCurrentUserId(user?.id || '')
    setCurrentBusinessName(businessName)
    setUsers(profiles)
    setStaffProfilesByUserId(staffMap)
  }

  useEffect(() => {
    loadUsers()
  }, [user])

  useEffect(() => {
    setCurrentPage(1)
  }, [search, statusFilter, roleFilter])

  const handleChangeRole = async (id, role) => {
    const { error } = await supabase.from('profiles').update({ role, updated_at: new Date().toISOString() }).eq('id', id)
    setMessage(error ? error.message : 'User role updated.')
    if (!error) {
      await supabase.from('audit_logs').insert({ user_id: id, action: 'update_user_role', details: `Role changed to ${role}` })
      await loadUsers()
    }
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

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase()
    return users.filter(user => {
      if (roleFilter !== 'all' && user.role !== roleFilter) return false
      if (statusFilter === 'active' && user.status !== 'active') return false
      if (statusFilter === 'suspended' && user.status === 'active') return false
      if (!term) return true
      const staffProfile = staffProfilesByUserId[user.id]
      return [user.full_name, user.email, staffProfile?.assigned_region, staffProfile?.departments?.name]
        .some(value => String(value || '').toLowerCase().includes(term))
    })
  }, [users, staffProfilesByUserId, search, statusFilter, roleFilter])

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE))
  const safePage = Math.min(currentPage, totalPages)
  const pageUsers = filteredUsers.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  return (
    <Layout role="manager">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Manager / Employees</p>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-4xl font-bold text-gray-900">Crew</h1>
            <p className="text-gray-500 text-sm mt-1">{filteredUsers.length} of {users.length} staff profiles</p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-accent hover:bg-accent-600 px-4 py-2.5 text-sm font-semibold text-white transition"
          >
            <Plus className="w-4 h-4" /> Add employee
          </button>
        </div>

        {message && <div className="mt-4 rounded-lg border border-accent-200 bg-accent-100 px-4 py-3 text-sm text-accent-800">{message}</div>}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name or skill..."
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
              <div className="absolute right-0 mt-1 w-44 bg-white border rounded-lg shadow-lg z-10 overflow-hidden">
                <p className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Role</p>
                {ROLE_FILTERS.map(option => (
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
                <col className="w-[22%]" />
                <col className="w-[16%]" />
                <col className="w-[16%]" />
                <col className="w-[13%]" />
                <col className="w-[11%]" />
                <col className="w-[10%]" />
                <col className="w-[12%]" />
              </colgroup>
              <thead>
                <tr className="border-b bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <th className="px-3 py-2.5">Name</th>
                  <th className="px-3 py-2.5">Role / Skill</th>
                  <th className="px-3 py-2.5">Region</th>
                  <th className="px-3 py-2.5">Workload</th>
                  <th className="px-3 py-2.5">Rating</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pageUsers.map(user => {
                  const staffProfile = staffProfilesByUserId[user.id]
                  const suspended = user.status !== 'active'
                  return (
                    <tr key={user.id} className="transition hover:bg-gray-50">
                      <td className="px-3 py-2.5">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-100 text-[11px] font-bold text-accent-700">
                            {avatarInitials(user.full_name)}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-gray-900">
                              {user.full_name}{user.id === currentUserId && <span className="ml-1.5 text-[10px] font-medium text-accent-600">You</span>}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-gray-600"><span className="block truncate">{staffProfile?.departments?.name || roleLabel(user.role)}</span></td>
                      <td className="px-3 py-2.5 text-gray-600"><span className="block truncate">{staffProfile?.assigned_region || '—'}</span></td>
                      <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{staffProfile ? `${staffProfile.current_workload || 0} tasks` : '—'}</td>
                      <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">
                        {staffProfile ? (
                          <span className="flex items-center gap-1"><Star className="h-3.5 w-3.5 text-accent" />{Number(staffProfile.performance_rating || 0).toFixed(1)}</span>
                        ) : '—'}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${suspended ? 'bg-gray-100 text-gray-600' : 'border border-accent-500 text-accent-600'}`}>
                          {suspended ? 'Suspended' : 'Active'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setManagingUser(user)}
                            aria-label={`View ${user.full_name}`}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition hover:bg-gray-50"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setManagingUser(user)}
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
      </div>

      {managingUser && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setManagingUser(null)}>
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl" onClick={event => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent-100 text-sm font-bold text-accent-700">
                  {avatarInitials(managingUser.full_name)}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-base font-bold text-gray-900">{managingUser.full_name}</p>
                  <p className="truncate text-xs text-gray-500">{managingUser.email}</p>
                </div>
              </div>
              <button onClick={() => setManagingUser(null)} className="shrink-0 rounded-lg p-1 text-gray-400 hover:bg-gray-50 hover:text-gray-600" aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className={`mt-4 inline-block rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${managingUser.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
              {managingUser.status === 'active' ? 'active' : 'inactive'}
            </div>

            <div className="mt-4">
              <label htmlFor="manage-role" className="mb-1 block text-xs font-medium text-gray-500">Access role</label>
              <select
                id="manage-role"
                value={managingUser.role}
                disabled={managingUser.id === currentUserId || managingUser.status !== 'active'}
                onChange={event => {
                  const nextRole = event.target.value
                  handleChangeRole(managingUser.id, nextRole)
                  setManagingUser(prev => prev ? { ...prev, role: nextRole } : prev)
                }}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-accent-400 focus:outline-none focus:ring-2 focus:ring-accent-100 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
                aria-label={`Change role for ${managingUser.full_name}`}
              >
                {MANAGER_ROLE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <p className="mt-2 text-xs leading-relaxed text-gray-500">
                {managingUser.status === 'active'
                  ? (MANAGER_ROLE_OPTIONS.find(option => option.value === managingUser.role)?.permissions || 'Custom access level.')
                  : 'Access disabled. This user cannot sign in to the system.'}
              </p>
            </div>

            {staffProfilesByUserId[managingUser.id] && (
              <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg border border-gray-100 bg-gray-50 p-3 text-xs">
                <div>
                  <p className="text-gray-400">Region</p>
                  <p className="font-medium text-gray-800">{staffProfilesByUserId[managingUser.id].assigned_region || '—'}</p>
                </div>
                <div>
                  <p className="text-gray-400">Workload</p>
                  <p className="font-medium text-gray-800">{staffProfilesByUserId[managingUser.id].current_workload || 0} tasks</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <form onSubmit={handleCreate} className="bg-white rounded-xl max-w-md w-full p-6">
            <div className="flex justify-between"><h3 className="text-lg font-semibold">Invite User Account</h3><button type="button" onClick={() => setShowCreate(false)}><X /></button></div>
            {message && <div className="mt-4 rounded-lg border border-accent-200 bg-accent-100 px-4 py-3 text-sm text-accent-800">{message}</div>}
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
              <button type="submit" className="w-full bg-accent hover:bg-accent-600 text-white py-2 rounded-lg flex items-center justify-center gap-2 transition"><UserPlus className="w-4 h-4" /> Send Invite</button>
            </div>
          </form>
        </div>
      )}
    </Layout>
  )
}
