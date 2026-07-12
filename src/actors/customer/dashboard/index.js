import Layout from '../../../components/Layout'
import TimeInput from '../../../components/TimeInput'
import { useEffect, useState } from 'react'
import { Search, X, Bell, CheckCircle, MapPin, Calendar, Plus, Edit3 } from 'lucide-react'
import { useRouter } from 'next/router'
import { supabase } from '../../../../lib/supabaseClient'

export default function CustomerDashboard() {
  const router = useRouter()
  const [bookings, setBookings] = useState([])
  const [completedHistory, setCompletedHistory] = useState([])
  const [search, setSearch] = useState('')
  const [notification, setNotification] = useState(null)
  const [editBooking, setEditBooking] = useState(null)

  const titleCase = (value) => value.replace('_', ' ').replace(/^\w/, c => c.toUpperCase())

  const formatBooking = (booking) => ({
    id: booking.id,
    serviceType: booking.service_type,
    companyName: booking.company?.business_name || 'Unknown company',
    location: booking.location,
    description: booking.description || '',
    scheduledDate: booking.scheduled_date || '',
    scheduledTime: booking.scheduled_time || '',
    estimatedHours: booking.estimated_hours,
    notes: booking.notes || '',
    status: titleCase(booking.status),
    rawStatus: booking.status,
    createdAt: new Date(booking.created_at).toISOString().slice(0, 10),
    assignedStaff: booking.staff_profiles?.staff_name || 'Unassigned',
  })

  const loadBookings = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase
      .from('bookings')
      .select('id,service_type,description,location,scheduled_date,scheduled_time,estimated_hours,notes,status,created_at,staff_profiles(staff_name),company:profiles!bookings_host_admin_id_fkey(business_name)')
      .eq('customer_id', user.id)
      .order('created_at', { ascending: false })

    const rows = (data || []).map(formatBooking)
    setBookings(rows.filter(booking => !['Completed', 'Cancelled'].includes(booking.status)))
    setCompletedHistory(rows.filter(booking => booking.status === 'Completed'))
  }

  useEffect(() => {
    let channel = null

    loadBookings()

    async function subscribeToUpdates() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      channel = supabase
        .channel(`customer-booking-updates-${user.id}-${Date.now()}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'bookings', filter: `customer_id=eq.${user.id}` },
          (payload) => {
            const oldStatus = payload.old?.status
            const nextStatus = payload.new?.status
            if (oldStatus !== nextStatus && ['approved', 'rejected', 'completed', 'cancelled'].includes(nextStatus)) {
              setNotification(`Your ${payload.new.service_type || 'booking'} is now ${titleCase(nextStatus)}.`)
              setTimeout(() => setNotification(null), 4000)
            }
            loadBookings()
          }
        )
        .subscribe()
    }

    subscribeToUpdates()

    return () => {
      if (channel) supabase.removeChannel(channel)
    }
  }, [])

  const handleCancel = async (id) => {
    await supabase.from('bookings').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', id).eq('status', 'pending')
    await supabase.from('audit_logs').insert({ action: 'cancel_booking', details: `Booking ${id}` })
    await loadBookings()
    setNotification(`Booking ${id.slice(0, 8)} cancelled.`)
    setTimeout(() => setNotification(null), 3000)
  }

  const handleUpdate = async (event) => {
    event.preventDefault()
    if (!editBooking || editBooking.rawStatus !== 'pending') return
    const { error } = await supabase.from('bookings').update({
      service_type: editBooking.serviceType,
      description: editBooking.description,
      location: editBooking.location,
      scheduled_date: editBooking.scheduledDate || null,
      scheduled_time: editBooking.scheduledTime || null,
      estimated_hours: editBooking.estimatedHours,
      notes: editBooking.notes,
      updated_at: new Date().toISOString(),
    }).eq('id', editBooking.id).eq('status', 'pending')
    await supabase.from('audit_logs').insert({ action: 'update_booking', details: editBooking.serviceType })
    setEditBooking(null)
    await loadBookings()
    setNotification(error ? error.message : 'Booking updated.')
    setTimeout(() => setNotification(null), 3000)
  }

  const filtered = bookings.filter(b => [
    b.serviceType,
    b.id,
    b.location,
    b.status,
    b.assignedStaff,
  ].some(value => String(value || '').toLowerCase().includes(search.toLowerCase())))

  return (
    <Layout role="customer">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <div><h1 className="text-2xl font-bold">My Bookings</h1><p className="text-gray-500 text-sm">Book a cleaning service and track its status</p></div>
          <button onClick={() => router.push('/customer-book')} className="bg-gradient-to-r from-blue-500 to-green-500 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2"><Plus className="w-4 h-4" /> New Booking</button>
        </div>

        {notification && (
          <div className="mb-4 p-3 bg-blue-50 text-blue-700 rounded-lg flex items-center gap-2 border-l-4 border-blue-500">
            <Bell className="w-4 h-4" /> {notification}
          </div>
        )}

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by service or ID..." className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm" />
        </div>

        <div className="bg-white rounded-xl shadow-sm border overflow-hidden mb-8">
          <div className="p-4 font-semibold border-b bg-gray-50">Active Bookings</div>
          {filtered.length === 0 && <div className="p-8 text-center text-gray-400">No bookings found.</div>}
          {filtered.map(booking => (
            <div key={booking.id} className="p-4 border-b hover:bg-gray-50 flex justify-between items-center">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-mono text-gray-400">{booking.id.slice(0, 8)}</span>
                </div>
                <p className="font-medium text-gray-800">{booking.serviceType}</p>
                <p className="text-xs text-gray-500 mt-0.5">{booking.companyName}</p>
                <p className="text-xs text-gray-500 flex items-center gap-1 mt-1"><MapPin className="w-3 h-3" /> {booking.location} - Requested {booking.createdAt}</p>
                {booking.scheduledDate && (
                  <p className="text-xs text-gray-500 flex items-center gap-1 mt-1"><Calendar className="w-3 h-3" /> {booking.scheduledDate} {booking.scheduledTime}</p>
                )}
                <p className="text-xs text-gray-500 mt-1">
                  {booking.rawStatus === 'pending' && booking.assignedStaff !== 'Unassigned'
                    ? `Suggested staff (pending manager approval): ${booking.assignedStaff}`
                    : `Assigned staff: ${booking.assignedStaff}`}
                </p>
              </div>
              <div className="text-right">
                <span className={`text-xs px-2 py-1 rounded-full ${booking.status === 'Pending' ? 'bg-yellow-100 text-yellow-700' : booking.status === 'Rejected' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>{booking.status}</span>
                {booking.status === 'Pending' && (
                  <div className="mt-2 flex justify-end gap-3">
                    <button onClick={() => setEditBooking(booking)} className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"><Edit3 className="h-3 w-3" /> Edit</button>
                    <button onClick={() => handleCancel(booking.id)} className="text-xs text-red-500 hover:underline">Cancel</button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="p-4 font-semibold border-b bg-gray-50 flex items-center gap-2"><CheckCircle className="w-4 h-4 text-green-500" /> Booking History</div>
          {completedHistory.length === 0 && <div className="p-8 text-center text-gray-400">No completed bookings yet.</div>}
          {completedHistory.map(hist => (
            <div key={hist.id} className="p-4 border-b hover:bg-gray-50">
              <p className="text-sm font-medium text-gray-800">{hist.serviceType}</p>
              <p className="text-xs text-gray-500">{hist.companyName}</p>
              <p className="text-xs text-gray-500">{hist.location} - Completed {hist.createdAt} by {hist.assignedStaff}</p>
            </div>
          ))}
        </div>
      </div>

      {editBooking && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <form onSubmit={handleUpdate} className="bg-white rounded-xl max-w-lg w-full p-6">
            <div className="flex justify-between items-center mb-4"><h3 className="text-lg font-semibold">Update Booking</h3><button type="button" onClick={() => setEditBooking(null)}><X /></button></div>
            <div className="space-y-3">
              <input required placeholder="Service Type" value={editBooking.serviceType} onChange={e => setEditBooking({...editBooking, serviceType: e.target.value})} className="w-full border rounded-lg p-2 text-sm" />
              <textarea placeholder="Description" value={editBooking.description} onChange={e => setEditBooking({...editBooking, description: e.target.value})} className="w-full border rounded-lg p-2 text-sm resize-none" rows={3} />
              <textarea
                required
                placeholder="Location / Address"
                value={editBooking.location}
                onChange={e => setEditBooking({...editBooking, location: e.target.value})}
                rows={3}
                className="w-full border rounded-lg p-2 text-sm resize-none whitespace-pre-line"
              />
              <div className="grid grid-cols-2 gap-3">
                <input type="date" value={editBooking.scheduledDate} onChange={e => setEditBooking({...editBooking, scheduledDate: e.target.value})} className="w-full border rounded-lg p-2 text-sm" />
                <TimeInput value={editBooking.scheduledTime} onChange={value => setEditBooking({...editBooking, scheduledTime: value})} />
              </div>
              <input type="number" min="1" step="0.5" placeholder="Estimated hours" value={editBooking.estimatedHours} onChange={e => setEditBooking({...editBooking, estimatedHours: e.target.value})} className="w-full border rounded-lg p-2 text-sm" />
              <textarea placeholder="Additional notes" value={editBooking.notes} onChange={e => setEditBooking({...editBooking, notes: e.target.value})} className="w-full border rounded-lg p-2 text-sm resize-none" rows={2} />
              <button type="submit" className="w-full bg-gradient-to-r from-blue-500 to-green-500 text-white py-2 rounded-lg">Save Changes</button>
            </div>
          </form>
        </div>
      )}
    </Layout>
  )
}
