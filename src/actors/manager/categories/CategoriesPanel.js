import { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle, Building2, Calendar, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight,
  Edit, Eye, Filter, Home, Info, MoreVertical, Plus, Save, Search, Sparkles, SprayCan, Tag, Tags, Trash2, Truck, X,
} from 'lucide-react'
import { supabase } from '../../../../lib/supabaseClient'
import { SERVICE_TYPES } from '../../../../lib/serviceTypes'

const defaultCategories = SERVICE_TYPES
const PAGE_SIZE = 8

const ICON_RULES = [
  { test: /carpet/i, icon: Sparkles },
  { test: /deep/i, icon: SprayCan },
  { test: /home/i, icon: Home },
  { test: /move/i, icon: Truck },
  { test: /office/i, icon: Building2 },
]

const iconFor = (name) => (ICON_RULES.find(rule => rule.test.test(name || ''))?.icon) || Tags

const formatUpdatedAt = (value) => {
  if (!value) return { headline: '—', detail: '' }
  const date = new Date(value)
  const isToday = date.toDateString() === new Date().toDateString()
  const detail = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  return { headline: isToday ? 'Today' : detail, detail: isToday ? detail : '' }
}

export default function CategoriesPanel() {
  const [categories, setCategories] = useState([])
  const [usedNames, setUsedNames] = useState(new Set())
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

  const mapFallbackCategories = () => defaultCategories.map(name => ({
    id: name,
    name,
    description: '',
    status: 'active',
    isFallback: true,
  }))

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

  const loadCategories = async () => {
    const resolvedHostAdminId = await resolveHostAdminId()
    setHostAdminId(resolvedHostAdminId)
    if (!resolvedHostAdminId) {
      setCategories(mapFallbackCategories())
      setUsedNames(new Set())
      return
    }

    const [{ data, error }, { data: bookingRows }] = await Promise.all([
      supabase
        .from('task_categories')
        .select('id,name,description,status,created_at,updated_at,host_admin_id')
        .or(`host_admin_id.eq.${resolvedHostAdminId},host_admin_id.is.null`)
        .order('name'),
      supabase
        .from('bookings')
        .select('service_type')
        .eq('host_admin_id', resolvedHostAdminId)
        .limit(5000),
    ])

    setUsedNames(new Set((bookingRows || []).map(row => row.service_type).filter(Boolean)))

    if (error) {
      setCategories(mapFallbackCategories())
      setMessage('Task category table is not available yet. Run the updated Supabase schema to enable category management.')
      return
    }

    setCategories((data || []).map(row => ({ ...row, isShared: !row.host_admin_id })))
    setMessage('')
  }

  useEffect(() => {
    loadCategories()
  }, [])

  useEffect(() => {
    setPage(1)
  }, [search, statusFilter])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return categories.filter(category => {
      if (statusFilter !== 'all' && category.status !== statusFilter) return false
      if (!term) return true
      return [category.name, category.description, category.status]
        .some(value => String(value || '').toLowerCase().includes(term))
    })
  }, [categories, search, statusFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageStart = filtered.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1
  const pageEnd = Math.min(filtered.length, currentPage * PAGE_SIZE)
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  const stats = useMemo(() => {
    const total = categories.length
    const activeCount = categories.filter(category => category.status === 'active').length
    const usedCount = categories.filter(category => usedNames.has(category.name)).length
    const lastUpdatedValue = categories.reduce((latest, category) => {
      if (!category.updated_at) return latest
      return !latest || new Date(category.updated_at) > new Date(latest) ? category.updated_at : latest
    }, null)

    return {
      total,
      activeCount,
      activePercent: total ? Math.round((activeCount / total) * 100) : 0,
      usedCount,
      usedPercent: total ? Math.round((usedCount / total) * 100) : 0,
      lastUpdated: formatUpdatedAt(lastUpdatedValue),
    }
  }, [categories, usedNames])

  const handleCreate = () => {
    setStatusMenuOpen(false)
    setModal({ open: true, editing: { id: null, name: '', description: '', status: 'active' } })
  }

  const handleEdit = (category) => {
    setOpenMenuId(null)
    setStatusMenuOpen(false)
    if (category.isFallback) {
      setMessage('Run the updated Supabase schema before editing default categories.')
      return
    }
    setModal({ open: true, editing: { ...category } })
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
      setMessage('Category name is required.')
      return
    }

    if (!modal.editing?.id && !hostAdminId) {
      setMessage('Could not resolve your company.')
      return
    }

    const { error } = modal.editing?.id
      ? await supabase.from('task_categories').update(payload).eq('id', modal.editing.id)
      : await supabase.from('task_categories').insert({ ...payload, host_admin_id: hostAdminId })

    if (error) {
      setMessage(error.message)
      return
    }

    await supabase.from('audit_logs').insert({
      action: modal.editing?.id ? 'update_task_category' : 'create_task_category',
      details: payload.name,
    })
    setModal({ open: false, editing: null })
    setMessage(modal.editing?.id ? 'Category updated.' : 'Category created.')
    await loadCategories()
  }

  const handleToggleStatus = async (category) => {
    setOpenMenuId(null)
    if (category.isFallback) {
      setMessage('Run the updated Supabase schema before changing default categories.')
      return
    }

    const nextStatus = category.status === 'active' ? 'inactive' : 'active'
    const { error } = await supabase
      .from('task_categories')
      .update({ status: nextStatus, updated_at: new Date().toISOString() })
      .eq('id', category.id)

    if (error) {
      setMessage(error.message)
      return
    }

    await supabase.from('audit_logs').insert({
      action: 'update_task_category',
      details: `${category.name} marked ${nextStatus}`,
    })
    setMessage(`${category.name} marked ${nextStatus}.`)
    await loadCategories()
  }

  const handleDelete = async () => {
    if (!deleteTarget || deleteTarget.isFallback) {
      setMessage('Run the updated Supabase schema before deleting default categories.')
      setDeleteTarget(null)
      return
    }

    const { error } = await supabase
      .from('task_categories')
      .delete()
      .eq('id', deleteTarget.id)

    if (error) {
      setMessage(error.message)
      return
    }

    await supabase.from('audit_logs').insert({
      action: 'delete_task_category',
      details: deleteTarget.name,
    })
    setDeleteTarget(null)
    setMessage('Category deleted.')
    await loadCategories()
  }

  return (
    <div className="max-w-6xl mx-auto" onClick={() => openMenuId && setOpenMenuId(null)}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent-100 text-accent-600">
            <Tags className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Service Categories</h1>
            <p className="text-gray-500 text-sm mt-1">Manage the service types customers and tasks can choose from — bookings, tasks, and the marketing page all use this list.</p>
          </div>
        </div>
        <button onClick={handleCreate} className="inline-flex min-w-44 items-center justify-center gap-2 rounded-lg bg-accent hover:bg-accent-600 px-4 py-2 text-sm font-semibold text-white transition">
          <Plus className="w-5 h-5 shrink-0" />
          Create Category
        </button>
      </div>

      {message && <div className="mb-4 rounded-lg border border-accent-200 bg-accent-100 px-4 py-3 text-sm text-accent-800">{message}</div>}

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={Tags} iconBg="bg-blue-100" iconColor="text-blue-600" label="Total Categories" value={stats.total} subLabel="Active" subColor="text-gray-400" />
        <StatCard icon={CheckCircle2} iconBg="bg-green-100" iconColor="text-green-600" label="Active" value={stats.activeCount} subLabel={`${stats.activePercent}%`} subColor="text-green-600" />
        <StatCard icon={Eye} iconBg="bg-amber-100" iconColor="text-amber-600" label="Used in Bookings" value={stats.usedCount} subLabel={`${stats.usedPercent}%`} subColor="text-amber-600" />
        <StatCard icon={Calendar} iconBg="bg-purple-100" iconColor="text-purple-600" label="Last Updated" value={stats.lastUpdated.headline} subLabel={stats.lastUpdated.detail} subColor="text-gray-400" />
      </div>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Search categories..."
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
            <option value="all">All Categories</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        </div>
      </div>

      <div className="overflow-visible rounded-xl border border-gray-100 bg-white shadow-sm">
        <div className="hidden grid-cols-[1.3fr_1.6fr_0.7fr_0.9fr] gap-4 border-b border-gray-100 bg-gray-50 px-5 py-3 text-xs font-semibold uppercase text-gray-500 md:grid">
          <span>Name</span>
          <span>Description</span>
          <span>Status</span>
          <span>Actions</span>
        </div>
        <div className="divide-y divide-gray-100">
          {paginated.map(category => {
            const CategoryIcon = iconFor(category.name)
            const isActive = category.status === 'active'
            return (
              <div key={category.id} className="grid gap-4 px-5 py-4 md:grid-cols-[1.3fr_1.6fr_0.7fr_0.9fr] md:items-center">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent-100 text-accent-600">
                    <CategoryIcon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{category.name}</p>
                    {category.isShared && <span className="text-xs text-gray-400">Shared default</span>}
                  </div>
                </div>
                <p className="text-sm text-gray-600">{category.description || 'No description'}</p>
                <span className={`inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${isActive ? 'bg-green-500' : 'bg-gray-400'}`} />
                  {isActive ? 'Active' : 'Inactive'}
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => handleEdit(category)}
                    disabled={category.isFallback}
                    className="inline-flex items-center gap-1 rounded-lg bg-accent-100 px-3 py-2 text-xs font-medium text-accent-600 hover:bg-accent-200 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Edit className="h-3.5 w-3.5" />
                    Edit
                  </button>
                  <button
                    onClick={() => setDeleteTarget(category)}
                    disabled={category.isFallback}
                    className="inline-flex items-center gap-1 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </button>
                  <div className="relative">
                    <button
                      onClick={(event) => { event.stopPropagation(); setOpenMenuId(openMenuId === category.id ? null : category.id) }}
                      className="inline-flex items-center justify-center rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </button>
                    {openMenuId === category.id && (
                      <div onClick={event => event.stopPropagation()} className="absolute right-0 z-10 mt-1 w-40 rounded-lg border border-gray-100 bg-white py-1 shadow-lg">
                        <button
                          onClick={() => handleToggleStatus(category)}
                          disabled={category.isFallback}
                          className="block w-full px-3 py-2 text-left text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
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
          {filtered.length === 0 && <div className="px-5 py-12 text-center text-sm text-gray-400">No categories found.</div>}
        </div>
      </div>

      {filtered.length > 0 && (
        <div className="mt-4 flex flex-col items-center justify-between gap-3 sm:flex-row">
          <p className="text-sm text-gray-500">
            Showing {pageStart} to {pageEnd} of {filtered.length} categories
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

      {modal.open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => statusMenuOpen && setStatusMenuOpen(false)}
        >
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div className="flex items-start gap-4">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent-100 text-accent-600">
                  <Tag className="h-6 w-6" />
                </span>
                <div>
                  <h3 className="text-xl font-bold text-gray-900">{modal.editing?.id ? 'Edit Category' : 'Create Category'}</h3>
                  <p className="mt-0.5 text-sm text-gray-500">
                    {modal.editing?.id ? 'Update the details of this service category.' : 'Add a new service category for your business.'}
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
                  Category Name <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Tag className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-accent-500" />
                  <input
                    value={modal.editing?.name || ''}
                    onChange={event => updateEditing({ name: event.target.value.slice(0, 100) })}
                    required
                    maxLength={100}
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
                  placeholder="Describe this category. This will help your team and customers understand what it includes."
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
                Inactive categories won&apos;t be visible to customers or in task selection.
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
                  {modal.editing?.id ? 'Update Category' : 'Create Category'}
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
              {deleteTarget.name} will be removed from the task category list. Existing tasks that already used this category will keep their saved category text.
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

function StatCard({ icon: Icon, iconBg, iconColor, label, value, subLabel, subColor }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-3 shadow-sm">
      <div className="flex items-center gap-3">
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${iconBg} ${iconColor}`}>
          <Icon className="h-5 w-5" />
        </span>
        <p className="text-sm font-medium text-gray-500">{label}</p>
      </div>
      <p className="mt-3 text-2xl font-bold text-gray-900">{value}</p>
      {subLabel && <p className={`mt-1 text-xs font-medium ${subColor}`}>{subLabel}</p>}
    </div>
  )
}
