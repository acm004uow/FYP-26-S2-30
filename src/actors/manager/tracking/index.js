import Layout from '../../../components/Layout'
import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'
import { MapPin } from 'lucide-react'
import { supabase } from '../../../../lib/supabaseClient'
import { formatDuration } from '../../../../lib/attendance'

// Leaflet touches `window` on import, so it can only load in the browser —
// dynamic + ssr:false keeps it out of the Next.js server bundle.
const OnSiteMap = dynamic(() => import('../../../components/OnSiteMap'), { ssr: false })

function initials(name) {
  return String(name || '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join('') || '?'
}

export default function ManagerTracking() {
  const [onSite, setOnSite] = useState([])
  const [loading, setLoading] = useState(true)
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    loadOnSite()
  }, [])

  const loadOnSite = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: managerProfile } = await supabase
      .from('profiles')
      .select('host_admin_id')
      .eq('id', user?.id)
      .single()

    const hostAdminId = managerProfile?.host_admin_id
    if (!hostAdminId) {
      setOnSite([])
      setLoading(false)
      return
    }

    const { data: staff } = await supabase
      .from('staff_profiles')
      .select('id,staff_name')
      .eq('host_admin_id', hostAdminId)
      .eq('manager_id', user?.id)
      .eq('status', 'active')

    const staffNames = new Map((staff || []).map(row => [row.id, row.staff_name]))

    const { data: bookings } = await supabase
      .from('bookings')
      .select('id,service_type,location,latitude,longitude,checked_in_at,assigned_staff_id')
      .eq('host_admin_id', hostAdminId)
      .eq('status', 'in_progress')
      .not('assigned_staff_id', 'is', null)
      .not('checked_in_at', 'is', null)

    const rows = (bookings || [])
      .filter(booking => staffNames.has(booking.assigned_staff_id))
      .map(booking => ({
        id: booking.id,
        staffId: booking.assigned_staff_id,
        name: staffNames.get(booking.assigned_staff_id),
        location: booking.location,
        serviceType: booking.service_type,
        checkedInAt: booking.checked_in_at,
        latitude: booking.latitude,
        longitude: booking.longitude,
      }))

    setOnSite(rows)
    setLoading(false)
  }

  return (
    <Layout role="manager">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">Manager / Tracking</p>
        <h1 className="text-2xl font-bold flex items-center gap-2"><MapPin className="w-6 h-6 text-accent" /> GPS Tracking</h1>
        <p className="text-gray-500 mb-6">Live location of staff currently checked in on-site.</p>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          <div className="lg:col-span-2 relative bg-white rounded-xl border overflow-hidden" style={{ minHeight: '480px' }}>
            <OnSiteMap points={onSite} />
            {!loading && onSite.length === 0 && (
              <div className="pointer-events-none absolute inset-0 z-[400] flex items-center justify-center">
                <span className="rounded-full bg-white/90 border px-3 py-1.5 text-xs text-gray-500 shadow-sm">No staff checked in right now.</span>
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
            <div className="p-5 border-b">
              <h2 className="font-semibold text-gray-900">On-site now</h2>
            </div>
            <div className="divide-y divide-gray-50">
              {onSite.map(entry => (
                <div key={entry.id} className="flex items-center gap-3 px-5 py-4">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-100 text-accent-800 text-xs font-bold">
                    {initials(entry.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-900 truncate">{entry.name}</p>
                    <p className="text-xs text-gray-500 truncate">
                      {entry.location}{entry.serviceType ? ` — ${entry.serviceType}` : ''}
                    </p>
                  </div>
                  <p className="text-xs text-gray-400 flex-shrink-0">{formatDuration(now - new Date(entry.checkedInAt))}</p>
                </div>
              ))}
              {!loading && onSite.length === 0 && (
                <div className="p-8 text-center text-gray-400 text-sm">No staff on-site right now.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  )
}
