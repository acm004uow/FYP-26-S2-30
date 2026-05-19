import { useState } from 'react'
import { useRouter } from 'next/router'
import { Eye, EyeOff, LayoutDashboard, Users, UserCheck, Shield } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const [showPassword, setShowPassword] = useState(false)
  const [role, setRole] = useState('manager')
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')

  const demoCredentials = {
    manager: { email: 'manager@cleansolutions.com', password: 'manager123' },
    department: { email: 'dept@cleansolutions.com', password: 'dept123' },
    staffMember: { email: 'staff@cleansolutions.com', password: 'staff123' },
    admin: { email: 'admin@cleansolutions.com', password: 'admin123' }
  }

  const handleRoleChange = (newRole) => {
    setRole(newRole)
    setForm(demoCredentials[newRole])
    setError('')
  }

  const handleLogin = (e) => {
    e.preventDefault()
    if (!form.email || !form.password) {
      setError('Please enter email and password.')
      return
    }
    if (role === 'manager') router.push('/manager')
    else if (role === 'department') router.push('/department')
    else if (role === 'staffMember') router.push('/staffMember')
    else router.push('/admin')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-green-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <LayoutDashboard className="w-9 h-9 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800">Smart Task Allocation</h1>
          <p className="text-gray-500 text-sm mt-1">Sign in to your account</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8 border border-gray-100">
          <h2 className="text-xl font-semibold text-gray-800 mb-6">Welcome Back</h2>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">Login As</label>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { id: 'manager', label: 'Manager', icon: LayoutDashboard, color: 'from-blue-500 to-blue-600' },
                  { id: 'department', label: 'Department Staff', icon: Users, color: 'from-green-500 to-green-600' },
                  { id: 'staffMember', label: 'Staff Member', icon: UserCheck, color: 'from-purple-500 to-purple-600' },
                  { id: 'admin', label: 'System Admin', icon: Shield, color: 'from-red-500 to-red-600' }
                ].map(r => (
                  <button key={r.id} type="button" onClick={() => handleRoleChange(r.id)}
                    className={`p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${role === r.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:bg-gray-50'}`}>
                    <div className={`w-12 h-12 rounded-full bg-gradient-to-br ${r.color} flex items-center justify-center`}>
                      <r.icon className="w-6 h-6 text-white" />
                    </div>
                    <span className="text-sm font-medium text-gray-700">{r.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Email Address</label>
              <input
                type="email"
                placeholder="Enter your email"
                value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-gray-50"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  value={form.password}
                  onChange={e => setForm({ ...form, password: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-gray-50 pr-12"
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between text-sm">
              <label className="flex items-center gap-2 text-gray-600 cursor-pointer">
                <input type="checkbox" className="rounded border-gray-300 text-blue-500" />
                Remember me
              </label>
              <a href="#" className="text-blue-500 hover:underline">Forgot password?</a>
            </div>

            <button type="submit"
              className="w-full py-3 bg-gradient-to-r from-blue-500 to-green-500 text-white rounded-xl font-semibold text-sm hover:from-blue-600 hover:to-green-600 transition shadow-md hover:shadow-lg">
              Sign In
            </button>
          </form>

          <p className="text-center text-xs text-gray-400 mt-6">
            Demo credentials pre‑filled for each role.
          </p>
        </div>
      </div>
    </div>
  )
}