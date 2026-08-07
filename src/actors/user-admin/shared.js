import { useState } from 'react'
import { Building2, KeyRound, Plus, Users as UsersIcon, X } from 'lucide-react'

export const ROLE_META = {
  system_admin: { label: 'Owner', pill: 'bg-purple-100 text-purple-700' },
  manager: { label: 'Manager', pill: 'bg-teal-100 text-teal-700' },
  staff_member: { label: 'Staff Member', pill: 'bg-green-100 text-green-700' },
  department_staff: { label: 'Department Staff', pill: 'bg-orange-100 text-orange-700' },
  customer: { label: 'Customer', pill: 'bg-blue-100 text-blue-700' },
  user_admin: { label: 'User Admin', pill: 'bg-gray-100 text-gray-700' },
}
export const roleLabel = (role) => ROLE_META[role]?.label || role

// Roles selectable when inviting a brand new user. system_admin is deliberately excluded —
// creating an owner is what the "Add Company" flow is for, since it also sets up host_admin_id.
export const ADD_USER_ROLES = ['manager', 'staff_member', 'department_staff', 'customer', 'user_admin']

const AVATAR_PALETTE = [
  { bg: 'bg-purple-100', text: 'text-purple-600' },
  { bg: 'bg-teal-100', text: 'text-teal-600' },
  { bg: 'bg-pink-100', text: 'text-pink-600' },
  { bg: 'bg-orange-100', text: 'text-orange-600' },
  { bg: 'bg-blue-100', text: 'text-blue-600' },
  { bg: 'bg-green-100', text: 'text-green-600' },
]

export const initialsOf = (name) => (name || '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()

export const avatarPaletteFor = (name) => {
  let hash = 0
  for (let i = 0; i < (name || '').length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length]
}

export function AddCompanyModal({ onClose, onCreate, saving }) {
  const [form, setForm] = useState({ businessName: '', ownerName: '', email: '' })

  const handleSubmit = (event) => {
    event.preventDefault()
    onCreate(form)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl" onClick={event => event.stopPropagation()}>
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-purple-100 text-purple-600">
              <Building2 className="h-6 w-6" />
            </span>
            <div>
              <h3 className="text-xl font-bold text-gray-900">Add Company</h3>
              <p className="mt-0.5 text-sm text-gray-500">Creates a new owner account. They&apos;ll get an email to set their password.</p>
            </div>
          </div>
          <button onClick={onClose} className="shrink-0 rounded-lg p-1 hover:bg-gray-100">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-semibold text-gray-800">Business Name</label>
            <input
              value={form.businessName}
              onChange={event => setForm(f => ({ ...f, businessName: event.target.value }))}
              required
              className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-semibold text-gray-800">Owner Full Name</label>
            <input
              value={form.ownerName}
              onChange={event => setForm(f => ({ ...f, ownerName: event.target.value }))}
              required
              className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-semibold text-gray-800">Owner Email</label>
            <input
              type="email"
              value={form.email}
              onChange={event => setForm(f => ({ ...f, email: event.target.value }))}
              required
              className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
            />
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-gray-200 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-accent hover:bg-accent-600 py-3 text-sm font-semibold text-white transition disabled:opacity-60">
              <Plus className="h-4 w-4" /> {saving ? 'Creating...' : 'Create Company'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export function AddUserModal({ companies, onClose, onCreate, saving }) {
  const [form, setForm] = useState({ fullName: '', email: '', role: 'manager', companyId: '' })

  const handleSubmit = (event) => {
    event.preventDefault()
    onCreate(form)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl" onClick={event => event.stopPropagation()}>
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-600">
              <UsersIcon className="h-6 w-6" />
            </span>
            <div>
              <h3 className="text-xl font-bold text-gray-900">Add User</h3>
              <p className="mt-0.5 text-sm text-gray-500">Invites a new user and, if applicable, assigns them to a company.</p>
            </div>
          </div>
          <button onClick={onClose} className="shrink-0 rounded-lg p-1 hover:bg-gray-100">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-semibold text-gray-800">Full Name</label>
            <input
              value={form.fullName}
              onChange={event => setForm(f => ({ ...f, fullName: event.target.value }))}
              required
              className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-semibold text-gray-800">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={event => setForm(f => ({ ...f, email: event.target.value }))}
              required
              className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-semibold text-gray-800">Role</label>
            <select
              value={form.role}
              onChange={event => setForm(f => ({ ...f, role: event.target.value, companyId: '' }))}
              className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
            >
              {ADD_USER_ROLES.map(role => <option key={role} value={role}>{roleLabel(role)}</option>)}
            </select>
          </div>
          {form.role !== 'user_admin' && (
            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-800">
                Company {form.role === 'customer' && <span className="font-normal text-gray-400">(Optional)</span>}
              </label>
              <select
                value={form.companyId}
                onChange={event => setForm(f => ({ ...f, companyId: event.target.value }))}
                required={form.role !== 'customer'}
                className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
              >
                <option value="">Select a company...</option>
                {companies.map(company => <option key={company.id} value={company.id}>{company.businessName}</option>)}
              </select>
            </div>
          )}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-gray-200 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-accent hover:bg-accent-600 py-3 text-sm font-semibold text-white transition disabled:opacity-60">
              <Plus className="h-4 w-4" /> {saving ? 'Creating...' : 'Create User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Platform admins can activate/deactivate accounts and reset passwords, but not reassign a
// user's role — that stays an owner-only action, scoped to their own company (see
// app/api/admin/update-role/route.js).
export function ManageUserModal({ user, currentUserId, onClose, onToggleStatus, onResetPassword }) {
  const [resetMode, setResetMode] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const palette = avatarPaletteFor(user.full_name || user.email)
  const isSelf = user.id === currentUserId
  const meta = ROLE_META[user.role]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl" onClick={event => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${palette.bg} ${palette.text}`}>
              {initialsOf(user.full_name || user.email)}
            </span>
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-1.5 truncate text-base font-bold text-gray-900">
                {user.full_name || 'Unnamed'}
                {isSelf && <span className="shrink-0 rounded-full bg-accent-100 px-1.5 py-0.5 text-[10px] font-medium text-accent-800">You</span>}
              </p>
              <p className="truncate text-xs text-gray-500">{user.email}</p>
            </div>
          </div>
          <button onClick={onClose} className="shrink-0 rounded-lg p-1 text-gray-400 hover:bg-gray-100" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${user.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
            {user.status === 'active' ? 'active' : 'inactive'}
          </span>
          <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${meta?.pill || 'bg-gray-100 text-gray-700'}`}>
            {roleLabel(user.role)}
          </span>
        </div>

        <p className="mt-3 text-xs text-gray-500">{user.business_name || 'No company'} • Joined {user.created_at ? new Date(user.created_at).toLocaleDateString() : 'Unknown'}</p>
        <p className="mt-3 text-xs text-gray-400">Role changes aren&apos;t made here — that stays with each company&apos;s own owner.</p>

        {resetMode ? (
          <div className="mt-4 space-y-2">
            <input
              type="password"
              value={newPassword}
              onChange={event => setNewPassword(event.target.value)}
              placeholder="New temporary password"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { onResetPassword(user.id, user.email, newPassword); setResetMode(false); setNewPassword('') }}
                disabled={!newPassword}
                className="flex-1 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white hover:bg-accent-600 disabled:opacity-50"
              >
                Confirm Reset
              </button>
              <button type="button" onClick={() => setResetMode(false)} className="flex-1 rounded-lg bg-gray-100 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-200">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-6 flex items-center gap-3">
            <button
              onClick={() => setResetMode(true)}
              className="inline-flex flex-1 items-center justify-center gap-1 rounded-full border border-green-200 bg-white px-4 py-2 text-xs font-medium text-green-700 hover:bg-green-50"
            >
              <KeyRound className="h-3.5 w-3.5" /> Reset Password
            </button>
            <button
              onClick={() => onToggleStatus(user)}
              disabled={isSelf}
              className={`inline-flex flex-1 items-center justify-center gap-1 rounded-full px-4 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-gray-300 ${user.status === 'active' ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}`}
            >
              {user.status === 'active' ? 'Deactivate' : 'Reactivate'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
