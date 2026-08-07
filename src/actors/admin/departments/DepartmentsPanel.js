import { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle, Briefcase, Building2, ChevronDown, ChevronLeft, ChevronRight, ClipboardCheck,
  Edit, Filter, Info, MoreVertical, Plus, Save, Search, Trash2, UserPlus, Users, X,
} from 'lucide-react'
import { supabase } from '../../../../lib/supabaseClient'

const PAGE_SIZE = 8

const deptCode = (name) => (name || '').replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 3) || '—'

export default function DepartmentsPanel({ onChange }) {
  const [departments, setDepartments] = useState([])
  const [staffCounts, setStaffCounts] = useState({})
  const [hostAdminId, setHostAdminId] = useState(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [message, setMessage] = useState('')
  const [modal, setModal] = useState({ open: false, editing: null })
  const [statusMenuOpen, setStatusMenuOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [openMenuId, setOpenMenuId] = useState(null)

  const updateEditing = (patch) => setModal(current => ({ ...current, editing: { ...current.editing, ...patch } }))

  const resolveHostAdminId = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.id) return null

    const { data: profile } = await supabase
      .from('profiles')
      .select('role,host_admin_id')
      .eq('id', user.id)
      .single()

    return profile?.role === 'system_admin' ? user.id : profile?.host_admin_id || null
  }

  const loadDepartments = async () => {
    const resolvedHostAdminId = await resolveHostAdminId()
    setHostAdminId(resolvedHostAdminId)
    if (!resolvedHostAdminId) {
      setDepartments([])
      setStaffCounts({})
      return
    }

    const [{ data, error }, { data: staffRows }] = await Promise.all([
      supabase
        .from('departments')
        .select('id,name,description,status,created_at,updated_at')
        .eq('host_admin_id', resolvedHostAdminId)
        .order('name'),
      supabase
        .from('staff_profiles')
        .select('department_id')
        .eq('host_admin_id', resolvedHostAdminId)
        .eq('status', 'active')
        .not('department_id', 'is', null),
    ])

    setStaffCounts((staffRows || []).reduce((acc, row) => {
      acc[row.department_id] = (acc[row.department_id] || 0) + 1
      return acc
    }, {}))

    if (error) {
      setMessage(error.message)
      return
    }
    setDepartments(data || [])
  }

  useEffect(() => {
    loadDepartments()
  }, [])

  useEffect(() => {
    setPage(1)
  }, [search, statusFilter])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return departments.filter(department => {
      if (statusFilter !== 'all' && department.status !== statusFilter) return false
      if (!term) return true
      return [department.name, department.description, department.status]
        .some(value => String(value || '').toLowerCase().includes(term))
    })
  }, [departments, search, statusFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageStart = filtered.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1
  const pageEnd = Math.min(filtered.length, currentPage * PAGE_SIZE)
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  const stats = useMemo(() => {
    const total = departments.length
    const totalStaff = Object.values(staffCounts).reduce((sum, count) => sum + count, 0)
    const activeCount = departments.filter(department => department.status === 'active').length
    return {
      total,
      totalStaff,
      activeCount,
      avgStaff: total ? Math.round(totalStaff / total) : 0,
    }
  }, [departments, staffCounts])

  const handleCreate = () => {
    setStatusMenuOpen(false)
    setModal({ open: true, editing: { id: null, name: '', description: '', status: 'active' } })
  }

  const handleEdit = (department) => {
    setOpenMenuId(null)
    setStatusMenuOpen(false)
    setModal({ open: true, editing: { ...department } })
  }

  const handleSave = async (event) => {
    event.preventDefault()
    const payload = {
      name: (modal.editing?.name || '').trim(),
      description: (modal.editing?.description || '').trim(),
      status: modal.editing?.status || 'active',
      updated_at: new Date().toISOString(),
    }

    if (!payload.name) {
      setMessage('Department name is required.')
      return
    }

    if (!modal.editing?.id && !hostAdminId) {
      setMessage('Could not resolve your company.')
      return
    }

    const { error } = modal.editing?.id
      ? await supabase.from('departments').update(payload).eq('id', modal.editing.id)
      : await supabase.from('departments').insert({ ...payload, host_admin_id: hostAdminId })

    if (error) {
      setMessage(error.message)
      return
    }

    await supabase.from('audit_logs').insert({
      action: modal.editing?.id ? 'update_department' : 'create_department',
      details: payload.name,
    })
    setModal({ open: false, editing: null })
    setMessage(modal.editing?.id ? 'Department updated.' : 'Department created.')
    await loadDepartments()
    onChange?.()
  }

  const handleToggleStatus = async (department) => {
    setOpenMenuId(null)
    const nextStatus = department.status === 'active' ? 'inactive' : 'active'
    const { error } = await supabase
      .from('departments')
      .update({ status: nextStatus, updated_at: new Date().toISOString() })
      .eq('id', department.id)

    if (error) {
      setMessage(error.message)
      return
    }

    await supabase.from('audit_logs').insert({
      action: 'update_department',
      details: `${department.name} marked ${nextStatus}`,
    })
    setMessage(`${department.name} marked ${nextStatus}.`)
    await loadDepartments()
    onChange?.()
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    const { error } = await supabase.from('departments').delete().eq('id', deleteTarget.id)
    if (error) {
      setMessage(error.message)
      setDeleteTarget(null)
      return
    }
    await supabase.from('audit_logs').insert({ action: 'delete_department', details: deleteTarget.name })
    setDeleteTarget(null)
    setMessage('Department deleted.')
    await loadDepartments()
    onChange?.()
  }

  return (
    <div className="max-w-6xl mx-auto" onClick={() => openMenuId && setOpenMenuId(null)}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Departments</h1>
          <p className="text-gray-500 text-sm mt-1">Departments that can request annual staff for their own tasks (e.g. Sales, Facilities).</p>
        </div>
        <button onClick={handleCreate} className="inline-flex min-w-44 items-center justify-center gap-2 rounded-lg bg-accent hover:bg-accent-600 px-4 py-2 text-sm font-semibold text-white transition">
          <Plus className="w-5 h-5 shrink-0" />
          Add Department
        </button>
      </div>

      {message && <div className="mb-4 rounded-lg border border-accent-200 bg-accent-100 px-4 py-3 text-sm text-accent-800">{message}</div>}

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={Building2} iconBg="bg-blue-100" iconColor="text-blue-600" label="Total Departments" value={stats.total} subLabel="All departments in your organisation" />
        <StatCard icon={Users} iconBg="bg-green-100" iconColor="text-green-600" label="Total Staff" value={stats.totalStaff} subLabel="Across all departments" />
        <StatCard icon={ClipboardCheck} iconBg="bg-purple-100" iconColor="text-purple-600" label="Active Departments" value={stats.activeCount} subLabel="Currently active" />
        <StatCard icon={UserPlus} iconBg="bg-amber-100" iconColor="text-amber-600" label="Avg. Staff per Dept" value={stats.avgStaff} subLabel="Average staff" />
      </div>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Search departments..."
            className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-12 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
          />
        </div>
        <div className="relative sm:w-56">
          <Filter className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <select
            value={statusFilter}
            onChange={event => setStatusFilter(event.target.value)}
            className="w-full appearance-none rounded-xl border border-gray-200 bg-white py-3 pl-11 pr-10 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-accent-500"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        </div>
      </div>

      <div className="overflow-visible rounded-xl border border-gray-100 bg-white shadow-sm">
        <div className="hidden grid-cols-[1.2fr_1.6fr_0.7fr_0.7fr_0.9fr] gap-4 border-b border-gray-100 bg-gray-50 px-5 py-3 text-xs font-semibold uppercase text-gray-500 md:grid">
          <span>Department</span>
          <span>Description</span>
          <span>Staff</span>
          <span>Status</span>
          <span>Actions</span>
        </div>
        <div className="divide-y divide-gray-100">
          {paginated.map(department => {
            const isActive = department.status === 'active'
            const staffCount = staffCounts[department.id] || 0
            return (
              <div key={department.id} className="grid gap-4 px-5 py-4 md:grid-cols-[1.2fr_1.6fr_0.7fr_0.7fr_0.9fr] md:items-center">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
                    <Briefcase className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{department.name}</p>
                    <span className="text-xs text-gray-400">Department ID: {deptCode(department.name)}</span>
                  </div>
                </div>
                <p className="text-sm text-gray-600">{department.description || 'No description'}</p>
                <div className="flex items-center gap-2 text-sm text-gray-700">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent-100 text-accent-600">
                    <Users className="h-3.5 w-3.5" />
                  </span>
                  <span>
                    <span className="font-semibold">{staffCount}</span> staff
                  </span>
                </div>
                <span className={`inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${isActive ? 'bg-green-500' : 'bg-gray-400'}`} />
                  {isActive ? 'Active' : 'Inactive'}
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => handleEdit(department)}
                    className="inline-flex items-center gap-1 rounded-lg bg-accent-100 px-3 py-2 text-xs font-medium text-accent-600 hover:bg-accent-200"
                  >
                    <Edit className="h-3.5 w-3.5" />
                    Edit
                  </button>
                  <button
                    onClick={() => setDeleteTarget(department)}
                    className="inline-flex items-center gap-1 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </button>
                  <div className="relative">
                    <button
                      onClick={(event) => { event.stopPropagation(); setOpenMenuId(openMenuId === department.id ? null : department.id) }}
                      className="inline-flex items-center justify-center rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </button>
                    {openMenuId === department.id && (
                      <div onClick={event => event.stopPropagation()} className="absolute right-0 z-10 mt-1 w-40 rounded-lg border border-gray-100 bg-white py-1 shadow-lg">
                        <button
                          onClick={() => handleToggleStatus(department)}
                          className="block w-full px-3 py-2 text-left text-xs font-medium text-gray-600 hover:bg-gray-50"
                        >
                          Mark {isActive ? 'Inactive' : 'Active'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
          {filtered.length === 0 && <div className="px-5 py-12 text-center text-sm text-gray-400">No departments found.</div>}
        </div>
      </div>

      {filtered.length > 0 && (
        <div className="mt-4 flex flex-col items-center justify-between gap-3 sm:flex-row">
          <p className="text-sm text-gray-500">
            Showing {pageStart} to {pageEnd} of {filtered.length} departments
          </p>
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

      <div className="mt-6 flex items-start gap-2 rounded-lg bg-accent-100 px-4 py-3 text-sm text-accent-800">
        <Info className="h-4 w-4 shrink-0 mt-0.5" />
        Departments help you organise staff and tasks by function or team.
      </div>

      {modal.open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => statusMenuOpen && setStatusMenuOpen(false)}
        >
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div className="flex items-start gap-4">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent-100 text-accent-600">
                  <Briefcase className="h-6 w-6" />
                </span>
                <div>
                  <h3 className="text-xl font-bold text-gray-900">{modal.editing?.id ? 'Edit Department' : 'Add Department'}</h3>
                  <p className="mt-0.5 text-sm text-gray-500">
                    {modal.editing?.id ? 'Update the details of this department.' : 'Add a new department for your business.'}
                  </p>
                </div>
              </div>
              <button onClick={() => setModal({ open: false, editing: null })} className="shrink-0 rounded-lg p-1 hover:bg-gray-100">
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="mb-2 flex items-center gap-1 text-sm font-semibold text-gray-800">
                  Department Name <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Briefcase className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-accent-500" />
                  <input
                    value={modal.editing?.name || ''}
                    onChange={event => updateEditing({ name: event.target.value.slice(0, 100) })}
                    required
                    maxLength={100}
                    placeholder="e.g. Sales, Facilities"
                    className="w-full rounded-lg border border-gray-200 py-3 pl-11 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
                  />
                </div>
                <p className="mt-1 text-right text-xs text-gray-400">{(modal.editing?.name || '').length} / 100</p>
              </div>
              <div>
                <label className="mb-2 flex items-center gap-1 text-sm font-semibold text-gray-800">
                  Description <span className="font-normal text-gray-400">(Optional)</span>
                </label>
                <textarea
                  value={modal.editing?.description || ''}
                  onChange={event => updateEditing({ description: event.target.value.slice(0, 500) })}
                  maxLength={500}
                  rows={4}
                  placeholder="Describe what this department handles."
                  className="w-full resize-none rounded-lg border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
                />
                <p className="mt-1 text-right text-xs text-gray-400">{(modal.editing?.description || '').length} / 500</p>
              </div>
              <div>
                <label className="mb-2 flex items-center gap-1 text-sm font-semibold text-gray-800">
                  Status <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={event => { event.stopPropagation(); setStatusMenuOpen(open => !open) }}
                    className="flex w-full items-center justify-between rounded-lg border border-gray-200 px-4 py-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-accent-500"
                  >
                    <span className="flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 rounded-full ${modal.editing?.status === 'active' ? 'bg-green-500' : 'bg-gray-400'}`} />
                      {modal.editing?.status === 'active' ? 'Active' : 'Inactive'}
                    </span>
                    <ChevronDown className="h-4 w-4 text-gray-400" />
                  </button>
                  {statusMenuOpen && (
                    <div onClick={event => event.stopPropagation()} className="absolute z-10 mt-1 w-full rounded-lg border border-gray-100 bg-white py-1 shadow-lg">
                      {['active', 'inactive'].map(value => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => { updateEditing({ status: value }); setStatusMenuOpen(false) }}
                          className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                        >
                          <span className={`h-2.5 w-2.5 rounded-full ${value === 'active' ? 'bg-green-500' : 'bg-gray-400'}`} />
                          {value === 'active' ? 'Active' : 'Inactive'}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-start gap-2 rounded-lg bg-accent-100 px-4 py-3 text-sm text-accent-800">
                <Info className="h-4 w-4 shrink-0 mt-0.5" />
                Inactive departments won&apos;t be able to request staff or appear in staff assignment.
              </div>
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setModal({ open: false, editing: null })}
                  className="flex-1 rounded-lg border border-gray-200 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button type="submit" className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-accent hover:bg-accent-600 py-3 text-sm font-semibold text-white transition">
                  {modal.editing?.id ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                  {modal.editing?.id ? 'Update Department' : 'Create Department'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center gap-3">
              <AlertCircle className="h-6 w-6 text-red-500" />
              <h3 className="text-lg font-semibold text-gray-900">Confirm Delete</h3>
            </div>
            <p className="mb-6 text-sm text-gray-600">
              {deleteTarget.name} will be removed. Any department staff still assigned to it will keep their tasks, but should be moved to a different department.
            </p>
            <div className="flex gap-3">
              <button onClick={handleDelete} className="flex-1 rounded-lg bg-red-500 py-2.5 text-sm font-medium text-white hover:bg-red-600">
                Delete
              </button>
              <button onClick={() => setDeleteTarget(null)} className="flex-1 rounded-lg bg-gray-100 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-200">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({ icon: Icon, iconBg, iconColor, label, value, subLabel }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${iconBg} ${iconColor}`}>
          <Icon className="h-5 w-5" />
        </span>
        <p className="text-sm font-medium text-gray-500">{label}</p>
      </div>
      <p className="mt-3 text-2xl font-bold text-gray-900">{value}</p>
      {subLabel && <p className="mt-1 text-xs text-gray-400">{subLabel}</p>}
    </div>
  )
}
