import Layout from '../components/Layout'
import { useState } from 'react'
import { Search, Plus, X, AlertCircle, Eye, Edit, User, Mail, Shield, Clock, Key, Users } from 'lucide-react'

const initialUsers = [
  { id: 1, username: 'john.tech', email: 'john@demo.com', role: 'staffMember', status: 'Active', linkedStaff: 'John Smith', lastLogin: '2026-05-16 14:30', permissions: 'View Tasks, Update Availability' },
  { id: 2, username: 'sarah.insp', email: 'sarah@demo.com', role: 'staffMember', status: 'Active', linkedStaff: 'Sarah Lee', lastLogin: '2026-05-15 09:45', permissions: 'View Tasks, Update Availability' },
  { id: 3, username: 'dept.lee', email: 'dept@demo.com', role: 'department', status: 'Active', linkedStaff: 'Dept Lee', lastLogin: '2026-05-17 11:20', permissions: 'Create Tasks, View History, Request Allocation' },
  { id: 4, username: 'manager.ahmad', email: 'manager@demo.com', role: 'manager', status: 'Suspended', linkedStaff: 'Manager Ahmad', lastLogin: '2026-05-10 08:15', permissions: 'Full Access (Staff, Tasks, Reports, Accounts)' },
  { id: 5, username: 'cleaner.amy', email: 'amy@demo.com', role: 'staffMember', status: 'Active', linkedStaff: 'Amy Tan', lastLogin: '2026-05-17 07:30', permissions: 'View Tasks, Update Availability' },
]

export default function ManagerUserAccounts() {
  const [users, setUsers] = useState(initialUsers)
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState({ open: false, editing: null, viewing: null })
  const [suspendTarget, setSuspendTarget] = useState(null)

  const handleCreate = () => {
    setModal({ open: true, editing: { id: null, username: '', email: '', role: 'staffMember', linkedStaff: '', status: 'Active' }, viewing: null })
  }

  const handleEdit = (user) => {
    setModal({ open: true, editing: { ...user }, viewing: null })
  }

  const handleView = (user) => {
    setModal({ open: true, editing: null, viewing: user })
  }

  const handleSave = (data) => {
    if (data.id) {
      setUsers(users.map(u => u.id === data.id ? { ...u, ...data } : u))
    } else {
      const newUser = {
        ...data,
        id: Date.now(),
        status: 'Active',
        lastLogin: 'Never',
        permissions: data.role === 'manager' ? 'Full Access' : (data.role === 'department' ? 'Create Tasks, View History, Request Allocation' : 'View Tasks, Update Availability')
      }
      setUsers([...users, newUser])
    }
    setModal({ open: false, editing: null, viewing: null })
  }

  const handleToggleSuspend = (id) => {
    setUsers(users.map(u => u.id === id ? { ...u, status: u.status === 'Active' ? 'Suspended' : 'Active' } : u))
    setSuspendTarget(null)
  }

  const filtered = users.filter(u => u.username.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase()) || u.role.toLowerCase().includes(search.toLowerCase()))

  const roleIcon = { manager: <Shield className="w-4 h-4" />, department: <Users className="w-4 h-4" />, staffMember: <User className="w-4 h-4" /> }

  return (
    <Layout role="manager">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">User Accounts</h1>
            <p className="text-gray-500 text-sm mt-1">Manage system access and permissions</p>
          </div>
          <button onClick={handleCreate} className="bg-gradient-to-r from-blue-500 to-green-500 text-white px-5 py-2.5 rounded-lg flex items-center gap-2 text-sm font-medium shadow-md hover:shadow-lg transition">
            <Plus className="w-5 h-5" /> Create User Account
          </button>
        </div>

        {/* Search Bar */}
        <div className="relative mb-8">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input 
            value={search} 
            onChange={e => setSearch(e.target.value)} 
            placeholder="Search by username, email, or role..." 
            className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" 
          />
        </div>

        {/* User Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map(u => (
            <div 
              key={u.id} 
              className="bg-white rounded-xl shadow-md border border-gray-100 overflow-hidden hover:shadow-lg transition cursor-pointer"
              onClick={() => handleView(u)}
            >
              {/* Card Header */}
              <div className="p-5 pb-3 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-gradient-to-br from-blue-400 to-green-400 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-sm">
                      {u.username.slice(0,2).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-800 text-lg">{u.username}</h3>
                      <p className="text-sm text-gray-500 flex items-center gap-1 mt-0.5">
                        {roleIcon[u.role]} {u.role === 'staffMember' ? 'Staff Member' : u.role === 'department' ? 'Department Staff' : 'Manager'}
                      </p>
                    </div>
                  </div>
                  <span className={`text-sm px-3 py-1 rounded-full font-medium ${u.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {u.status}
                  </span>
                </div>
              </div>

              {/* Card Body */}
              <div className="p-5 space-y-3">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Mail className="w-4 h-4" /> {u.email}
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <User className="w-4 h-4" /> Linked: {u.linkedStaff}
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Clock className="w-4 h-4" /> Last login: {u.lastLogin}
                </div>
                <div className="mt-2 pt-2 border-t border-gray-100">
                  <p className="text-xs text-gray-400 flex items-center gap-1"><Key className="w-3 h-3" /> Permissions</p>
                  <p className="text-sm text-gray-700 mt-1">{u.permissions}</p>
                </div>
              </div>

              {/* Card Footer - Action Buttons */}
              <div className="p-4 pt-3 border-t border-gray-100 flex gap-3">
                <button 
                  onClick={(e) => { e.stopPropagation(); handleView(u) }} 
                  className="flex-1 bg-blue-50 text-blue-600 py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-2 hover:bg-blue-100 transition"
                >
                  <Eye className="w-4 h-4" /> View
                </button>
                <button 
                  onClick={(e) => { e.stopPropagation(); handleEdit(u) }} 
                  className="flex-1 bg-green-50 text-green-600 py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-2 hover:bg-green-100 transition"
                >
                  <Edit className="w-4 h-4" /> Edit
                </button>
                <button 
                  onClick={(e) => { e.stopPropagation(); setSuspendTarget(u) }} 
                  className={`flex-1 py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition ${u.status === 'Active' ? 'bg-orange-50 text-orange-600 hover:bg-orange-100' : 'bg-green-50 text-green-600 hover:bg-green-100'}`}
                >
                  {u.status === 'Active' ? 'Suspend' : 'Activate'}
                </button>
              </div>
            </div>
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <Search className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>No user accounts found matching your search.</p>
          </div>
        )}
      </div>

      {/* Modal for Create/Edit/View */}
      {modal.open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold">
                {modal.viewing ? 'User Account Details' : (modal.editing?.id ? 'Edit User' : 'Create User Account')}
              </h3>
              <button onClick={() => setModal({ open: false, editing: null, viewing: null })} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5 text-gray-500" /></button>
            </div>

            {modal.viewing ? (
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <p><strong>Username:</strong> {modal.viewing.username}</p>
                  <p><strong>Email:</strong> {modal.viewing.email}</p>
                  <p><strong>Role:</strong> {modal.viewing.role}</p>
                  <p><strong>Status:</strong> <span className={`px-2 py-0.5 rounded-full text-xs ${modal.viewing.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{modal.viewing.status}</span></p>
                  <p><strong>Linked Staff:</strong> {modal.viewing.linkedStaff}</p>
                  <p><strong>Last Login:</strong> {modal.viewing.lastLogin}</p>
                  <p className="col-span-2"><strong>Permissions:</strong><br />{modal.viewing.permissions}</p>
                </div>
              </div>
            ) : (
              <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.target); handleSave({ id: modal.editing?.id, username: fd.get('username'), email: fd.get('email'), role: fd.get('role'), linkedStaff: fd.get('linkedStaff'), status: modal.editing?.status || 'Active' }); }}>
                <input name="username" defaultValue={modal.editing?.username} placeholder="Username" className="w-full border rounded-lg p-3 my-2 text-sm" required />
                <input name="email" defaultValue={modal.editing?.email} placeholder="Email" className="w-full border rounded-lg p-3 my-2 text-sm" required />
                <select name="role" defaultValue={modal.editing?.role || 'staffMember'} className="w-full border rounded-lg p-3 my-2 text-sm">
                  <option value="staffMember">Staff Member</option>
                  <option value="department">Department Staff</option>
                  <option value="manager">Manager</option>
                </select>
                <input name="linkedStaff" defaultValue={modal.editing?.linkedStaff} placeholder="Linked Staff Name" className="w-full border rounded-lg p-3 my-2 text-sm" />
                <button type="submit" className="w-full bg-gradient-to-r from-blue-500 to-green-500 text-white py-3 rounded-lg font-medium mt-2">{modal.editing?.id ? 'Update' : 'Create'} Account</button>
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
                ? `Are you sure you want to suspend ${suspendTarget.username}? They will not be able to log in.` 
                : `Are you sure you want to activate ${suspendTarget.username}? They will regain access.`}
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