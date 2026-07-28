import Layout from '../../../components/Layout'
import { useEffect, useMemo, useState } from 'react'
import { Bell, MapPin } from 'lucide-react'
import { supabase } from '../../../../lib/supabaseClient'

const availabilityMeta = {
  available: { label: 'Available', dot: 'bg-accent' },
  unavailable: { label: 'Busy', dot: 'bg-gray-400' },
  time_off: { label: 'On time-off', dot: 'bg-gray-300' },
}

const formatAvailability = (value) => availabilityMeta[value] || availabilityMeta.unavailable

export default function ManagerAvailability() {
  const [staffRows, setStaffRows] = useState([])
  const [notice, setNotice] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  const loadAvailability = async () => {
    const { data, error } = await supabase
      .from('staff_profiles')
      .select('id,staff_name,assigned_region,availability,current_workload,status,is_suspended')
      .order('staff_name')

    if (error) {
      setNotice(error.message)
    } else {
      setStaffRows(data || [])
    }
  }

  useEffect(() => {
    let cancelled = false

    loadAvailability()

    const availabilityChannel = supabase
      .channel(`manager-availability-page-${Date.now()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'staff_profiles' },
        (payload) => {
          if (cancelled) return
          const row = payload.new || payload.old
          if (payload.eventType === 'UPDATE' && payload.old?.availability !== payload.new?.availability) {
            const meta = formatAvailability(payload.new.availability)
            setNotice(`${payload.new.staff_name || 'A staff member'} is now ${meta.label}.`)
          }
          setStaffRows(prev => {
            if (payload.eventType === 'DELETE') return prev.filter(item => item.id !== payload.old.id)
            const exists = prev.some(item => item.id === row.id)
            if (exists) return prev.map(item => item.id === row.id ? row : item)
            return [...prev, row].sort((a, b) => String(a.staff_name).localeCompare(String(b.staff_name)))
          })
        }
      )
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(availabilityChannel)
    }
  }, [])

  const summary = useMemo(() => ({
    available: staffRows.filter(row => row.availability === 'available' && !row.is_suspended).length,
    unavailable: staffRows.filter(row => row.availability === 'unavailable' && !row.is_suspended).length,
    timeOff: staffRows.filter(row => row.availability === 'time_off' && !row.is_suspended).length,
  }), [staffRows])

  const initials = (name) => (name || '?').split(' ').map(part => part[0]).join('').slice(0, 2).toUpperCase()

  const filteredRows = statusFilter === 'all'
    ? staffRows
    : staffRows.filter(row => row.availability === statusFilter && !row.is_suspended)

  const toggleFilter = (value) => setStatusFilter(prev => prev === value ? 'all' : value)

  return (
    <Layout role="manager">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Manager / Availability</p>
        <h1 className="mt-1 text-4xl font-bold text-gray-900">Staff availability</h1>
        <p className="text-gray-500 text-sm mt-2">Live status — updates automatically as staff change availability.</p>

        {notice && (
          <div className="mt-5 flex items-center gap-2 rounded-lg border border-accent-200 bg-accent-100 px-4 py-3 text-sm text-accent-800">
            <Bell className="h-4 w-4" />
            {notice}
          </div>
        )}

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatTile dot="bg-accent" value={summary.available} label="Available now" active={statusFilter === 'available'} onClick={() => toggleFilter('available')} />
          <StatTile dot="bg-gray-400" value={summary.unavailable} label="Busy on task" active={statusFilter === 'unavailable'} onClick={() => toggleFilter('unavailable')} />
          <StatTile dot="bg-gray-300" value={summary.timeOff} label="On time-off" active={statusFilter === 'time_off'} onClick={() => toggleFilter('time_off')} />
        </div>

        <div className="mt-6 overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
          <div className="hidden grid-cols-[1.8fr_1fr_1fr_1fr] gap-4 border-b border-gray-100 bg-gray-50 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 md:grid">
            <span>Staff</span>
            <span>Status</span>
            <span>Region</span>
            <span>Active Tasks</span>
          </div>
          <div className="divide-y divide-gray-100">
            {filteredRows.map(row => {
              const suspended = row.is_suspended || row.status !== 'active'
              const meta = suspended ? { label: 'Suspended', dot: 'bg-gray-300' } : formatAvailability(row.availability)
              return (
                <div key={row.id} className="grid gap-4 px-5 py-4 md:grid-cols-[1.8fr_1fr_1fr_1fr] md:items-center">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-100 text-xs font-bold text-accent-700">
                      {initials(row.staff_name)}
                    </span>
                    <p className="truncate text-sm font-semibold text-gray-900">{row.staff_name}</p>
                  </div>
                  <div>
                    <span className="inline-flex items-center gap-2 text-sm text-gray-700">
                      <span className={`h-2.5 w-2.5 rounded-full ${meta.dot}`} />
                      {meta.label}
                    </span>
                  </div>
                  <p className="truncate text-sm text-gray-600 flex items-center gap-1"><MapPin className="h-3.5 w-3.5 text-gray-400" />{row.assigned_region || '—'}</p>
                  <p className="text-sm text-gray-700">{row.current_workload || 0}</p>
                </div>
              )
            })}
            {filteredRows.length === 0 && (
              <div className="px-5 py-12 text-center text-sm text-gray-400">
                No staff match this filter.
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  )
}

function StatTile({ dot, value, label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-xl border bg-white p-5 text-left transition hover:-translate-y-0.5 hover:shadow-md ${active ? 'border-accent-500 ring-2 ring-accent-100' : 'border-gray-100'}`}
    >
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
        <p className="text-3xl font-bold text-gray-900">{value}</p>
      </div>
      <p className="mt-1 text-sm text-gray-500">{label}</p>
    </button>
  )
}
