import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { LayoutDashboard } from 'lucide-react'
import { supabase } from '../../../lib/supabaseClient'

const routeByRole = {
  manager: '/manager',
  staff_member: '/staffMember',
  system_admin: '/admin',
  customer: '/customer',
  user_admin: '/user-admin',
  department_staff: '/department',
}

export default function AuthCallback() {
  const router = useRouter()
  const [error, setError] = useState('')

  useEffect(() => {
    if (!router.isReady) return

    (async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push('/login')
        return
      }

      let { data: profile } = await supabase
        .from('profiles')
        .select('role,status')
        .eq('id', session.user.id)
        .single()

      if (!profile) {
        const response = await fetch('/api/auth/ensure-profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ access_token: session.access_token, fallback_role: 'customer' }),
        })
        const result = await response.json()
        if (!response.ok) {
          setError(result.error || 'Could not set up your account.')
          return
        }
        profile = result.profile
      }

      if (!profile || profile.status !== 'active') {
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
    })()
  }, [router, router.isReady])

  return (
    <div className="min-h-screen bg-accent2-500 flex items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-8 text-center shadow-lg">
        <div className="w-14 h-14 bg-accent rounded-lg flex items-center justify-center mx-auto mb-4">
          <LayoutDashboard className="w-8 h-8 text-white" />
        </div>
        <p className="text-sm text-gray-500">{error || 'Signing you in...'}</p>
      </div>
    </div>
  )
}
