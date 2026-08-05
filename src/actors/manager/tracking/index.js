import Layout from '../../../components/Layout'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CheckCircle2, ChevronDown, Clock, Info, Map as MapIcon, MapPin, Satellite, SlidersHorizontal, Users, WifiOff,
} from 'lucide-react'
import { supabase } from '../../../../lib/supabaseClient'
import { formatDuration } from '../../../../lib/attendance'
import { useAuthUser } from '../../../context/AuthUserContext'

// Leaflet touches `window` on import, so it can only load in the browser —
// dynamic + ssr:false keeps it out of the Next.js server bundle.
const OnSiteMap = dynamic(() => import('../../../components/OnSiteMap'), { ssr: false })

const AVATAR_COLORS = [
  'bg-emerald-100 text-emerald-700',
  'bg-blue-100 text-blue-700',
  'bg-purple-100 text-purple-700',
  'bg-amber-100 text-amber-700',
  'bg-rose-100 text-rose-700',
]

const STAT_CARDS = [
  { key: 'onSite', label: 'On-site now', icon: Users, iconBg: 'bg-blue-50', iconColor: 'text-blue-600' },
  { key: 'checkedInToday', label: 'Checked in today', icon: CheckCircle2, iconBg: 'bg-green-50', iconColor: 'text-green-600' },
  { key: 'offline', label: 'Offline', icon: WifiOff, iconBg: 'bg-gray-100', iconColor: 'text-gray-400' },
]

function initials(name) {
  return String(name || '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join('') || '?'
}

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

export default function ManagerTracking() {
  const { user } = useAuthUser()
  const [staff, setStaff] = useState([])
  const [bookingRows, setBookingRows] = useState([])
  const [attendanceRows, setAttendanceRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [now, setNow] = useState(new Date())
  const [mapMode, setMapMode] = useState('map')
  const [regionFilter, setRegionFilter] = useState('all')
  const [showFilters, setShowFilters] = useState(false)
  const filtersRef = useRef(null)

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    loadTracking()
  }, [user])

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (filtersRef.current && !filtersRef.current.contains(event.target)) {
        setShowFilters(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const loadTracking = async () => {
    if (!user) return
    const { data: managerProfile } = await supabase
      .from('profiles')
      .select('host_admin_id')
      .eq('id', user?.id)
      .single()

    const hostAdminId = managerProfile?.host_admin_id
    if (!hostAdminId) {
      setStaff([])
      setBookingRows([])
      setAttendanceRows([])
      setLoading(false)
      return
    }

    const { data: staffRows } = await supabase
      .from('staff_profiles')
      .select('id,user_id,staff_name,assigned_region')
      .eq('host_admin_id', hostAdminId)
      .eq('manager_id', user?.id)
      .eq('status', 'active')

    const staffData = staffRows || []
    const staffIds = staffData.map(row => row.id)
    const staffUserIds = staffData.map(row => row.user_id).filter(Boolean)
    const workDate = todayIso()

    const [{ data: bookings }, { data: attendance }] = await Promise.all([
      staffIds.length
        ? supabase
          .from('bookings')
          .select('id,service_type,location,latitude,longitude,checked_in_at,checked_out_at,assigned_staff_id,status')
          .eq('host_admin_id', hostAdminId)
          .in('assigned_staff_id', staffIds)
          .not('checked_in_at', 'is', null)
          .gte('checked_in_at', `${workDate}T00:00:00.000Z`)
        : Promise.resolve({ data: [] }),
      staffUserIds.length
        ? supabase
          .from('attendance_records')
          .select('profile_id,clocked_in_at,clocked_out_at')
          .eq('host_admin_id', hostAdminId)
          .eq('work_date', workDate)
          .in('profile_id', staffUserIds)
        : Promise.resolve({ data: [] }),
    ])

    setStaff(staffData)
    setBookingRows(bookings || [])
    setAttendanceRows(attendance || [])
    setLoading(false)
  }

  const regions = useMemo(
    () => Array.from(new Set(staff.map(s => s.assigned_region).filter(Boolean))).sort(),
    [staff]
  )

  const filteredStaff = useMemo(
    () => (regionFilter === 'all' ? staff : staff.filter(s => s.assigned_region === regionFilter)),
    [staff, regionFilter]
  )
  const filteredStaffIds = useMemo(() => new Set(filteredStaff.map(s => s.id)), [filteredStaff])
  const filteredStaffUserIds = useMemo(
    () => new Set(filteredStaff.map(s => s.user_id).filter(Boolean)),
    [filteredStaff]
  )
  const staffNameById = useMemo(() => new Map(staff.map(s => [s.id, s.staff_name])), [staff])

  const onSite = useMemo(() => bookingRows
    .filter(row => row.status === 'in_progress' && filteredStaffIds.has(row.assigned_staff_id))
    .map(row => ({
      id: row.id,
      staffId: row.assigned_staff_id,
      name: staffNameById.get(row.assigned_staff_id),
      location: row.location,
      serviceType: row.service_type,
      checkedInAt: row.checked_in_at,
      latitude: row.latitude,
      longitude: row.longitude,
    })), [bookingRows, filteredStaffIds, staffNameById])

  const recentCheckIns = useMemo(() => [...bookingRows]
    .filter(row => filteredStaffIds.has(row.assigned_staff_id))
    .sort((a, b) => new Date(b.checked_in_at) - new Date(a.checked_in_at))
    .slice(0, 6)
    .map(row => ({
      id: row.id,
      name: staffNameById.get(row.assigned_staff_id),
      time: new Date(row.checked_in_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
      location: row.location,
    })), [bookingRows, filteredStaffIds, staffNameById])

  const checkedInTodaySet = useMemo(
    () => new Set(attendanceRows.filter(row => row.clocked_in_at && filteredStaffUserIds.has(row.profile_id)).map(row => row.profile_id)),
    [attendanceRows, filteredStaffUserIds]
  )
  const partialDaySet = useMemo(
    () => new Set(attendanceRows.filter(row => row.clocked_in_at && row.clocked_out_at && filteredStaffUserIds.has(row.profile_id)).map(row => row.profile_id)),
    [attendanceRows, filteredStaffUserIds]
  )

  const stats = {
    onSite: onSite.length,
    checkedInToday: checkedInTodaySet.size,
    partialDay: partialDaySet.size,
    offline: Math.max(filteredStaff.length - checkedInTodaySet.size, 0),
  }

  return (
    <Layout role="manager">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">Manager / Tracking</p>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><MapPin className="w-6 h-6 text-accent" /> GPS Tracking</h1>
            <p className="text-gray-500">Live location of staff currently checked in on-site.</p>
          </div>

          <div className="relative" ref={filtersRef}>
            <button
              type="button"
              onClick={() => setShowFilters(v => !v)}
              className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <SlidersHorizontal className="h-4 w-4" /> Filters
              {regionFilter !== 'all' && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}
              <ChevronDown className="h-4 w-4 text-gray-400" />
            </button>
            {showFilters && (
              <div className="absolute right-0 z-20 mt-2 w-56 rounded-lg border bg-white p-3 shadow-lg">
                <p className="mb-2 text-xs font-semibold uppercase text-gray-400">Region</p>
                <div className="max-h-56 space-y-1 overflow-y-auto">
                  <button
                    type="button"
                    onClick={() => { setRegionFilter('all'); setShowFilters(false) }}
                    className={`block w-full rounded-md px-2 py-1.5 text-left text-sm ${regionFilter === 'all' ? 'bg-accent-50 text-accent-700 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}
                  >
                    All regions
                  </button>
                  {regions.map(region => (
                    <button
                      key={region}
                      type="button"
                      onClick={() => { setRegionFilter(region); setShowFilters(false) }}
                      className={`block w-full truncate rounded-md px-2 py-1.5 text-left text-sm ${regionFilter === region ? 'bg-accent-50 text-accent-700 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}
                    >
                      {region}
                    </button>
                  ))}
                  {regions.length === 0 && <p className="px-2 py-1.5 text-sm text-gray-400">No regions set</p>}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="mb-6 mt-5 grid grid-cols-2 gap-4 lg:grid-cols-3">
          {STAT_CARDS.map(card => (
            <div key={card.key} className="flex items-center gap-3 rounded-xl border bg-white p-4">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${card.iconBg}`}>
                <card.icon className={`h-5 w-5 ${card.iconColor}`} />
              </div>
              <div>
                <p className="text-xs text-gray-500">{card.label}</p>
                <p className="text-xl font-bold text-gray-900">{stats[card.key]} <span className="text-xs font-normal text-gray-400">staff</span></p>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 items-start">
          <div className="lg:col-span-2 bg-white rounded-xl border overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b p-3">
              <div className="inline-flex rounded-lg border bg-gray-50 p-1">
                <button
                  type="button"
                  onClick={() => setMapMode('map')}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition ${mapMode === 'map' ? 'bg-white text-accent-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  <MapIcon className="h-4 w-4" /> Map view
                </button>
                <button
                  type="button"
                  onClick={() => setMapMode('satellite')}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition ${mapMode === 'satellite' ? 'bg-white text-accent-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  <Satellite className="h-4 w-4" /> Satellite view
                </button>
              </div>
            </div>

            <div className="relative" style={{ minHeight: '480px' }}>
              <OnSiteMap points={onSite} satellite={mapMode === 'satellite'} />
              {!loading && onSite.length === 0 && (
                <div className="pointer-events-none absolute inset-0 z-[400] flex items-center justify-center">
                  <span className="rounded-full bg-white/90 border px-3 py-1.5 text-xs text-gray-500 shadow-sm">No staff checked in on-site right now.</span>
                </div>
              )}
              <div className="absolute bottom-3 left-3 z-[400] flex items-center gap-3 rounded-full border bg-white/95 px-3 py-1.5 text-xs text-gray-600 shadow-sm">
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-green-500" /> On-site</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-gray-300" /> Offline</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col bg-white rounded-xl shadow-sm border overflow-hidden">
            <div className="flex items-center gap-2 p-5 border-b">
              <h2 className="font-semibold text-gray-900">On-site now</h2>
              <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
            </div>

            {onSite.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-5 py-8 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-50">
                  <MapPin className="h-6 w-6 text-gray-300" />
                </div>
                <p className="text-sm text-gray-400">No staff on-site right now.</p>
              </div>
            ) : (
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
              </div>
            )}

            <div className="border-t px-5 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Recently checked in</p>
            </div>
            <div className="divide-y divide-gray-50">
              {recentCheckIns.map((entry, index) => (
                <div key={entry.id} className="flex items-center gap-3 px-5 py-3">
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${AVATAR_COLORS[index % AVATAR_COLORS.length]}`}>
                    {initials(entry.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-900 truncate">{entry.name}</p>
                    <p className="text-xs text-gray-400 truncate">{entry.time} • {entry.location}</p>
                  </div>
                </div>
              ))}
              {!loading && recentCheckIns.length === 0 && (
                <p className="px-5 py-4 text-center text-sm text-gray-400">No check-ins yet today.</p>
              )}
            </div>

            <div className="mt-auto border-t p-4">
              <Link
                href="/manager-staff"
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                <Users className="h-4 w-4" /> View all staff
              </Link>
            </div>
          </div>
        </div>

        <div className="mt-6 flex items-center gap-2 rounded-lg border border-accent-100 bg-accent-50 px-4 py-3 text-xs text-accent-800">
          <Info className="h-4 w-4 shrink-0" />
          GPS updates every 2 minutes. Ensure staff has location permissions enabled.
        </div>
      </div>
    </Layout>
  )
}
