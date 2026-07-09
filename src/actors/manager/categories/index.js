import Layout from '../../../components/Layout'
import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, Edit, Plus, Search, Tags, Trash2, X } from 'lucide-react'
import { supabase } from '../../../../lib/supabaseClient'

const defaultCategories = ['Maintenance', 'Inspection', 'Cleaning', 'Delivery', 'Administration']

export default function ManagerCategories() {
  const [categories, setCategories] = useState([])
  const [search, setSearch] = useState('')
  const [message, setMessage] = useState('')
  const [modal, setModal] = useState({ open: false, editing: null })
  const [deleteTarget, setDeleteTarget] = useState(null)

  const mapFallbackCategories = () => defaultCategories.map(name => ({
    id: name,
    name,
    description: '',
    status: 'active',
    isFallback: true,
  }))

  const loadCategories = async () => {
    const { data, error } = await supabase
      .from('task_categories')
      .select('id,name,description,status,created_at,updated_at')
      .order('name')

    if (error) {
      setCategories(mapFallbackCategories())
      setMessage('Task category table is not available yet. Run the updated Supabase schema to enable category management.')
      return
    }

    setCategories(data || [])
    setMessage('')
  }

  useEffect(() => {
    loadCategories()
  }, [])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return categories
    return categories.filter(category => [
      category.name,
      category.description,
      category.status,
    ].some(value => String(value || '').toLowerCase().includes(term)))
  }, [categories, search])

  const handleCreate = () => {
    setModal({ open: true, editing: { id: null, name: '', description: '', status: 'active' } })
  }

  const handleEdit = (category) => {
    if (category.isFallback) {
      setMessage('Run the updated Supabase schema before editing default categories.')
      return
    }
    setModal({ open: true, editing: { ...category } })
  }

  const handleSave = async (event) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const payload = {
      name: String(formData.get('name') || '').trim(),
      description: String(formData.get('description') || '').trim(),
      status: formData.get('status') || 'active',
      updated_at: new Date().toISOString(),
    }

    if (!payload.name) {
      setMessage('Category name is required.')
      return
    }

    const { error } = modal.editing?.id
      ? await supabase.from('task_categories').update(payload).eq('id', modal.editing.id)
      : await supabase.from('task_categories').insert(payload)

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
    <Layout role="manager">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Task Categories</h1>
            <p className="text-gray-500 text-sm mt-1">Manage the categories shown when tasks are created.</p>
          </div>
          <button onClick={handleCreate} className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-blue-500 to-green-500 px-5 py-2.5 text-sm font-medium text-white shadow-md hover:shadow-lg">
            <Plus className="w-5 h-5" />
            Create Category
          </button>
        </div>

        {message && <div className="mb-4 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">{message}</div>}

        <div className="relative mb-6">
          <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Search categories..."
            className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-12 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
          <div className="hidden grid-cols-[1fr_1.5fr_0.8fr] gap-4 border-b border-gray-100 bg-gray-50 px-5 py-3 text-xs font-semibold uppercase text-gray-500 md:grid">
            <span>Name</span>
            <span>Description</span>
            <span>Actions</span>
          </div>
          <div className="divide-y divide-gray-100">
            {filtered.map(category => (
              <div key={category.id} className="grid gap-4 px-5 py-4 md:grid-cols-[1fr_1.5fr_0.8fr] md:items-center">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                    <Tags className="h-5 w-5" />
                  </div>
                  <p className="text-sm font-semibold text-gray-900">{category.name}</p>
                </div>
                <p className="text-sm text-gray-600">{category.description || 'No description'}</p>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => handleEdit(category)} className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-3 py-2 text-xs font-medium text-blue-600 hover:bg-blue-100">
                    <Edit className="h-3.5 w-3.5" />
                    Edit
                  </button>
                  <button onClick={() => setDeleteTarget(category)} className="inline-flex items-center gap-1 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-100">
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </button>
                </div>
              </div>
            ))}
            {filtered.length === 0 && <div className="px-5 py-12 text-center text-sm text-gray-400">No categories found.</div>}
          </div>
        </div>
      </div>

      {modal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">{modal.editing?.id ? 'Edit Category' : 'Create Category'}</h3>
              <button onClick={() => setModal({ open: false, editing: null })} className="rounded-lg p-1 hover:bg-gray-100">
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Category Name</label>
                <input name="name" defaultValue={modal.editing?.name} required className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Description</label>
                <textarea name="description" defaultValue={modal.editing?.description} rows={3} className="w-full resize-none rounded-lg border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <input type="hidden" name="status" value={modal.editing?.status || 'active'} />
              <button type="submit" className="w-full rounded-lg bg-gradient-to-r from-blue-500 to-green-500 py-3 text-sm font-semibold text-white">
                {modal.editing?.id ? 'Update Category' : 'Create Category'}
              </button>
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
    </Layout>
  )
}
