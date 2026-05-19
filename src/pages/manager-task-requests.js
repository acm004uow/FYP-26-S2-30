import Layout from '../components/Layout'
import { useState } from 'react'
import { CheckCircle, XCircle, Bell } from 'lucide-react'

const initialRequests = [
  { id: 'R101', title: 'Floor Cleaning', location: 'Level 2', priority: 'High', status: 'Pending', submittedBy: 'Dept A', date: '2026-05-17', urgent: true },
  { id: 'R102', title: 'Equipment Check', location: 'Warehouse', priority: 'Medium', status: 'Pending', submittedBy: 'Dept B', date: '2026-05-16', urgent: false },
]

export default function ManagerTaskRequests() {
  const [requests, setRequests] = useState(initialRequests)
  const [notification, setNotification] = useState(null)

  const handleReview = (id, decision) => {
    setRequests(requests.map(r => r.id === id ? { ...r, status: decision } : r))
    setNotification(`Task ${id} ${decision} – department staff notified.`)
    setTimeout(() => setNotification(null), 3000)
  }

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
                  <p className="text-sm text-gray-500">{req.location} • Priority: {req.priority} {req.urgent && <span className="ml-2 text-red-500 text-xs">Urgent</span>}</p>
                  <p className="text-xs text-gray-400">Submitted by {req.submittedBy} on {req.date}</p>
                </div>
                <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-1 rounded-full">{req.status}</span>
              </div>
              <div className="flex gap-3 mt-4">
                <button onClick={() => handleReview(req.id, 'Approved')} className="flex items-center gap-1 px-4 py-2 bg-green-500 text-white rounded-lg text-sm"><CheckCircle className="w-4 h-4" /> Approve</button>
                <button onClick={() => handleReview(req.id, 'Rejected')} className="flex items-center gap-1 px-4 py-2 bg-red-500 text-white rounded-lg text-sm"><XCircle className="w-4 h-4" /> Reject</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Layout>
  )
}