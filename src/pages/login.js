import { useState } from 'react'
import { useRouter } from 'next/router'
import { Eye, EyeOff, LayoutDashboard } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'

const signupRoleLabels = {
  system_admin: 'Owner',
  customer: 'Customer',
}

export default function LoginPage() {
  const router = useRouter()
  const [showPassword, setShowPassword] = useState(false)
  const [form, setForm] = useState({ email: '', password: '' })
  const [signupForm, setSignupForm] = useState({ fullName: '', businessName: '', email: '', password: '' })
  const [verificationCode, setVerificationCode] = useState('')
  const [signupStep, setSignupStep] = useState('details')
  const [signupRole, setSignupRole] = useState(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const routeByRole = {
    manager: '/manager',
    staff_member: '/staffMember',
    system_admin: '/admin',
    customer: '/customer',
    user_admin: '/user-admin',
    department_staff: '/department',
  }

  const ensureProfile = async (accessToken, fallbackRole) => {
    const response = await fetch('/api/auth/ensure-profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: accessToken, fallback_role: fallbackRole }),
    })
    const result = await response.json()
    if (!response.ok) return { data: null, error: result.error || 'Profile could not be created.' }
    return { data: result.profile, error: null }
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    setError('')
    if (!form.email || !form.password) {
      setError('Please enter email and password.')
      return
    }

    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email: form.email,
      password: form.password,
    })

    await supabase.from('security_logs').insert({
      email: form.email,
      event_type: signInError ? 'failed_login' : 'login',
      details: signInError ? signInError.message : 'Successful login',
    })

    if (signInError) {
      setError(signInError.message)
      return
    }

    let { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role,status')
      .eq('id', data.user.id)
      .single()

    if (profileError || !profile) {
      const { data: createdProfile, error: createProfileError } = await ensureProfile(data.session?.access_token)
      if (createProfileError) {
        setError(`Account profile was not found and could not be created: ${createProfileError}`)
        return
      }
      profile = createdProfile
    }

    if (profile.status !== 'active') {
      await supabase.auth.signOut()
      setError('This account is inactive. Contact the account owner.')
      return
    }

    const next = typeof router.query.next === 'string' ? router.query.next : ''
    if (next.startsWith('/') && !next.startsWith('//')) {
      router.push(next)
      return
    }

    router.push(routeByRole[profile.role] || '/login')
  }

  const handleGoogleSignIn = async () => {
    setError('')
    const next = typeof router.query.next === 'string' ? router.query.next : ''
    const redirectTo = `${window.location.origin}/auth/callback${next ? `?next=${encodeURIComponent(next)}` : ''}`
    const { error: oauthError } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } })
    if (oauthError) setError(oauthError.message)
  }

  const signupRoleLabel = signupRoleLabels[signupRole] || ''

  const openSignup = (nextRole) => {
    setSignupRole(nextRole)
    setSignupStep('details')
    setVerificationCode('')
    setError('')
    setMessage('')
  }

  const handleSignup = async (e) => {
    e.preventDefault()
    setError('')
    setMessage('')

    if (signupRole === 'system_admin' && (!signupForm.fullName || !signupForm.businessName || !signupForm.email || !signupForm.password)) {
      setError('Please fill in name, business name, email, and password.')
      return
    }
    if (signupRole === 'customer' && (!signupForm.fullName || !signupForm.email || !signupForm.password)) {
      setError('Please fill in name, email, and password.')
      return
    }

    const metadata = {
      full_name: signupForm.fullName,
      role: signupRole,
    }
    if (signupRole === 'system_admin') metadata.business_name = signupForm.businessName

    const { error: signupError } = await supabase.auth.signUp({
      email: signupForm.email,
      password: signupForm.password,
      options: { data: metadata },
    })

    await supabase.from('security_logs').insert({
      email: signupForm.email,
      event_type: signupError ? 'signup_failed' : 'signup_requested',
      details: signupError ? signupError.message : `${signupRoleLabel} email verification requested`,
    })

    if (signupError) {
      setError(signupError.message)
      return
    }

    setSignupStep('verify')
    setMessage('Verification code sent. Check your email and enter the code.')
  }

  const handleVerifySignup = async (e) => {
    e.preventDefault()
    setError('')
    setMessage('')

    if (!verificationCode) {
      setError('Please enter the verification code from your email.')
      return
    }

    const { data: verifyData, error: verifyError } = await supabase.auth.verifyOtp({
      email: signupForm.email,
      token: verificationCode,
      type: 'signup',
    })

    if (verifyError) {
      setError(verifyError.message)
      return
    }

    if (verifyData.session?.access_token) {
      const { error: profileError } = await ensureProfile(verifyData.session.access_token, signupRole)
      if (profileError) {
        setError(`Email verified, but profile could not be created: ${profileError}`)
        return
      }
    }

    await supabase.from('audit_logs').insert({
      action: 'verify_signup',
      details: `${signupForm.email} as ${signupRole}`,
    })

    setForm({ email: signupForm.email, password: signupForm.password })
    setSignupForm({ fullName: '', businessName: '', email: '', password: '' })
    setVerificationCode('')
    setSignupStep('details')
    setMessage(`Email verified. You can sign in as ${signupRoleLabel} now.`)
    setSignupRole(null)
  }

  const handleResendCode = async () => {
    setError('')
    setMessage('')

    const { error: resendError } = await supabase.auth.resend({
      type: 'signup',
      email: signupForm.email,
    })

    if (resendError) {
      setError(resendError.message)
      return
    }

    setMessage('A new verification code was sent.')
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
          {message && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
              {message}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-5">
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

            <div className="flex items-center gap-3 text-xs text-gray-400">
              <div className="h-px flex-1 bg-gray-200" />
              or
              <div className="h-px flex-1 bg-gray-200" />
            </div>

            <button
              type="button"
              onClick={handleGoogleSignIn}
              className="w-full py-3 border border-gray-200 text-gray-700 rounded-xl font-semibold text-sm hover:bg-gray-50 transition flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" />
                <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
                <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
                <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" />
              </svg>
              Sign in with Google
            </button>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => openSignup('system_admin')}
                className="w-full py-3 border border-blue-200 text-blue-600 rounded-xl font-semibold text-sm hover:bg-blue-50 transition"
              >
                Sign Up as Owner
              </button>
              <button
                type="button"
                onClick={() => openSignup('customer')}
                className="w-full py-3 border border-blue-200 text-blue-600 rounded-xl font-semibold text-sm hover:bg-blue-50 transition"
              >
                Sign Up as Customer
              </button>
            </div>
          </form>

          <p className="text-center text-xs text-gray-400 mt-6">
            Use accounts created in Supabase Auth.
          </p>
        </div>
      </div>

      {signupRole && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-800">Create {signupRoleLabel} Account</h3>
                <p className="text-sm text-gray-500">
                  {signupRole === 'system_admin'
                    ? 'Register your SME and create the first admin account.'
                    : 'Register as a customer to start booking cleaning services.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSignupRole(null)}
                className="rounded-lg px-2 py-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                x
              </button>
            </div>

            {signupStep === 'details' ? (
              <form onSubmit={handleSignup} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Full Name</label>
                  <input
                    value={signupForm.fullName}
                    onChange={e => setSignupForm({ ...signupForm, fullName: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-gray-50"
                    placeholder="Enter your full name"
                  />
                </div>
                {signupRole === 'system_admin' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Business / SME Name</label>
                    <input
                      value={signupForm.businessName}
                      onChange={e => setSignupForm({ ...signupForm, businessName: e.target.value })}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-gray-50"
                      placeholder="Enter your business name"
                    />
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Email Address</label>
                  <input
                    type="email"
                    value={signupForm.email}
                    onChange={e => setSignupForm({ ...signupForm, email: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-gray-50"
                    placeholder={signupRole === 'system_admin' ? 'admin@example.com' : 'you@example.com'}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Password</label>
                  <input
                    type="password"
                    value={signupForm.password}
                    onChange={e => setSignupForm({ ...signupForm, password: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-gray-50"
                    placeholder="Create a password"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-3 bg-gradient-to-r from-blue-500 to-green-500 text-white rounded-xl font-semibold text-sm hover:from-blue-600 hover:to-green-600 transition shadow-md"
                >
                  Send Verification Code
                </button>
              </form>
            ) : (
              <form onSubmit={handleVerifySignup} className="space-y-4">
                <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-700">
                  A verification code was sent to {signupForm.email}.
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Verification Code</label>
                  <input
                    value={verificationCode}
                    onChange={e => setVerificationCode(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-gray-50 tracking-widest"
                    placeholder="Enter email code"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-3 bg-gradient-to-r from-blue-500 to-green-500 text-white rounded-xl font-semibold text-sm hover:from-blue-600 hover:to-green-600 transition shadow-md"
                >
                  Verify Email
                </button>
                <button
                  type="button"
                  onClick={handleResendCode}
                  className="w-full py-3 border border-blue-200 text-blue-600 rounded-xl font-semibold text-sm hover:bg-blue-50 transition"
                >
                  Resend Code
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
