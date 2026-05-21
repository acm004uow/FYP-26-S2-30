import Layout from '../components/Layout'
import { useEffect, useState } from 'react'
import { CheckCircle, XCircle, Bell } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'

export default function ManagerTaskRequests() {
  const [requests, setRequests] = useState([])
  const [notification, setNotification] = useState(null)

  const loadRequests = async () => {
    const { data } = await supabase
      .from('task_requests')
      .select('id,title,location,priority,status,created_at,profiles(full_name,email)')
      .in('status', ['pending', 'approved', 'rejected'])
      .order('created_at', { ascending: false })
    setRequests(data || [])
  }

  useEffect(() => {
    loadRequests()
  }, [])

  const handleReview = async (id, decision) => {
    const status = decision === 'Approved' ? 'approved' : 'rejected'
    const { error } = await supabase.from('task_requests').update({ status, updated_at: new Date().toISOString() }).eq('id', id)
    await supabase.from('audit_logs').insert({ action: 'review_task_request', details: `Task ${id} ${status}` })
    setNotification(error ? error.message : `Task ${id.slice(0, 8)} ${decision}. Department staff notified.`)
    await loadRequests()
    setTimeout(() => setNotification(null), 3000)
  }

  const statusLabel = (status) => status.replace('_', ' ').replace(/^\w/, c => c.toUpperCase())

  return (
    <Layout role="manager">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold">Task Requests for Review</h1>
        <p className="text-gray-500 mb-6">Assess feasibility and approve or reject.</p>
        {notification && <div className="mb-4 p-3 bg-green-50 text-green-700 rounded-lg flex items-center gap-2"><Bell className="w-4 h-4" />{notification}</div>}
        <div className="space-y-4">
          {requests.map(req => (
            <div key={req.id} className="bg-white rounded-xl shadow-sm border p-5">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-semibold">{req.title}</h3>
                  <p className="text-sm text-gray-500">{req.location} - Priority: {req.priority}</p>
                  <p className="text-xs text-gray-400">Submitted by {req.profiles?.full_name || req.profiles?.email || 'Department Staff'} on {new Date(req.created_at).toLocaleDateString()}</p>
                </div>
                <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-1 rounded-full">{statusLabel(req.status)}</span>
              </div>
              {req.status === 'pending' && (
                <div className="flex gap-3 mt-4">
                  <button onClick={() => handleReview(req.id, 'Approved')} className="flex items-center gap-1 px-4 py-2 bg-green-500 text-white rounded-lg text-sm"><CheckCircle className="w-4 h-4" /> Approve</button>
                  <button onClick={() => handleReview(req.id, 'Rejected')} className="flex items-center gap-1 px-4 py-2 bg-red-500 text-white rounded-lg text-sm"><XCircle className="w-4 h-4" /> Reject</button>
                </div>
              )}
            </div>
          ))}
          {requests.length === 0 && <div className="bg-white rounded-xl border p-8 text-center text-gray-400">No task requests found.</div>}
        </div>
      </div>
    </Layout>
  )
}
