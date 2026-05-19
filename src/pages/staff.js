import Layout from '../components/Layout'
import { useState } from 'react'
import { Search, Plus, X, AlertCircle, Eye, Edit, Trash2, Star, Mail, Phone, MapPin, User, Briefcase, Award } from 'lucide-react'

const initialStaff = [
  { id: 1, name: 'John Smith', role: 'Technician', email: 'john@company.com', phone: '+60 12-345 6789', location: 'Zone A', status: 'Active', skills: 'Maintenance, Repair', tasks: 2, rating: 4.8, completed: 48 },
  { id: 2, name: 'Sarah Lee', role: 'Inspector', email: 'sarah@company.com', phone: '+60 13-456 7890', location: 'Zone B', status: 'Active', skills: 'Inspection, Safety', tasks: 4, rating: 4.9, completed: 67 },
  { id: 3, name: 'Mike Chan', role: 'Operator', email: 'mike@company.com', phone: '+60 14-567 8901', location: 'Zone A', status: 'Suspended', skills: 'Cleaning, Operation', tasks: 1, rating: 4.6, completed: 32 },
  { id: 4, name: 'Emma Wong', role: 'Coordinator', email: 'emma@company.com', phone: '+60 16-678 9012', location: 'Zone C', status: 'Active', skills: 'Administration, Coordination', tasks: 0, rating: 4.7, completed: 55 },
  { id: 5, name: 'David Lim', role: 'Technician', email: 'david@company.com', phone: '+60 17-789 0123', location: 'Zone B', status: 'Active', skills: 'Electrical, Repair', tasks: 3, rating: 4.5, completed: 41 },
]

export default function StaffManagement() {
  const [staff, setStaff] = useState(initialStaff)
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState({ open: false, editing: null, viewing: null })
  const [suspendTarget, setSuspendTarget] = useState(null)

  const handleCreate = () => {
    setModal({ open: true, editing: { id: null, name: '', role: '', email: '', phone: '', location: 'Zone A', status: 'Active', skills: '', tasks: 0, rating: 0, completed: 0 }, viewing: null })
  }

  const handleEdit = (staffMember) => {
    setModal({ open: true, editing: { ...staffMember }, viewing: null })
  }

  const handleView = (staffMember) => {
    setModal({ open: true, editing: null, viewing: staffMember })
  }

  const handleSave = (data) => {
    if (data.id) {
      setStaff(staff.map(s => s.id === data.id ? data : s))
    } else {
      setStaff([...staff, { ...data, id: Date.now(), status: 'Active', tasks: 0, rating: 0, completed: 0 }])
    }
    setModal({ open: false, editing: null, viewing: null })
  }

  const handleToggleSuspend = (id) => {
    setStaff(staff.map(s => s.id === id ? { ...s, status: s.status === 'Active' ? 'Suspended' : 'Active' } : s))
    setSuspendTarget(null)
  }

  const filtered = staff.filter(s => s.name.toLowerCase().includes(search.toLowerCase()) || s.role.toLowerCase().includes(search.toLowerCase()) || s.skills.toLowerCase().includes(search.toLowerCase()))

  const statusColor = { 'Active': 'bg-green-100 text-green-700', 'Suspended': 'bg-red-100 text-red-700' }

  return (
    <Layout role="manager">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Staff Profiles</h1>
            <p className="text-gray-500 text-sm mt-1">Manage staff information, skills, and status</p>
          </div>
          <button onClick={handleCreate} className="bg-gradient-to-r from-blue-500 to-green-500 text-white px-5 py-2.5 rounded-lg flex items-center gap-2 text-sm font-medium shadow-md hover:shadow-lg transition">
            <Plus className="w-5 h-5" /> Create Staff Profile
          </button>
        </div>

        {/* Search Bar */}
        <div className="relative mb-8">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input 
            value={search} 
            onChange={e => setSearch(e.target.value)} 
            placeholder="Search by name, role, or skills..." 
            className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" 
          />
        </div>

        {/* Staff Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map(s => (
            <div 
              key={s.id} 
              className="bg-white rounded-xl shadow-md border border-gray-100 overflow-hidden hover:shadow-lg transition cursor-pointer"
              onClick={() => handleView(s)}
            >
              {/* Card Header with avatar and status */}
              <div className="p-5 pb-3 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-gradient-to-br from-blue-400 to-green-400 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-sm">
                      {s.name.split(' ').map(n => n[0]).join('')}
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-800 text-lg">{s.name}</h3>
                      <p className="text-sm text-gray-500 flex items-center gap-1 mt-0.5"><Briefcase className="w-3.5 h-3.5" /> {s.role}</p>
                    </div>
                  </div>
                  <span className={`text-sm px-3 py-1 rounded-full font-medium ${statusColor[s.status]}`}>{s.status}</span>
                </div>
              </div>

              {/* Card Body - details */}
              <div className="p-5 space-y-3">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="flex items-center gap-2 text-gray-600"><MapPin className="w-4 h-4" /> {s.location}</div>
                  <div className="flex items-center gap-2 text-gray-600"><Award className="w-4 h-4" /> Skills: {s.skills}</div>
                  <div className="flex items-center gap-2 text-gray-600"><Star className="w-4 h-4 fill-yellow-400 text-yellow-400" /> Rating: {s.rating}</div>
                  <div className="flex items-center gap-2 text-gray-600"><span className="w-4"></span> Tasks: {s.tasks} active</div>
                </div>
              </div>

              {/* Card Footer - action buttons */}
              <div className="p-4 pt-3 border-t border-gray-100 flex gap-3">
                <button 
                  onClick={(e) => { e.stopPropagation(); handleEdit(s) }} 
                  className="flex-1 bg-blue-50 text-blue-600 py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-2 hover:bg-blue-100 transition"
                >
                  <Edit className="w-4 h-4" /> Edit
                </button>
                <button 
                  onClick={(e) => { e.stopPropagation(); setSuspendTarget(s) }} 
                  className={`flex-1 py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition ${s.status === 'Active' ? 'bg-orange-50 text-orange-600 hover:bg-orange-100' : 'bg-green-50 text-green-600 hover:bg-green-100'}`}
                >
                  {s.status === 'Active' ? 'Suspend' : 'Activate'}
                </button>
              </div>
            </div>
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <Search className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>No staff profiles found matching your search.</p>
          </div>
        )}
      </div>

      {/* Modal for Create/Edit/View - same as before but keep */}
      {modal.open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold">
                {modal.viewing ? 'Staff Profile Details' : (modal.editing?.id ? 'Edit Staff' : 'Create Staff Profile')}
              </h3>
              <button onClick={() => setModal({ open: false, editing: null, viewing: null })} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5 text-gray-500" /></button>
            </div>

            {modal.viewing ? (
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <p><strong>Name:</strong> {modal.viewing.name}</p>
                  <p><strong>Role:</strong> {modal.viewing.role}</p>
                  <p><strong>Email:</strong> {modal.viewing.email}</p>
                  <p><strong>Phone:</strong> {modal.viewing.phone}</p>
                  <p><strong>Location:</strong> {modal.viewing.location}</p>
                  <p><strong>Skills:</strong> {modal.viewing.skills}</p>
                  <p><strong>Status:</strong> <span className={`px-2 py-0.5 rounded-full text-xs ${statusColor[modal.viewing.status]}`}>{modal.viewing.status}</span></p>
                  <p><strong>Active Tasks:</strong> {modal.viewing.tasks}</p>
                  <p><strong>Completed Tasks:</strong> {modal.viewing.completed}</p>
                  <p><strong>Rating:</strong> ⭐{modal.viewing.rating}</p>
                </div>
              </div>
            ) : (
              <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.target); handleSave({ id: modal.editing?.id, name: fd.get('name'), role: fd.get('role'), email: fd.get('email'), phone: fd.get('phone'), location: fd.get('location'), skills: fd.get('skills'), status: modal.editing?.status || 'Active', tasks: modal.editing?.tasks || 0, rating: modal.editing?.rating || 0, completed: modal.editing?.completed || 0 }); }}>
                <input name="name" defaultValue={modal.editing?.name} placeholder="Full Name" className="w-full border rounded-lg p-3 my-2 text-sm" required />
                <input name="role" defaultValue={modal.editing?.role} placeholder="Role" className="w-full border rounded-lg p-3 my-2 text-sm" required />
                <input name="email" defaultValue={modal.editing?.email} placeholder="Email" className="w-full border rounded-lg p-3 my-2 text-sm" />
                <input name="phone" defaultValue={modal.editing?.phone} placeholder="Phone" className="w-full border rounded-lg p-3 my-2 text-sm" />
                <input name="location" defaultValue={modal.editing?.location} placeholder="Location (e.g., Zone A)" className="w-full border rounded-lg p-3 my-2 text-sm" />
                <textarea name="skills" defaultValue={modal.editing?.skills} placeholder="Skills (e.g., Maintenance, Repair)" rows={2} className="w-full border rounded-lg p-3 my-2 text-sm" />
                <button type="submit" className="w-full bg-gradient-to-r from-blue-500 to-green-500 text-white py-3 rounded-lg font-medium mt-2">{modal.editing?.id ? 'Update' : 'Create'} Profile</button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Suspend/Activate confirmation modal */}
      {suspendTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-sm w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <AlertCircle className="w-6 h-6 text-orange-500" />
              <h3 className="text-lg font-semibold">Confirm {suspendTarget.status === 'Active' ? 'Suspend' : 'Activate'}</h3>
            </div>
            <p className="text-gray-600 mb-6">
              {suspendTarget.status === 'Active' 
                ? `Are you sure you want to suspend ${suspendTarget.name}? They will not be assigned new tasks.` 
                : `Are you sure you want to activate ${suspendTarget.name}? They will be eligible for task allocation.`}
            </p>
            <div className="flex gap-3">
              <button onClick={() => handleToggleSuspend(suspendTarget.id)} className={`flex-1 py-2.5 rounded-lg font-medium text-white ${suspendTarget.status === 'Active' ? 'bg-orange-500 hover:bg-orange-600' : 'bg-green-500 hover:bg-green-600'}`}>
                {suspendTarget.status === 'Active' ? 'Suspend' : 'Activate'}
              </button>
              <button onClick={() => setSuspendTarget(null)} className="flex-1 py-2.5 rounded-lg font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}