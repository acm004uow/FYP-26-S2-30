import { Plus, Shield } from 'lucide-react'

const roleLabel = (role) => ({
  manager: 'Manager',
  department_staff: 'Department Staff',
  staff_member: 'Staff Member',
  system_admin: 'System Admin',
}[role] || role)

export default function UserAccountsPanel({ users, onAddUser, onResetUser, onToggleStatus }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold flex items-center gap-2"><Shield className="w-5 h-5 text-blue-500" /> User Accounts</h2>
        <button onClick={onAddUser} className="bg-gradient-to-r from-blue-500 to-green-500 text-white p-1 rounded-lg text-xs flex items-center gap-1"><Plus className="w-3 h-3" /> Add User</button>
      </div>
      <div className="space-y-3">
        {users.map(user => (
          <div key={user.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
            <div>
              <p className="font-medium text-sm">{user.full_name}</p>
              <p className="text-xs text-gray-500">{user.email} - {roleLabel(user.role)}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-xs px-2 py-0.5 rounded-full ${user.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{user.status}</span>
              <button onClick={() => onResetUser(user)} className="text-blue-500 text-xs">Reset</button>
              <button onClick={() => onToggleStatus(user.id, user.status)} className="text-red-500 text-xs">{user.status === 'active' ? 'Deactivate' : 'Activate'}</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
