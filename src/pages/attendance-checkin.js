import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { CheckCircle2, Clock, LayoutDashboard, XCircle } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'

const STATUS_CONTENT = {
  loading: { icon: Clock, color: 'text-blue-500', title: 'Checking you in...', detail: 'Please wait a moment.' },
  clocked_in: { icon: CheckCircle2, color: 'text-green-500', title: 'Clocked in', detail: 'Have a great shift!' },
  clocked_out: { icon: CheckCircle2, color: 'text-green-500', title: 'Clocked out', detail: 'See you next time.' },
  already_completed: { icon: CheckCircle2, color: 'text-blue-500', title: 'Already completed', detail: "You've already clocked in and out today." },
  error: { icon: XCircle, color: 'text-red-500', title: 'Check-in failed', detail: '' },
}

export default function AttendanceCheckin() {
  const router = useRouter()
  const [status, setStatus] = useState('loading')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!router.isReady) return
    const token = typeof router.query.token === 'string' ? router.query.token : ''
    if (!token) {
      setStatus('error')
      setMessage('This QR code is missing a check-in token.')
      return
    }

    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        const next = `/attendance-checkin?token=${encodeURIComponent(token)}`
        router.push(`/login?next=${encodeURIComponent(next)}`)
        return
      }

      const { data: { session } } = await supabase.auth.getSession()
      const response = await fetch('/api/attendance/check-in', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ token }),
      })
      const result = await response.json()
      if (!response.ok) {
        setStatus('error')
        setMessage(result.error || 'Check-in failed.')
        return
      }

      setStatus(result.status)
    })()
  }, [router, router.isReady, router.query.token])

  const content = STATUS_CONTENT[status] || STATUS_CONTENT.error

  return (
    <div className="min-h-screen bg-accent2-500 flex items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-8 text-center shadow-lg">
        <div className="w-14 h-14 bg-accent rounded-lg flex items-center justify-center mx-auto mb-4">
          <LayoutDashboard className="w-8 h-8 text-white" />
        </div>
        <content.icon className={`w-10 h-10 mx-auto mb-3 ${content.color}`} />
        <h1 className="text-lg font-semibold text-gray-800">{content.title}</h1>
        <p className="mt-2 text-sm text-gray-500">{status === 'error' ? message : content.detail}</p>
      </div>
    </div>
  )
}
