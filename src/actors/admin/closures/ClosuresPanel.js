import { useEffect, useState } from 'react'
import { AlertCircle, Calendar, CalendarOff, Plus, Trash2, X } from 'lucide-react'
import { supabase } from '../../../../lib/supabaseClient'

export default function ClosuresPanel() {
  const [closures, setClosures] = useState([])
  const [hostAdminId, setHostAdminId] = useState(null)
  const [message, setMessage] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
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

  const loadClosures = async () => {
    const resolvedHostAdminId = await resolveHostAdminId()
    setHostAdminId(resolvedHostAdminId)
    if (!resolvedHostAdminId) {
      setClosures([])
      return
    }

    const { data, error } = await supabase
      .from('business_closures')
      .select('id,start_date,end_date,reason,created_at')
      .eq('host_admin_id', resolvedHostAdminId)
      .order('start_date')

    if (error) {
      setMessage(error.message)
      return
    }
    setClosures(data || [])
  }

  useEffect(() => {
    loadClosures()
  }, [])

  const handleSave = async (event) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const startDate = String(formData.get('start_date') || '')
    const endDate = String(formData.get('end_date') || '')
    const reason = String(formData.get('reason') || '').trim()

    if (!startDate || !endDate) {
      setMessage('A start and end date are required.')
      return
    }
    if (endDate < startDate) {
      setMessage('The end date is before the start date.')
      return
    }
    if (!hostAdminId) {
      setMessage('Could not resolve your company.')
      return
    }

    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('business_closures').insert({
      host_admin_id: hostAdminId,
      start_date: startDate,
      end_date: endDate,
      reason: reason || null,
      created_by: user?.id,
    })

    if (error) {
      setMessage(error.message)
      return
    }

    await supabase.from('audit_logs').insert({
      user_id: user?.id,
      action: 'create_business_closure',
      details: `${startDate} to ${endDate}${reason ? ` (${reason})` : ''}`,
    })
    setModalOpen(false)
    setMessage('Closure added.')
    await loadClosures()
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('business_closures').delete().eq('id', deleteTarget.id)

    if (error) {
      setMessage(error.message)
      setDeleteTarget(null)
      return
    }

    await supabase.from('audit_logs').insert({
      user_id: user?.id,
      action: 'delete_business_closure',
      details: `${deleteTarget.start_date} to ${deleteTarget.end_date}${deleteTarget.reason ? ` (${deleteTarget.reason})` : ''}`,
    })
    setDeleteTarget(null)
    setMessage('Closure removed.')
    await loadClosures()
  }

  const addClosureButton = (
    <button
      type="button"
      onClick={() => setModalOpen(true)}
      className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-accent-200 px-4 py-2 text-sm font-semibold text-accent-700 transition hover:bg-accent-100"
    >
      <Plus className="h-4 w-4" /> Add Closure
    </button>
  )

  return (
    <div className="mt-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-500">
            <CalendarOff className="h-6 w-6" />
          </span>
          <div>
            <h2 className="text-lg font-bold text-gray-900">Business Closures</h2>
            <p className="mt-1 text-sm text-gray-500">Prevent bookings on holidays or dates when your business is unavailable.</p>
          </div>
        </div>
        {closures.length > 0 && addClosureButton}
      </div>

      {message && <div className="mt-4 rounded-lg border border-accent-200 bg-accent-100 px-4 py-3 text-sm text-accent-800">{message}</div>}

      {closures.length === 0 ? (
        <div className="mt-5 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50/60 px-6 py-10 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-400">
            <Calendar className="h-6 w-6" />
          </span>
          <p className="mt-3 text-base font-bold text-gray-900">No business closures</p>
          <p className="mt-1 text-sm text-gray-500">Add holidays or dates when bookings are unavailable.</p>
          <div className="mt-4">{addClosureButton}</div>
        </div>
      ) : (
        <div className="mt-5 overflow-hidden rounded-xl border border-gray-100">
          <div className="hidden grid-cols-[1fr_1.5fr_0.6fr] gap-4 border-b border-gray-100 bg-gray-50 px-5 py-3 text-xs font-semibold uppercase text-gray-500 md:grid">
            <span>Period</span>
            <span>Reason</span>
            <span>Actions</span>
          </div>
          <div className="divide-y divide-gray-100">
            {closures.map(closure => (
              <div key={closure.id} className="grid gap-4 px-5 py-4 md:grid-cols-[1fr_1.5fr_0.6fr] md:items-center">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-50 text-red-600">
                    <CalendarOff className="h-5 w-5" />
                  </div>
                  <p className="text-sm font-semibold text-gray-900">
                    {closure.start_date === closure.end_date ? closure.start_date : `${closure.start_date} to ${closure.end_date}`}
                  </p>
                </div>
                <p className="text-sm text-gray-600">{closure.reason || 'No reason given'}</p>
                <div>
                  <button
                    onClick={() => setDeleteTarget(closure)}
                    className="inline-flex items-center gap-1 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Add Closure</h3>
              <button onClick={() => setModalOpen(false)} className="rounded-lg p-1 hover:bg-gray-100">
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">Start Date</label>
                  <input type="date" name="start_date" required className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500" />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">End Date</label>
                  <input type="date" name="end_date" required className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500" />
                </div>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Reason</label>
                <input name="reason" placeholder="e.g. Public Holiday" className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500" />
              </div>
              <button type="submit" className="w-full rounded-lg bg-accent hover:bg-accent-600 py-3 text-sm font-semibold text-white transition">
                Add Closure
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
              Removing this closure means those dates become bookable again, and future schedule generation will no longer skip them.
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
