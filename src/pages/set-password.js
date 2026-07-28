import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { Eye, EyeOff, KeyRound } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'

export default function SetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [checkingSession, setCheckingSession] = useState(true)

  useEffect(() => {
    const loadSession = async () => {
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))
      const urlError = hashParams.get('error_description') || hashParams.get('error')
      const errorCode = hashParams.get('error_code')

      if (urlError) {
        setCheckingSession(false)
        setError(errorCode === 'otp_expired'
          ? 'This invitation link is invalid or expired. Ask your manager or account owner to send a new invite.'
          : urlError.replace(/\+/g, ' '))
        return
      }

      const { data } = await supabase.auth.getSession()
      setCheckingSession(false)
      if (!data.session) {
        setError('Open this page from the invitation email link.')
      }
    }

    loadSession()
  }, [])

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setMessage('')

    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setLoading(false)

    if (updateError) {
      setError(updateError.message)
      return
    }

    await supabase.auth.signOut()
    setMessage('Password saved. Redirecting to login...')
    setTimeout(() => router.push('/login'), 900)
  }

  return (
    <div className="min-h-screen bg-accent2-500 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-lg">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-lg bg-accent text-white">
            <KeyRound className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800">Set Your Password</h1>
          <p className="mt-1 text-sm text-gray-500">Create your password to access Smart Task Allocation.</p>
        </div>

        {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>}
        {message && <div className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">{message}</div>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={event => setPassword(event.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-white px-4 py-3 pr-12 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
                placeholder="Create password"
                disabled={checkingSession || loading}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Confirm Password</label>
            <input
              type={showPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={event => setConfirmPassword(event.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
              placeholder="Confirm password"
              disabled={checkingSession || loading}
            />
          </div>

          <button
            type="submit"
            disabled={checkingSession || loading || !!error}
            className="w-full rounded-lg bg-accent py-3 text-sm font-semibold text-white transition hover:bg-accent-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? 'Saving...' : 'Save Password'}
          </button>
          {error && (
            <button
              type="button"
              onClick={() => router.push('/login')}
              className="w-full rounded-lg border border-accent-200 py-3 text-sm font-semibold text-accent-600 transition hover:bg-accent-100"
            >
              Back to Login
            </button>
          )}
        </form>
      </div>
    </div>
  )
}
