import Layout from '../../../components/Layout'
import TimeInput from '../../../components/TimeInput'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle, ArrowUpDown, Bell, CheckCircle2, ChevronDown, ChevronLeft,
  ChevronRight, Circle, Edit3, Filter, HelpCircle, ImagePlus, Lightbulb, Search,
  Trash2, X, XCircle,
} from 'lucide-react'
import { useRouter } from 'next/router'
import { supabase } from '../../../../lib/supabaseClient'
import { loadCompanyRatings } from '../../../../lib/companyDirectory'
import { useAuthUser } from '../../../context/AuthUserContext'

const PAGE_SIZE = 8

const STATUS_STYLES = {
  Pending: 'bg-yellow-100 text-yellow-700',
  Assigned: 'bg-blue-100 text-blue-700',
  'In Progress': 'bg-indigo-100 text-indigo-700',
  Completed: 'bg-green-100 text-green-700',
  Rejected: 'bg-red-100 text-red-700',
  Cancelled: 'bg-gray-100 text-gray-500',
}

// approved -> "Assigned": customer-facing wording. Internally the status is still "approved" —
// a manager approving a booking is, from the customer's point of view, the cleaner being assigned.
const STATUS_LABELS = {
  pending: 'Pending', approved: 'Assigned', in_progress: 'In Progress',
  completed: 'Completed', rejected: 'Rejected', cancelled: 'Cancelled',
}

// Filter pills group "rejected" under "cancelled" (both mean "this booking didn't happen" from the
// customer's side) rather than adding a 7th pill — the table's own Status badge still shows the
// true "Rejected" label, this only affects which pill catches it.
const STATUS_PILLS = [
  { key: 'all', label: 'All', matches: null },
  { key: 'pending', label: 'pending', matches: ['pending'] },
  { key: 'assigned', label: 'assigned', matches: ['approved'] },
  { key: 'in_progress', label: 'in progress', matches: ['in_progress'] },
  { key: 'completed', label: 'completed', matches: ['completed'] },
  { key: 'cancelled', label: 'cancelled', matches: ['cancelled', 'rejected'] },
]

export default function CustomerDashboard() {
  const router = useRouter()
  const { user } = useAuthUser()
  const [bookings, setBookings] = useState([])
  const [search, setSearch] = useState('')
  const [notification, setNotification] = useState(null)
  const [editBooking, setEditBooking] = useState(null)
  const [cancelConfirmBooking, setCancelConfirmBooking] = useState(null)
  const [selectedBookingId, setSelectedBookingId] = useState(null)
  const [activePill, setActivePill] = useState('all')
  const [sortOrder, setSortOrder] = useState('newest')
  const [filterServices, setFilterServices] = useState([])
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [showFilterMenu, setShowFilterMenu] = useState(false)
  const [showSortMenu, setShowSortMenu] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [feedbackDrafts, setFeedbackDrafts] = useState({})
  const [savingFeedbackId, setSavingFeedbackId] = useState(null)
  const filterRef = useRef(null)
  const sortRef = useRef(null)

  const titleCase = (value) => value.replace('_', ' ').replace(/^\w/, c => c.toUpperCase())

  const formatBooking = (booking) => ({
    id: booking.id,
    reference: `BK-${booking.reference_no}`,
    serviceType: booking.service_type,
    companyName: booking.company?.business_name || 'Unknown company',
    companyPhone: booking.company?.phone || null,
    hostAdminId: booking.host_admin_id,
    location: booking.location,
    description: booking.description || '',
    scheduledDate: booking.scheduled_date || '',
    scheduledTime: booking.scheduled_time || '',
    estimatedHours: booking.estimated_hours,
    notes: booking.notes || '',
    status: STATUS_LABELS[booking.status] || titleCase(booking.status),
    rawStatus: booking.status,
    createdAt: booking.created_at,
    createdAtMs: new Date(booking.created_at).getTime(),
    updatedAt: booking.updated_at,
    checkedInAt: booking.checked_in_at,
    checkedOutAt: booking.checked_out_at,
    cancelledAt: booking.cancelled_at,
    rejectionReason: booking.rejection_reason || null,
    assignedStaffId: booking.assigned_staff_id || null,
    assignedStaff: booking.staff_profiles?.staff_name || 'Unassigned',
    staffPhone: booking.staff_profiles?.phone || null,
    requestedStaffName: booking.requested_staff_name || null,
    price: booking.price,
    feedback: booking.booking_feedback?.[0] || null,
  })

  const loadBookings = async () => {
    if (!user) return
    const { data } = await supabase
      .from('bookings')
      .select('id,reference_no,service_type,description,location,scheduled_date,scheduled_time,estimated_hours,notes,status,created_at,updated_at,checked_in_at,checked_out_at,cancelled_at,rejection_reason,host_admin_id,assigned_staff_id,requested_staff_name,price,staff_profiles(staff_name,phone),company:profiles!bookings_host_admin_id_fkey(business_name,phone),booking_feedback(id,rating,comment,image_url)')
      .eq('customer_id', user.id)
      .order('created_at', { ascending: false })

    const formatted = (data || []).map(formatBooking)
    setBookings(formatted)

    const hostIds = [...new Set(formatted.map(b => b.hostAdminId).filter(Boolean))]
    if (hostIds.length) {
      const ratings = await loadCompanyRatings(supabase, hostIds, null)
      setCompanyRatings(ratings)
    }
  }

  const [companyRatings, setCompanyRatings] = useState(new Map())

  useEffect(() => {
    let channel = null

    loadBookings()

    async function subscribeToUpdates() {
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
              setNotification(`Your ${payload.new.service_type || 'booking'} is now ${STATUS_LABELS[nextStatus] || titleCase(nextStatus)}.`)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  useEffect(() => {
    const onClickOutside = (event) => {
      if (filterRef.current && !filterRef.current.contains(event.target)) setShowFilterMenu(false)
      if (sortRef.current && !sortRef.current.contains(event.target)) setShowSortMenu(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  useEffect(() => {
    setCurrentPage(1)
  }, [activePill, search, filterServices, filterDateFrom, filterDateTo, sortOrder])

  const LATE_CANCEL_WINDOW_HOURS = 24
  const LATE_CANCEL_LOCK_THRESHOLD = 2

  const isLastMinuteCancellation = (booking) => {
    if (!booking.scheduledDate) return false
    const scheduledAt = new Date(`${booking.scheduledDate}T${booking.scheduledTime || '00:00'}:00`)
    if (Number.isNaN(scheduledAt.getTime())) return false
    const hoursUntil = (scheduledAt.getTime() - Date.now()) / (1000 * 60 * 60)
    return hoursUntil < LATE_CANCEL_WINDOW_HOURS
  }

  const handleCancelClick = (booking) => {
    setCancelConfirmBooking(booking)
  }

  const performCancel = async (booking) => {
    const { id, rawStatus } = booking
    if (!['pending', 'approved'].includes(rawStatus)) return
    const isLate = isLastMinuteCancellation(booking)

    const nowIso = new Date().toISOString()
    const { error } = await supabase
      .from('bookings')
      .update({ status: 'cancelled', cancelled_at: nowIso, cancelled_late: isLate, updated_at: nowIso })
      .eq('id', id)
      .in('status', ['pending', 'approved'])
    await supabase.from('audit_logs').insert({
      action: 'cancel_booking',
      details: `Booking ${id}${isLate && rawStatus === 'approved' ? ' (last-minute cancellation of an approved booking)' : ''}`,
    })

    let locked = false
    if (!error && isLate && rawStatus === 'approved') {
      if (user) {
        const { data: profile } = await supabase.from('profiles').select('late_cancellation_count').eq('id', user.id).single()
        const nextCount = (profile?.late_cancellation_count || 0) + 1
        locked = nextCount >= LATE_CANCEL_LOCK_THRESHOLD
        await supabase.from('profiles').update({
          late_cancellation_count: nextCount,
          ...(locked ? { status: 'locked' } : {}),
          updated_at: nowIso,
        }).eq('id', user.id)
        await supabase.from('audit_logs').insert({
          user_id: user.id,
          action: locked ? 'account_locked' : 'last_minute_cancellation_strike',
          details: `Booking ${id} cancelled within 24h of the scheduled visit (strike ${nextCount}/${LATE_CANCEL_LOCK_THRESHOLD})`,
        })
      }
    }

    if (locked) {
      await supabase.auth.signOut()
      router.push('/login?locked=1')
      return
    }

    await loadBookings()
    setNotification(error ? error.message : `Booking ${id.slice(0, 8)} cancelled.`)
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

  const handleSubmitFeedback = async (booking) => {
    const rating = Number(feedbackDrafts[booking.id]?.rating || 0)
    if (rating < 1 || rating > 5) {
      setNotification('Please choose a star rating before submitting.')
      setTimeout(() => setNotification(null), 3000)
      return
    }
    setSavingFeedbackId(booking.id)

    let imageUrl = null
    const imageFile = feedbackDrafts[booking.id]?.imageFile
    if (imageFile) {
      const safeName = imageFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `${user?.id}/feedback-${booking.id}-${Date.now()}-${safeName}`
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('task-proofs')
        .upload(path, imageFile, { upsert: false })
      if (uploadError) {
        setSavingFeedbackId(null)
        setNotification(uploadError.message)
        setTimeout(() => setNotification(null), 3000)
        return
      }
      const { data: publicUrlData } = supabase.storage.from('task-proofs').getPublicUrl(uploadData.path)
      imageUrl = publicUrlData?.publicUrl || null
    }

    const { error } = await supabase.from('booking_feedback').insert({
      booking_id: booking.id,
      customer_id: user?.id,
      host_admin_id: booking.hostAdminId,
      staff_id: booking.assignedStaffId,
      rating,
      comment: feedbackDrafts[booking.id]?.comment?.trim() || null,
      image_url: imageUrl,
    })
    setSavingFeedbackId(null)
    setNotification(error ? error.message : 'Thanks for your feedback!')
    setTimeout(() => setNotification(null), 3000)
    if (!error) await loadBookings()
  }

  const formatScheduled = (dateStr) => {
    if (!dateStr) return ''
    const parsed = new Date(`${dateStr}T00:00:00`)
    if (Number.isNaN(parsed.getTime())) return dateStr
    return `${dateStr} (${parsed.toLocaleDateString('en-US', { weekday: 'short' })})`
  }

  const formatDateTime = (iso) => {
    if (!iso) return ''
    const date = new Date(iso)
    if (Number.isNaN(date.getTime())) return ''
    return `${date.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })}, ${date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}`
  }

  const counts = useMemo(() => {
    const result = { all: bookings.length }
    for (const pill of STATUS_PILLS) {
      if (!pill.matches) continue
      result[pill.key] = bookings.filter(b => pill.matches.includes(b.rawStatus)).length
    }
    return result
  }, [bookings])

  const serviceOptions = useMemo(
    () => Array.from(new Set(bookings.map(b => b.serviceType).filter(Boolean))).sort(),
    [bookings]
  )

  const visibleBookings = useMemo(() => {
    let list = bookings
    const pill = STATUS_PILLS.find(p => p.key === activePill)
    if (pill?.matches) list = list.filter(b => pill.matches.includes(b.rawStatus))

    if (search.trim()) {
      const query = search.toLowerCase()
      list = list.filter(b => [b.serviceType, b.reference, b.location, b.status, b.assignedStaff]
        .some(value => String(value || '').toLowerCase().includes(query)))
    }

    if (filterServices.length > 0) {
      list = list.filter(b => filterServices.includes(b.serviceType))
    }

    if (filterDateFrom) {
      list = list.filter(b => b.scheduledDate && b.scheduledDate >= filterDateFrom)
    }
    if (filterDateTo) {
      list = list.filter(b => b.scheduledDate && b.scheduledDate <= filterDateTo)
    }

    return [...list].sort((a, b) => sortOrder === 'newest' ? b.createdAtMs - a.createdAtMs : a.createdAtMs - b.createdAtMs)
  }, [bookings, activePill, search, filterServices, filterDateFrom, filterDateTo, sortOrder])

  const totalPages = Math.max(1, Math.ceil(visibleBookings.length / PAGE_SIZE))
  const pageBookings = visibleBookings.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  const selectedBooking = bookings.find(b => b.id === selectedBookingId) || pageBookings[0] || null

  const activeFilterCount = filterServices.length + (filterDateFrom ? 1 : 0) + (filterDateTo ? 1 : 0)

  const toggleServiceFilter = (serviceType) => {
    setFilterServices(prev => prev.includes(serviceType) ? prev.filter(s => s !== serviceType) : [...prev, serviceType])
  }

  return (
    <Layout role="customer">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">My Bookings</h1>
          <p className="text-gray-500 text-sm">Book a cleaning service and track its status</p>
        </div>

        {notification && (
          <div className="mb-4 p-3 bg-accent-100 text-accent-800 rounded-lg flex items-center gap-2 border-l-4 border-accent">
            <Bell className="w-4 h-4" /> {notification}
          </div>
        )}

        <div className="flex flex-wrap gap-2 mb-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by service, reference, or address..." className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm" />
          </div>

          <div className="relative" ref={filterRef}>
            <button
              onClick={() => { setShowFilterMenu(v => !v); setShowSortMenu(false) }}
              className="h-full flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-600 bg-white hover:bg-gray-50"
            >
              <Filter className="w-4 h-4" /> Filter{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
            </button>
            {showFilterMenu && (
              <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-lg border border-gray-100 z-20 p-3">
                <p className="text-xs font-semibold text-gray-500 mb-2">Service type</p>
                {serviceOptions.length === 0 && <p className="text-xs text-gray-400">No bookings yet.</p>}
                {serviceOptions.map(option => (
                  <label key={option} className="flex items-center gap-2 py-1 text-sm text-gray-700 cursor-pointer">
                    <input type="checkbox" checked={filterServices.includes(option)} onChange={() => toggleServiceFilter(option)} className="rounded border-gray-300" />
                    {option}
                  </label>
                ))}
                <p className="text-xs font-semibold text-gray-500 mb-2 mt-3">Scheduled date</p>
                <div className="space-y-2">
                  <div>
                    <label className="block text-[11px] text-gray-400 mb-1">From</label>
                    <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs" />
                  </div>
                  <div>
                    <label className="block text-[11px] text-gray-400 mb-1">To</label>
                    <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs" />
                  </div>
                </div>
                {activeFilterCount > 0 && (
                  <button onClick={() => { setFilterServices([]); setFilterDateFrom(''); setFilterDateTo('') }} className="mt-3 text-xs text-accent-600 hover:underline">Clear filters</button>
                )}
              </div>
            )}
          </div>

          <div className="relative" ref={sortRef}>
            <button
              onClick={() => { setShowSortMenu(v => !v); setShowFilterMenu(false) }}
              className="h-full flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-600 bg-white hover:bg-gray-50"
            >
              <ArrowUpDown className="w-4 h-4" /> Sort: {sortOrder === 'newest' ? 'Newest' : 'Oldest'} <ChevronDown className="w-3.5 h-3.5" />
            </button>
            {showSortMenu && (
              <div className="absolute right-0 mt-2 w-40 bg-white rounded-xl shadow-lg border border-gray-100 z-20 overflow-hidden">
                {['newest', 'oldest'].map(option => (
                  <button
                    key={option}
                    onClick={() => { setSortOrder(option); setShowSortMenu(false) }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${sortOrder === option ? 'text-accent-600 font-medium' : 'text-gray-600'}`}
                  >
                    {option === 'newest' ? 'Newest' : 'Oldest'}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-1 mb-4">
          {STATUS_PILLS.map(pill => (
            <button
              key={pill.key}
              onClick={() => setActivePill(pill.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold transition ${activePill === pill.key ? 'bg-[#003152] text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
            >
              {pill.label}
              <span className={`text-xs rounded-full px-1.5 ${activePill === pill.key ? 'bg-white/20' : 'bg-gray-100 text-gray-500'}`}>{counts[pill.key] ?? 0}</span>
            </button>
          ))}
        </div>

        <div className="bg-white rounded-xl shadow-sm border overflow-hidden mb-6">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b text-left text-xs font-semibold uppercase text-gray-500">
                  <th className="px-4 py-3">Reference</th>
                  <th className="px-4 py-3">Service</th>
                  <th className="px-4 py-3">Company</th>
                  <th className="px-4 py-3">Scheduled</th>
                  <th className="px-4 py-3">Cleaner</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {pageBookings.length === 0 && (
                  <tr><td colSpan={6} className="p-8 text-center text-gray-400">No bookings found.</td></tr>
                )}
                {pageBookings.map(booking => {
                  const rating = companyRatings.get(booking.hostAdminId)
                  const isConfirmedAssignment = ['approved', 'in_progress', 'completed'].includes(booking.rawStatus)
                  return (
                    <tr
                      key={booking.id}
                      onClick={() => setSelectedBookingId(booking.id)}
                      className={`border-b last:border-b-0 cursor-pointer hover:bg-gray-50 ${selectedBooking?.id === booking.id ? 'bg-accent-100/40' : ''}`}
                    >
                      <td className="px-4 py-3 font-mono text-xs text-gray-500">{booking.reference}</td>
                      <td className="px-4 py-3 font-medium text-gray-800">{booking.serviceType}</td>
                      <td className="px-4 py-3 text-gray-600">
                        {booking.companyName}
                        {rating && <span className="ml-1.5 text-xs text-gray-400">· {rating.average.toFixed(1)}/5</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                        {booking.scheduledDate ? `${booking.scheduledDate.slice(5).replace('-', ' ').split(' ').reverse().join(' ')}${booking.scheduledTime ? `, ${booking.scheduledTime}` : ''}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{isConfirmedAssignment ? booking.assignedStaff : 'Awaiting assignment'}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-1 rounded-full ${STATUS_STYLES[booking.status] || 'bg-gray-100 text-gray-500'}`}>{booking.status}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {visibleBookings.length > PAGE_SIZE && (
            <div className="flex items-center justify-center gap-1 p-4 border-t">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-1.5 rounded-lg border border-gray-200 text-gray-500 disabled:opacity-40 hover:bg-gray-50"
                aria-label="Previous page"
              ><ChevronLeft className="w-4 h-4" /></button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(pageNum => (
                <button
                  key={pageNum}
                  onClick={() => setCurrentPage(pageNum)}
                  className={`w-8 h-8 rounded-lg text-sm font-medium ${currentPage === pageNum ? 'bg-accent text-white' : 'text-gray-600 hover:bg-gray-50 border border-gray-200'}`}
                >
                  {pageNum}
                </button>
              ))}
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-1.5 rounded-lg border border-gray-200 text-gray-500 disabled:opacity-40 hover:bg-gray-50"
                aria-label="Next page"
              ><ChevronRight className="w-4 h-4" /></button>
            </div>
          )}
        </div>

        {selectedBooking && (
          <BookingDetailPanel
            booking={selectedBooking}
            rating={companyRatings.get(selectedBooking.hostAdminId)}
            formatScheduled={formatScheduled}
            formatDateTime={formatDateTime}
            onEdit={() => setEditBooking(selectedBooking)}
            onCancel={() => handleCancelClick(selectedBooking)}
            feedbackDraft={feedbackDrafts[selectedBooking.id]}
            onFeedbackChange={(patch) => setFeedbackDrafts(prev => ({ ...prev, [selectedBooking.id]: { ...prev[selectedBooking.id], ...patch } }))}
            onSubmitFeedback={() => handleSubmitFeedback(selectedBooking)}
            savingFeedback={savingFeedbackId === selectedBooking.id}
          />
        )}
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
              <button type="submit" className="w-full bg-accent hover:bg-accent-600 text-white py-2 rounded-lg font-semibold transition">Save Changes</button>
            </div>
          </form>
        </div>
      )}

      {cancelConfirmBooking && (() => {
        const isLateApproved = isLastMinuteCancellation(cancelConfirmBooking) && cancelConfirmBooking.rawStatus === 'approved'
        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl max-w-md w-full p-6">
              <div className="flex justify-between gap-4">
                <h3 className="flex items-center gap-2 text-lg font-semibold">
                  {isLateApproved
                    ? <AlertTriangle className="h-5 w-5 text-amber-500" />
                    : <HelpCircle className="h-5 w-5 text-accent" />}
                  Cancel This Booking?
                </h3>
                <button type="button" onClick={() => setCancelConfirmBooking(null)} aria-label="Close"><X /></button>
              </div>
              <p className="mt-4 text-sm text-gray-600">
                {isLateApproved
                  ? 'This booking is scheduled within 24 hours. Cancelling now counts as a last-minute cancellation, and repeated last-minute cancellations can lock your account.'
                  : 'Are you sure you want to cancel this booking? This cannot be undone.'}
              </p>
              <div className="mt-6 flex gap-2">
                <button
                  type="button"
                  onClick={() => { performCancel(cancelConfirmBooking); setCancelConfirmBooking(null) }}
                  className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-medium text-white hover:bg-red-700"
                >
                  Yes, Cancel Booking
                </button>
                <button type="button" onClick={() => setCancelConfirmBooking(null)} className="flex-1 rounded-lg bg-gray-200 py-2 text-sm font-medium text-gray-700">Keep Booking</button>
              </div>
            </div>
          </div>
        )
      })()}
    </Layout>
  )
}

function DetailRow({ label, value }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1">
      <dt className="text-gray-500 shrink-0">{label}</dt>
      <dd className="text-gray-800 font-medium text-right">{value}</dd>
    </div>
  )
}

// Cancelled/rejected bookings get a short notice instead of the step timeline — showing a stalled
// "pending" progress bar for a booking that's never going to move forward would be misleading.
function TimelineStep({ label, done, timestamp }) {
  return (
    <div className="flex items-start gap-3">
      {done ? <CheckCircle2 className="w-4 h-4 text-accent shrink-0 mt-0.5" /> : <Circle className="w-4 h-4 text-gray-300 shrink-0 mt-0.5" />}
      <div>
        <p className={`text-sm font-semibold ${done ? 'text-gray-900' : 'text-gray-400'}`}>{label}</p>
        <p className={`text-xs ${done ? 'text-gray-500' : 'text-gray-400'}`}>{done ? timestamp : 'pending'}</p>
      </div>
    </div>
  )
}

function BookingDetailPanel({
  booking, rating, formatScheduled, formatDateTime, onEdit, onCancel,
  feedbackDraft, onFeedbackChange, onSubmitFeedback, savingFeedback,
}) {
  const isConfirmedAssignment = ['approved', 'in_progress', 'completed'].includes(booking.rawStatus)
  const isSuggestedOnly = booking.rawStatus === 'pending' && booking.assignedStaff !== 'Unassigned'
  const isDead = ['cancelled', 'rejected'].includes(booking.rawStatus)
  const canEdit = booking.rawStatus === 'pending'
  const canCancel = ['pending', 'approved'].includes(booking.rawStatus)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <div className="flex items-start justify-between gap-3 mb-4">
          <h3 className="font-semibold text-gray-800">Booking detail - {booking.reference}</h3>
          {(canEdit || canCancel) && (
            <div className="flex items-center gap-3 shrink-0">
              {canEdit && <button onClick={onEdit} className="inline-flex items-center gap-1 text-xs text-accent-600 hover:underline"><Edit3 className="h-3 w-3" /> Edit</button>}
              {canCancel && <button onClick={onCancel} className="inline-flex items-center gap-1 text-xs text-red-500 hover:underline"><Trash2 className="h-3 w-3" /> Cancel</button>}
            </div>
          )}
        </div>

        <dl className="text-sm divide-y divide-gray-50">
          <DetailRow label="Service" value={booking.serviceType} />
          <DetailRow label="Company" value={`${booking.companyName}${booking.companyPhone ? ` (${booking.companyPhone})` : ''}${rating ? ` · ${rating.average.toFixed(1)}/5` : ''}`} />
          <DetailRow label="Address" value={booking.location} />
          {booking.scheduledDate && <DetailRow label="Scheduled" value={`${formatScheduled(booking.scheduledDate)}${booking.scheduledTime ? `, ${booking.scheduledTime}` : ''}`} />}
          <DetailRow label="Duration" value={`${booking.estimatedHours} hours`} />
          <DetailRow label="Assigned cleaner" value={isConfirmedAssignment ? `${booking.assignedStaff}${booking.staffPhone ? ` (${booking.staffPhone})` : ''}` : 'Awaiting assignment'} />
          <DetailRow label="Amount" value={booking.price != null ? `$${Number(booking.price).toFixed(2)} - payable on completion` : 'Priced after site assessment'} />
        </dl>

        {isSuggestedOnly && (
          <div className="mt-3 flex items-start gap-1.5 bg-amber-50 text-amber-700 text-xs px-2 py-1.5 rounded-lg">
            <Lightbulb className="w-3.5 h-3.5 shrink-0 mt-0.5" /> Suggested staff (pending manager approval): {booking.assignedStaff}
          </div>
        )}
        {isConfirmedAssignment && (
          <div className="mt-3 flex items-start gap-1.5 bg-green-50 text-green-700 text-xs px-2 py-1.5 rounded-lg">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" /> Assigned staff: {booking.assignedStaff}
          </div>
        )}
        {booking.requestedStaffName && (
          <p className="mt-2 text-xs text-gray-400">You requested: {booking.requestedStaffName}</p>
        )}
        {booking.description && <p className="mt-3 text-sm text-gray-600"><span className="text-gray-400">Description:</span> {booking.description}</p>}
        {booking.notes && <p className="mt-1 text-sm text-gray-600"><span className="text-gray-400">Notes:</span> {booking.notes}</p>}

        {booking.status === 'Completed' && (
          booking.feedback ? (
            <div className="mt-4 pt-4 border-t space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
                <span className="text-yellow-500 tracking-tight">{'★'.repeat(booking.feedback.rating)}{'☆'.repeat(5 - booking.feedback.rating)}</span>
                {booking.feedback.comment && <span className="italic text-gray-500">&ldquo;{booking.feedback.comment}&rdquo;</span>}
              </div>
              {booking.feedback.image_url && (
                <a href={booking.feedback.image_url} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={booking.feedback.image_url} alt="Feedback attachment" className="h-16 w-16 rounded-lg object-cover border" />
                </a>
              )}
            </div>
          ) : (
            <div className="mt-4 pt-4 border-t space-y-2">
              <p className="text-xs font-semibold text-gray-500">Leave feedback</p>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-0.5">
                  {[1, 2, 3, 4, 5].map(value => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => onFeedbackChange({ rating: value })}
                      className={`text-lg leading-none ${Number(feedbackDraft?.rating || 0) >= value ? 'text-yellow-500' : 'text-gray-300'}`}
                      aria-label={`Rate ${value} star${value > 1 ? 's' : ''}`}
                    >★</button>
                  ))}
                </div>
                <input
                  value={feedbackDraft?.comment || ''}
                  onChange={e => onFeedbackChange({ comment: e.target.value })}
                  placeholder="Leave a comment (optional)"
                  className="flex-1 min-w-[140px] border rounded-lg px-2 py-1 text-xs"
                />
                <button
                  type="button"
                  onClick={onSubmitFeedback}
                  disabled={savingFeedback}
                  className="text-xs text-accent-600 hover:underline disabled:opacity-50"
                >
                  {savingFeedback ? 'Saving...' : 'Submit feedback'}
                </button>
              </div>
              <label className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-accent-600 cursor-pointer">
                <ImagePlus className="h-3.5 w-3.5" /> {feedbackDraft?.imageFile ? 'Change photo' : 'Add photo'}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => onFeedbackChange({ imageFile: e.target.files?.[0] || null })}
                />
              </label>
              {feedbackDraft?.imageFile && (
                <span className="ml-2 text-xs text-gray-400 truncate max-w-[140px]">{feedbackDraft.imageFile.name}</span>
              )}
            </div>
          )
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border p-6">
        <h3 className="font-semibold text-gray-800 mb-4">Status timeline</h3>
        {isDead ? (
          <div className="flex items-start gap-2 text-sm text-gray-600">
            <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            {booking.rawStatus === 'cancelled'
              ? `This booking was cancelled${booking.cancelledAt ? ` on ${formatDateTime(booking.cancelledAt)}` : ''}.`
              : `This booking was declined.${booking.rejectionReason ? ` Reason: ${booking.rejectionReason}` : ''}`}
          </div>
        ) : (
          <div className="space-y-4">
            <TimelineStep label="Booking submitted" done timestamp={formatDateTime(booking.createdAt)} />
            <TimelineStep label="Cleaner assigned" done={isConfirmedAssignment} timestamp={formatDateTime(booking.updatedAt)} />
            <TimelineStep label="In progress" done={['in_progress', 'completed'].includes(booking.rawStatus)} timestamp={formatDateTime(booking.checkedInAt || booking.updatedAt)} />
            <TimelineStep label="Completed" done={booking.rawStatus === 'completed'} timestamp={formatDateTime(booking.checkedOutAt || booking.updatedAt)} />
          </div>
        )}
      </div>
    </div>
  )
}
