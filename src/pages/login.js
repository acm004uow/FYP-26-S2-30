import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import { Eye, EyeOff, LayoutDashboard, MailCheck } from 'lucide-react'
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
  const [codeDigits, setCodeDigits] = useState(['', '', '', '', '', ''])
  const codeInputRefs = useRef([])
  const verificationCode = codeDigits.join('')
  const [signupStep, setSignupStep] = useState('details')
  const [signupRole, setSignupRole] = useState(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [isCustomerBookingFlow, setIsCustomerBookingFlow] = useState(false)
  const [isOwnerFlow, setIsOwnerFlow] = useState(false)

  useEffect(() => {
    if (router.query.locked === '1') {
      setError('Your account has been locked after repeated last-minute booking cancellations. Contact your service provider to reactivate it.')
    }
  }, [router.query.locked])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const next = params.get('next') || ''
    const mode = params.get('mode')
    setIsCustomerBookingFlow(next.startsWith('/customer-book'))
    setIsOwnerFlow(mode === 'owner')
  }, [])

  const routeByRole = {
    manager: '/manager',
    staff_member: '/staffMember',
    system_admin: '/admin',
    customer: '/customer',
    user_admin: '/user-admin',
    department_staff: '/department',
  }

  const canAccessNextRoute = (next, role) => {
    const roleBase = routeByRole[role]
    if (!roleBase || !next.startsWith('/') || next.startsWith('//')) return false

    // This project uses both nested routes and hyphenated role routes, such
    // as /manager-reports and /department-time-off.
    return next === roleBase
      || next.startsWith(`${roleBase}/`)
      || next.startsWith(`${roleBase}-`)
      || next.startsWith(`${roleBase}?`)
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
      setError(
        profile.status === 'locked'
          ? 'This account has been locked after repeated last-minute booking cancellations. Contact your service provider to reactivate it.'
          : 'This account is inactive. Contact the account owner.'
      )
      return
    }

    // First successful login after being invited — lets the Users panels distinguish
    // "invited, hasn't signed in yet" (Pending) from actually active. Only ever set once.
    await supabase
      .from('profiles')
      .update({ first_login_at: new Date().toISOString() })
      .eq('id', data.user.id)
      .is('first_login_at', null)

    const next = typeof router.query.next === 'string' ? router.query.next : ''
    if (canAccessNextRoute(next, profile.role)) {
      router.replace(next)
      return
    }

    router.replace(routeByRole[profile.role] || '/login')
  }

  const signupRoleLabel = signupRoleLabels[signupRole] || ''

  const openSignup = (nextRole) => {
    setSignupRole(nextRole)
    setSignupStep('details')
    setCodeDigits(['', '', '', '', '', ''])
    setError('')
    setMessage('')
  }

  const closeSignup = () => {
    setSignupRole(null)
  }

  const handleCodeDigitChange = (index, rawValue) => {
    const digit = rawValue.replace(/\D/g, '').slice(-1)
    setCodeDigits(prev => {
      const next = [...prev]
      next[index] = digit
      return next
    })
    if (digit && codeInputRefs.current[index + 1]) {
      codeInputRefs.current[index + 1].focus()
    }
  }

  const handleCodeDigitKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !codeDigits[index] && index > 0) {
      codeInputRefs.current[index - 1]?.focus()
    }
  }

  const handleCodePaste = (e) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (!pasted) return
    setCodeDigits(Array.from({ length: 6 }, (_, i) => pasted[i] || ''))
    codeInputRefs.current[Math.min(pasted.length, 5)]?.focus()
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
    setCodeDigits(['', '', '', '', '', ''])
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
    <div className="min-h-screen bg-accent2-500 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-9 h-9 bg-accent rounded-md flex items-center justify-center mx-auto mb-4">
            <LayoutDashboard className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-lg font-bold text-white">Swee</h1>
          <p className="text-gray-300 text-sm mt-1">Sign in to your account</p>
        </div>

        <div className="bg-white rounded-xl shadow-lg p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-1">Welcome back</h2>
          <p className="text-sm text-gray-500 mb-6">Log in to your account to continue.</p>

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
              <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
              <input
                type="email"
                placeholder="you@company.com"
                value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent text-sm bg-white"
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
                  className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent text-sm bg-white pr-12"
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between text-sm">
              <label className="flex items-center gap-2 text-gray-600 cursor-pointer">
                <input type="checkbox" className="rounded border-gray-300 text-accent-500" />
                Remember me
              </label>
              <a href="#" className="text-accent-600 hover:underline">Forgot password?</a>
            </div>

            <button type="submit"
              className="w-full py-3 bg-accent text-white rounded-lg font-semibold text-sm hover:bg-accent-600 active:bg-accent-700 transition">
              Log in
            </button>

            <div className={isCustomerBookingFlow || isOwnerFlow ? '' : 'grid grid-cols-2 gap-3'}>
              {!isCustomerBookingFlow && (
                <button
                  type="button"
                  onClick={() => openSignup('system_admin')}
                  className="w-full py-3 border border-accent-200 text-accent-600 rounded-lg font-semibold text-sm hover:bg-accent-100 transition"
                >
                  Sign Up as Owner
                </button>
              )}
              {!isOwnerFlow && (
                <button
                  type="button"
                  onClick={() => openSignup('customer')}
                  className="w-full py-3 border border-accent-200 text-accent-600 rounded-lg font-semibold text-sm hover:bg-accent-100 transition"
                >
                  Sign Up as Customer
                </button>
              )}
            </div>
          </form>

          <p className="text-center text-xs text-gray-400 mt-6">
            Use accounts created in Supabase Auth.
          </p>
        </div>
      </div>

      {signupRole && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={closeSignup}>
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg" onClick={event => event.stopPropagation()}>
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
                onClick={closeSignup}
                className="rounded-lg px-2 py-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                x
              </button>
            </div>

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

            {signupStep === 'details' ? (
              <form onSubmit={handleSignup} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Full Name</label>
                  <input
                    value={signupForm.fullName}
                    onChange={e => setSignupForm({ ...signupForm, fullName: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-500 text-sm bg-white"
                    placeholder="Enter your full name"
                  />
                </div>
                {signupRole === 'system_admin' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Business / SME Name</label>
                    <input
                      value={signupForm.businessName}
                      onChange={e => setSignupForm({ ...signupForm, businessName: e.target.value })}
                      className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-500 text-sm bg-white"
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
                    className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-500 text-sm bg-white"
                    placeholder={signupRole === 'system_admin' ? 'admin@example.com' : 'you@example.com'}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Password</label>
                  <input
                    type="password"
                    value={signupForm.password}
                    onChange={e => setSignupForm({ ...signupForm, password: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-500 text-sm bg-white"
                    placeholder="Create a password"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-3 bg-accent text-white rounded-lg font-semibold text-sm hover:bg-accent-600 active:bg-accent-700 transition"
                >
                  Send Verification Code
                </button>
              </form>
            ) : (
              <form onSubmit={handleVerifySignup} className="space-y-5">
                <div className="flex flex-col items-center gap-3 pt-1">
                  <div className="grid h-14 w-14 place-items-center rounded-full bg-accent-100 text-accent-600">
                    <MailCheck className="h-7 w-7" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-semibold text-gray-800">Verification Code</p>
                    <p className="mt-1 text-xs text-gray-500">A code was sent to {signupForm.email}</p>
                  </div>
                </div>
                <div className="flex items-center justify-center gap-2">
                  {codeDigits.map((digit, index) => (
                    <input
                      key={index}
                      ref={el => (codeInputRefs.current[index] = el)}
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={1}
                      value={digit}
                      onChange={e => handleCodeDigitChange(index, e.target.value)}
                      onKeyDown={e => handleCodeDigitKeyDown(index, e)}
                      onPaste={handleCodePaste}
                      className="h-14 w-11 rounded-lg border border-gray-200 bg-white text-center text-lg font-semibold text-gray-800 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent"
                    />
                  ))}
                </div>
                <button
                  type="submit"
                  className="w-full py-3 bg-accent text-white rounded-lg font-semibold text-sm hover:bg-accent-600 active:bg-accent-700 transition"
                >
                  Verify Email
                </button>
                <button
                  type="button"
                  onClick={handleResendCode}
                  className="w-full py-3 border border-accent-200 text-accent-600 rounded-lg font-semibold text-sm hover:bg-accent-100 transition"
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
