import Layout from '../../../components/Layout'
import { useEffect, useState } from 'react'
import { CheckCircle, XCircle, Bell, GripVertical, MapPin, Star, UserCheck } from 'lucide-react'
import { supabase } from '../../../../lib/supabaseClient'

const priorityColor = {
  High: 'bg-red-100 text-red-600',
  Medium: 'bg-orange-100 text-orange-600',
  Low: 'bg-gray-100 text-gray-600',
}

const statusColor = {
  pending: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
}

const staffStatusColor = {
  Available: 'bg-green-100 text-green-700',
  Busy: 'bg-blue-100 text-blue-700',
  'On Leave': 'bg-gray-100 text-gray-600',
}

export default function ManagerTaskRequests() {
  const [requests, setRequests] = useState([])
  const [staffRows, setStaffRows] = useState([])
  const [notification, setNotification] = useState(null)
  const [draggedStaffId, setDraggedStaffId] = useState(null)
  const [dropTargetId, setDropTargetId] = useState(null)
  const [assigningTaskId, setAssigningTaskId] = useState(null)

  const loadRequests = async () => {
    const [{ data: tasks }, { data: staff }] = await Promise.all([
      supabase
        .from('task_requests')
        .select('id,created_by,title,location,priority,status,created_at,assigned_staff_id,profiles(full_name,email),staff_profiles(staff_name)')
        .in('status', ['pending', 'approved', 'rejected'])
        .order('created_at', { ascending: false }),
      supabase
        .from('staff_profiles')
        .select('id,user_id,staff_name,skills,availability,current_workload,performance_rating,status,is_suspended')
        .eq('status', 'active')
        .order('staff_name'),
    ])

    setRequests(tasks || [])
    setStaffRows((staff || []).map(row => ({
      id: row.id,
      userId: row.user_id,
      name: row.staff_name,
      role: row.skills?.[0] || 'Staff Member',
      status: row.is_suspended ? 'On Leave' : row.availability === 'available' ? 'Available' : 'Busy',
      canAssign: !row.is_suspended && row.status === 'active' && row.availability === 'available',
      tasks: row.current_workload || 0,
      rating: row.performance_rating || 0,
    })))
  }

  useEffect(() => {
    loadRequests()
  }, [])

  const showNotification = (message) => {
    setNotification(message)
    setTimeout(() => setNotification(null), 3000)
  }

  const getActiveManager = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: managerProfile } = await supabase
      .from('profiles')
      .select('role,status')
      .eq('id', user?.id)
      .single()

    if (managerProfile?.role !== 'manager' || managerProfile?.status !== 'active') {
      showNotification('Only an active manager can approve, reject, or assign task requests.')
      return null
    }
    return user
  }

  const handleReview = async (id, decision) => {
    const status = decision === 'Approved' ? 'approved' : 'rejected'
    const user = await getActiveManager()
    if (!user) return

    const { data: reviewedRequest, error } = await supabase
      .from('task_requests')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('status', 'pending')
      .select('id,created_by,title')
      .maybeSingle()

    if (!error && reviewedRequest?.created_by) {
      await supabase.from('notifications').insert({
        user_id: reviewedRequest.created_by,
        title: `Task request ${status}`,
        message: `${reviewedRequest.title} was ${status} by the manager.`,
      })
    }
    if (!error && reviewedRequest) {
      await supabase.from('audit_logs').insert({ user_id: user?.id, action: 'review_task_request', details: `Task ${id} ${status}` })
    }
    showNotification(error
      ? error.message
      : reviewedRequest
        ? `Task ${id.slice(0, 8)} ${decision}. Requester notified.`
        : 'This task request is no longer pending.')
    await loadRequests()
  }

  const handleStaffDragStart = (event, staff) => {
    if (!staff.canAssign) return
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', staff.id)
    setDraggedStaffId(staff.id)
  }

  const handleTaskDragOver = (event, request) => {
    if (request.status === 'rejected') return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setDropTargetId(request.id)
  }

  const handleAssignStaff = async (event, request) => {
    event.preventDefault()
    setDropTargetId(null)
    const staffId = event.dataTransfer.getData('text/plain') || draggedStaffId
    const staff = staffRows.find(item => item.id === staffId)
    if (!staff || request.status === 'rejected') return
    if (!staff.canAssign) {
      showNotification(`${staff.name} is not available for assignment.`)
      return
    }
    if (request.assigned_staff_id === staff.id) {
      showNotification(`${staff.name} is already assigned to ${request.title}.`)
      return
    }

    const user = await getActiveManager()
    if (!user) return

    setAssigningTaskId(request.id)
    const previousStaff = request.assigned_staff_id
      ? staffRows.find(item => item.id === request.assigned_staff_id)
      : null
    const { data: assignedRequest, error } = await supabase
      .from('task_requests')
      .update({
        assigned_staff_id: staff.id,
        status: request.status === 'pending' ? 'approved' : request.status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', request.id)
      .in('status', ['pending', 'approved'])
      .select('id,created_by,title,status')
      .maybeSingle()

    if (error || !assignedRequest) {
      setAssigningTaskId(null)
      showNotification(error?.message || 'This task request cannot be assigned.')
      await loadRequests()
      return
    }

    await Promise.all([
      supabase
        .from('staff_profiles')
        .update({ current_workload: Number(staff.tasks || 0) + 1, updated_at: new Date().toISOString() })
        .eq('id', staff.id),
      previousStaff
        ? supabase
          .from('staff_profiles')
          .update({ current_workload: Math.max(0, Number(previousStaff.tasks || 0) - 1), updated_at: new Date().toISOString() })
          .eq('id', previousStaff.id)
        : Promise.resolve(),
      staff.userId
        ? supabase.from('notifications').insert({
          user_id: staff.userId,
          title: 'New task assignment',
          message: `${assignedRequest.title} has been assigned to you.`,
        })
        : Promise.resolve(),
      request.status === 'pending' && assignedRequest.created_by
        ? supabase.from('notifications').insert({
          user_id: assignedRequest.created_by,
          title: 'Task request approved',
          message: `${assignedRequest.title} was approved and assigned to ${staff.name}.`,
        })
        : Promise.resolve(),
      supabase.from('audit_logs').insert({ user_id: user?.id, action: 'assign_task_drag_drop', details: `${staff.name} assigned to ${assignedRequest.title}` }),
    ])

    setAssigningTaskId(null)
    setDraggedStaffId(null)
    showNotification(`${staff.name} assigned to ${assignedRequest.title}.`)
    await loadRequests()
  }

  const statusLabel = (status) => status.replace('_', ' ').replace(/^\w/, c => c.toUpperCase())

  return (
    <Layout role="manager">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold">Task Requests for Review</h1>
        <p className="text-gray-500 mb-6">Review requests, then drag available staff onto a task to assign it.</p>
        {notification && <div className="mb-4 p-3 bg-green-50 text-green-700 rounded-lg flex items-center gap-2"><Bell className="w-4 h-4" />{notification}</div>}

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-6">
          <div className="space-y-4">
            {requests.map(req => (
              <div
                key={req.id}
                onDragOver={(event) => handleTaskDragOver(event, req)}
                onDragLeave={() => setDropTargetId(null)}
                onDrop={(event) => handleAssignStaff(event, req)}
                className={`bg-white rounded-xl shadow-sm border p-5 transition ${req.status !== 'rejected' ? 'hover:bg-blue-50' : ''} ${dropTargetId === req.id ? 'bg-blue-50 ring-2 ring-inset ring-blue-300' : ''}`}
              >
                <div className="flex justify-between items-start gap-4">
                  <div className="min-w-0">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${priorityColor[req.priority] || priorityColor.Medium}`}>{req.priority}</span>
                    </div>
                    <h3 className="font-semibold text-gray-900">{req.title}</h3>
                    <p className="text-sm text-gray-500 flex items-center gap-1 mt-1"><MapPin className="w-4 h-4" />{req.location}</p>
                    <p className="text-xs text-gray-400 mt-2">Submitted by {req.profiles?.full_name || req.profiles?.email || 'the requester'} on {new Date(req.created_at).toLocaleDateString()}</p>
                    <p className="text-sm text-gray-600 mt-2 flex items-center gap-1"><UserCheck className="w-4 h-4" />Assigned staff: {req.staff_profiles?.staff_name || 'Unassigned'}</p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium flex-shrink-0 ${statusColor[req.status] || 'bg-gray-100 text-gray-600'}`}>
                    {assigningTaskId === req.id ? 'Assigning...' : statusLabel(req.status)}
                  </span>
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

          <div className="bg-white rounded-xl shadow-sm border h-fit overflow-hidden">
            <div className="p-5 border-b">
              <h2 className="font-semibold text-gray-900">Available Staff</h2>
              <p className="text-sm text-gray-500 mt-1">Drag a staff member onto a request.</p>
            </div>
            <div className="divide-y divide-gray-50 max-h-[70vh] overflow-y-auto">
              {staffRows.map(staff => (
                <div
                  key={staff.id}
                  draggable={staff.canAssign}
                  onDragStart={(event) => handleStaffDragStart(event, staff)}
                  onDragEnd={() => {
                    setDraggedStaffId(null)
                    setDropTargetId(null)
                  }}
                  className={`p-4 transition ${staff.canAssign ? 'cursor-grab hover:bg-gray-50 active:cursor-grabbing' : 'cursor-not-allowed opacity-70'} ${draggedStaffId === staff.id ? 'bg-blue-50' : ''}`}
                  title={staff.canAssign ? 'Drag this staff member onto a task request' : 'Only available active staff can be assigned'}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-green-400 rounded-full flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
                      {staff.name.split(' ').map(part => part[0]).join('').slice(0, 2)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-800 truncate">{staff.name}</p>
                      <p className="text-xs text-gray-500 truncate">{staff.role} - {staff.tasks} active tasks</p>
                    </div>
                    {staff.canAssign && <GripVertical className="h-4 w-4 text-gray-300" />}
                    <div className="flex flex-col items-end gap-1">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${staffStatusColor[staff.status]}`}>{staff.status}</span>
                      <span className="text-xs text-yellow-500 flex items-center gap-0.5"><Star className="w-3 h-3 fill-yellow-400" />{staff.rating}</span>
                    </div>
                  </div>
                </div>
              ))}
              {staffRows.length === 0 && <div className="p-8 text-center text-gray-400">No active staff found.</div>}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  )
}
