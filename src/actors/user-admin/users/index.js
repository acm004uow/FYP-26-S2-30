import Layout from '../../../components/Layout'
import { useEffect, useMemo, useState } from 'react'
import { Building2, Calendar, ChevronDown, ChevronLeft, ChevronRight, Filter, Plus, Search, Users as UsersIcon } from 'lucide-react'
import { supabase } from '../../../../lib/supabaseClient'
import { useAuthUser } from '../../../context/AuthUserContext'
import { AddUserModal, ManageUserModal, ROLE_META, avatarPaletteFor, initialsOf, roleLabel } from '../shared'

const PAGE_SIZE = 5

export default function UserAdminUsers() {
  const { user: currentUser } = useAuthUser()
  const [profiles, setProfiles] = useState([])
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [filterOpen, setFilterOpen] = useState(false)
  const [page, setPage] = useState(1)
  const [message, setMessage] = useState('')

  const [userModal, setUserModal] = useState(false)
  const [savingUser, setSavingUser] = useState(false)
  const [managingUserId, setManagingUserId] = useState(null)

  const loadPlatformData = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('id,full_name,email,role,business_name,host_admin_id,status,created_at')
      .order('created_at', { ascending: false })
    setProfiles(data || [])
  }

  useEffect(() => {
    loadPlatformData()
  }, [])

  useEffect(() => {
    setPage(1)
  }, [search, roleFilter])

  const companies = useMemo(() => {
    const owners = profiles.filter(p => p.role === 'system_admin')
    return owners.map(owner => ({
      id: owner.id,
      businessName: owner.business_name || 'Unnamed Company',
    }))
  }, [profiles])

  const filtered = useMemo(() => profiles.filter(p => {
    if (roleFilter !== 'all' && p.role !== roleFilter) return false
    const term = search.trim().toLowerCase()
    if (!term) return true
    return [p.full_name, p.email, p.role, p.business_name].some(value => String(value || '').toLowerCase().includes(term))
  }), [profiles, search, roleFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageStart = filtered.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1
  const pageEnd = Math.min(filtered.length, currentPage * PAGE_SIZE)
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  const handleCreateUser = async (form) => {
    if (!form.fullName.trim() || !form.email.trim()) {
      setMessage('Fill in the user\'s name and email.')
      return
    }
    if (form.role !== 'user_admin' && form.role !== 'customer' && !form.companyId) {
      setMessage('Choose which company this user belongs to.')
      return
    }

    const company = companies.find(c => c.id === form.companyId)
    const { data: { session } } = await supabase.auth.getSession()
    setSavingUser(true)
    let result
    try {
      const response = await fetch('/api/admin/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          email: form.email.trim(),
          full_name: form.fullName.trim(),
          role: form.role,
          host_admin_id: company?.id || null,
          business_name: company?.businessName || null,
        }),
      })
      result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Could not create user.')
    } catch (err) {
      setSavingUser(false)
      setMessage(err.message)
      return
    }
    setSavingUser(false)
    setUserModal(false)
    setMessage(`${form.fullName} created — an invite email was sent to ${form.email}.`)
    await loadPlatformData()
  }

  const authedRequest = async (url, body) => {
    const { data: { session } } = await supabase.auth.getSession()
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify(body),
    })
    const result = await response.json()
    return { ok: response.ok, result }
  }

  const handleToggleStatus = async (targetUser) => {
    const nextStatus = targetUser.status === 'active' ? 'inactive' : 'active'
    const { ok, result } = await authedRequest('/api/admin/update-role', { user_id: targetUser.id, status: nextStatus })
    setMessage(ok ? `${targetUser.full_name || targetUser.email} ${nextStatus === 'active' ? 'reactivated' : 'deactivated'}.` : result.error)
    if (ok) {
      await loadPlatformData()
      setManagingUserId(null)
    }
  }

  const handleResetPassword = async (userId, email, newPassword) => {
    if (!newPassword) {
      setMessage('Enter a new temporary password.')
      return
    }
    const { ok, result } = await authedRequest('/api/admin/reset-password', { user_id: userId, new_password: newPassword })
    setMessage(ok ? `Password reset for ${email}.` : result.error)
  }

  const managingUser = profiles.find(p => p.id === managingUserId) || null

  return (
    <Layout role="userAdmin">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#0F172A] text-white">
              <UsersIcon className="h-6 w-6" />
            </span>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Users</h1>
              <p className="text-gray-500 text-sm mt-1">Every user across every company on Smart Task Allocation.</p>
            </div>
          </div>
          <button
            onClick={() => setUserModal(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-[#0F172A] hover:bg-[#1E293B] px-4 py-2.5 text-sm font-semibold text-white transition"
          >
            <Plus className="h-5 w-5" /> Add User
          </button>
        </div>

        {message && <div className="mb-4 rounded-lg border border-accent-200 bg-accent-100 px-4 py-3 text-sm text-accent-800">{message}</div>}

        <div className="mb-6 flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Search by name, email, role, or company..."
              className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-12 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
            />
          </div>
          <div className="relative sm:w-56">
            <button
              type="button"
              onClick={() => setFilterOpen(v => !v)}
              className="flex w-full items-center gap-2 rounded-xl border border-gray-200 bg-white py-3 px-4 text-sm text-gray-700 hover:bg-gray-50"
            >
              <Filter className="h-4 w-4 text-gray-400" /> {roleFilter === 'all' ? 'All Roles' : roleLabel(roleFilter)}
              <ChevronDown className="ml-auto h-4 w-4 text-gray-400" />
            </button>
            {filterOpen && (
              <div className="absolute right-0 z-10 mt-1 w-48 rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
                {['all', ...Object.keys(ROLE_META)].map(role => (
                  <button
                    key={role}
                    type="button"
                    onClick={() => { setRoleFilter(role); setFilterOpen(false) }}
                    className={`w-full rounded-md px-3 py-2 text-left text-sm hover:bg-accent-100 ${roleFilter === role ? 'font-semibold text-accent-600' : 'text-gray-700'}`}
                  >
                    {role === 'all' ? 'All Roles' : roleLabel(role)}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
          <div className="hidden grid-cols-[1.8fr_0.7fr_0.7fr_0.3fr] gap-4 border-b border-gray-100 bg-gray-50 px-5 py-3 text-xs font-semibold uppercase text-gray-500 md:grid">
            <span>User</span>
            <span>Role</span>
            <span>Status</span>
            <span />
          </div>
          <div className="divide-y divide-gray-100">
            {paginated.map(p => {
              const palette = avatarPaletteFor(p.full_name || p.email)
              const meta = ROLE_META[p.role]
              const isActive = p.status === 'active'
              return (
                <div
                  key={p.id}
                  onClick={() => setManagingUserId(p.id)}
                  onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setManagingUserId(p.id) } }}
                  role="button"
                  tabIndex={0}
                  className="grid grid-cols-[1.8fr_0.7fr_0.7fr_0.3fr] items-center gap-4 px-5 py-4 hover:bg-gray-50 focus:bg-gray-50 focus:outline-none cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${palette.bg} ${palette.text}`}>
                      {initialsOf(p.full_name || p.email)}
                    </span>
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 truncate">{p.full_name || 'Unnamed'}</p>
                      <p className="text-xs text-gray-500 truncate">{p.email}</p>
                      <p className="mt-0.5 flex items-center gap-1.5 text-xs text-gray-400">
                        <Building2 className="h-3.5 w-3.5 shrink-0" /> {p.business_name || 'No company'}
                        <span>·</span>
                        <Calendar className="h-3.5 w-3.5 shrink-0" /> Joined {p.created_at ? new Date(p.created_at).toLocaleDateString() : 'Unknown'}
                      </p>
                    </div>
                  </div>
                  <span className={`inline-flex w-fit items-center rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap ${meta?.pill || 'bg-gray-100 text-gray-700'}`}>{roleLabel(p.role)}</span>
                  <span className={`inline-flex w-fit items-center gap-1.5 text-xs font-medium ${isActive ? 'text-green-600' : 'text-red-500'}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${isActive ? 'bg-green-500' : 'bg-red-500'}`} /> {isActive ? 'Active' : 'Inactive'}
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-gray-300 justify-self-end" />
                </div>
              )
            })}
            {filtered.length === 0 && (
              <div className="p-8 text-center text-gray-400">{profiles.length === 0 ? 'No users found.' : 'No users match this search or filter.'}</div>
            )}
          </div>

          {filtered.length > 0 && (
            <div className="flex flex-col items-center justify-between gap-3 border-t border-gray-100 px-5 py-3 sm:flex-row">
              <p className="text-sm text-gray-500">Showing {pageStart} to {pageEnd} of {filtered.length} users</p>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(pageNumber => (
                  <button
                    key={pageNumber}
                    onClick={() => setPage(pageNumber)}
                    className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border text-sm font-medium ${pageNumber === currentPage ? 'border-accent-500 bg-accent-100 text-accent-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                  >
                    {pageNumber}
                  </button>
                ))}
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {userModal && <AddUserModal companies={companies} onClose={() => setUserModal(false)} onCreate={handleCreateUser} saving={savingUser} />}

      {managingUser && (
        <ManageUserModal
          user={managingUser}
          currentUserId={currentUser?.id}
          onClose={() => setManagingUserId(null)}
          onToggleStatus={handleToggleStatus}
          onResetPassword={handleResetPassword}
        />
      )}
    </Layout>
  )
}
