import { useEffect, useState } from 'react'
import { AlertCircle, Briefcase, Plus, Trash2, X } from 'lucide-react'
import { supabase } from '../../../../lib/supabaseClient'

export default function DepartmentsPanel() {
  const [departments, setDepartments] = useState([])
  const [hostAdminId, setHostAdminId] = useState(null)
  const [message, setMessage] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)

  const resolveHostAdminId = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profile } = await supabase
      .from('profiles')
      .select('role,host_admin_id')
      .eq('id', user?.id)
      .single()

    return profile?.role === 'system_admin' ? user.id : profile?.host_admin_id || null
  }

  const loadDepartments = async () => {
    const resolvedHostAdminId = await resolveHostAdminId()
    setHostAdminId(resolvedHostAdminId)
    if (!resolvedHostAdminId) {
      setDepartments([])
      return
    }

    const { data, error } = await supabase
      .from('departments')
      .select('id,name,created_at')
      .eq('host_admin_id', resolvedHostAdminId)
      .order('name')

    if (error) {
      setMessage(error.message)
      return
    }
    setDepartments(data || [])
  }

  useEffect(() => {
    loadDepartments()
  }, [])

  const handleCreate = async (event) => {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    if (!hostAdminId) {
      setMessage('Could not resolve your company.')
      return
    }

    setSaving(true)
    const { error } = await supabase.from('departments').insert({ host_admin_id: hostAdminId, name: trimmed })
    setSaving(false)

    if (error) {
      setMessage(error.message)
      return
    }

    await supabase.from('audit_logs').insert({ action: 'create_department', details: trimmed })
    setMessage('Department created.')
    setName('')
    setShowCreate(false)
    await loadDepartments()
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
    setMessage('Department deleted.')
    setDeleteTarget(null)
    await loadDepartments()
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Departments</h1>
          <p className="text-gray-500 text-sm mt-1">Departments that can request casual staff for their own tasks (e.g. Sales, Facilities).</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-blue-500 to-green-500 px-5 py-2.5 text-sm font-medium text-white shadow-md hover:shadow-lg">
          <Plus className="w-5 h-5" />
          Add Department
        </button>
      </div>

      {message && <div className="mb-4 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">{message}</div>}

      <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
        <div className="divide-y divide-gray-100">
          {departments.map(department => (
            <div key={department.id} className="flex items-center justify-between gap-4 px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
                  <Briefcase className="h-5 w-5" />
                </div>
                <p className="text-sm font-semibold text-gray-900">{department.name}</p>
              </div>
              <button
                onClick={() => setDeleteTarget(department)}
                className="inline-flex items-center gap-1 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-100"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </button>
            </div>
          ))}
          {departments.length === 0 && <div className="px-5 py-12 text-center text-sm text-gray-400">No departments yet. Add one so you can invite department staff.</div>}
        </div>
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Add Department</h3>
              <button onClick={() => setShowCreate(false)} className="rounded-lg p-1 hover:bg-gray-100">
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Department Name</label>
                <input
                  value={name}
                  onChange={event => setName(event.target.value)}
                  required
                  placeholder="e.g. Sales, Facilities"
                  className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button type="submit" disabled={saving} className="w-full rounded-lg bg-gradient-to-r from-blue-500 to-green-500 py-3 text-sm font-semibold text-white disabled:opacity-60">
                {saving ? 'Creating...' : 'Create Department'}
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
