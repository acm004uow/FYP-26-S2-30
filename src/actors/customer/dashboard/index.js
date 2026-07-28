import Layout from '../../../components/Layout'
import TimeInput from '../../../components/TimeInput'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle, ArrowUpDown, Bell, Building, Building2, Calendar, CheckCircle2, ChevronDown, ChevronLeft,
  ChevronRight, ClipboardList, Edit3, Filter, Home, HelpCircle, ImagePlus, Lightbulb, Layers, MapPin, Plus, Search,
  Sparkles, Trash2, X,
} from 'lucide-react'
import { useRouter } from 'next/router'
import { supabase } from '../../../../lib/supabaseClient'

const PAGE_SIZE = 3

const SERVICE_VISUALS = {
  'home cleaning': { icon: Home, bg: 'bg-green-50', text: 'text-green-600', pill: 'bg-green-100 text-green-700' },
  'office cleaning': { icon: Building2, bg: 'bg-purple-50', text: 'text-purple-600', pill: 'bg-purple-100 text-purple-700' },
  'move-out cleaning': { icon: Building, bg: 'bg-blue-50', text: 'text-blue-600', pill: 'bg-blue-100 text-blue-700' },
  'deep cleaning': { icon: Sparkles, bg: 'bg-amber-50', text: 'text-amber-600', pill: 'bg-amber-100 text-amber-700' },
  'carpet cleaning': { icon: Layers, bg: 'bg-pink-50', text: 'text-pink-600', pill: 'bg-pink-100 text-pink-700' },
}
const DEFAULT_SERVICE_VISUAL = { icon: ClipboardList, bg: 'bg-gray-50', text: 'text-gray-500', pill: 'bg-gray-100 text-gray-700' }
const getServiceVisual = (serviceType) => SERVICE_VISUALS[String(serviceType || '').toLowerCase()] || DEFAULT_SERVICE_VISUAL

const STATUS_STYLES = {
  Pending: 'bg-yellow-100 text-yellow-700',
  Approved: 'bg-blue-100 text-blue-700',
  'In progress': 'bg-indigo-100 text-indigo-700',
  Completed: 'bg-green-100 text-green-700',
  Rejected: 'bg-red-100 text-red-700',
  Cancelled: 'bg-gray-100 text-gray-500',
}

const TABS = [
  { key: 'all', label: 'All Bookings' },
  { key: 'active', label: 'Active' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
]

export default function CustomerDashboard() {
  const router = useRouter()
  const [bookings, setBookings] = useState([])
  const [search, setSearch] = useState('')
  const [notification, setNotification] = useState(null)
  const [editBooking, setEditBooking] = useState(null)
  const [viewBooking, setViewBooking] = useState(null)
  const [cancelConfirmBooking, setCancelConfirmBooking] = useState(null)
  const [activeTab, setActiveTab] = useState('all')
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
    shortId: `#${booking.id.slice(0, 8).toUpperCase()}`,
    serviceType: booking.service_type,
    companyName: booking.company?.business_name || 'Unknown company',
    hostAdminId: booking.host_admin_id,
    location: booking.location,
    description: booking.description || '',
    scheduledDate: booking.scheduled_date || '',
    scheduledTime: booking.scheduled_time || '',
    estimatedHours: booking.estimated_hours,
    notes: booking.notes || '',
    status: titleCase(booking.status),
    rawStatus: booking.status,
    createdAt: new Date(booking.created_at).toISOString().slice(0, 10),
    createdAtMs: new Date(booking.created_at).getTime(),
    assignedStaffId: booking.assigned_staff_id || null,
    assignedStaff: booking.staff_profiles?.staff_name || 'Unassigned',
    feedback: booking.booking_feedback?.[0] || null,
  })

  const loadBookings = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase
      .from('bookings')
      .select('id,service_type,description,location,scheduled_date,scheduled_time,estimated_hours,notes,status,created_at,host_admin_id,assigned_staff_id,staff_profiles(staff_name),company:profiles!bookings_host_admin_id_fkey(business_name),booking_feedback(id,rating,comment,image_url)')
      .eq('customer_id', user.id)
      .order('created_at', { ascending: false })

    setBookings((data || []).map(formatBooking))
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
  }, [activeTab, search, filterServices, filterDateFrom, filterDateTo, sortOrder])

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
      const { data: { user } } = await supabase.auth.getUser()
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
    const { data: { user } } = await supabase.auth.getUser()

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

  const counts = useMemo(() => ({
    all: bookings.length,
    active: bookings.filter(b => !['Completed', 'Cancelled'].includes(b.status)).length,
    completed: bookings.filter(b => b.status === 'Completed').length,
    cancelled: bookings.filter(b => b.status === 'Cancelled').length,
  }), [bookings])

  const serviceOptions = useMemo(
    () => Array.from(new Set(bookings.map(b => b.serviceType).filter(Boolean))).sort(),
    [bookings]
  )

  const visibleBookings = useMemo(() => {
    let list = bookings
    if (activeTab === 'active') list = list.filter(b => !['Completed', 'Cancelled'].includes(b.status))
    else if (activeTab === 'completed') list = list.filter(b => b.status === 'Completed')
    else if (activeTab === 'cancelled') list = list.filter(b => b.status === 'Cancelled')

    if (search.trim()) {
      const query = search.toLowerCase()
      list = list.filter(b => [b.serviceType, b.id, b.shortId, b.location, b.status, b.assignedStaff]
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
  }, [bookings, activeTab, search, filterServices, filterDateFrom, filterDateTo, sortOrder])

  const totalPages = Math.max(1, Math.ceil(visibleBookings.length / PAGE_SIZE))
  const pageBookings = visibleBookings.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  const sectionLabel = TABS.find(t => t.key === activeTab)?.label || 'All Bookings'

  const activeFilterCount = filterServices.length + (filterDateFrom ? 1 : 0) + (filterDateTo ? 1 : 0)

  const toggleServiceFilter = (serviceType) => {
    setFilterServices(prev => prev.includes(serviceType) ? prev.filter(s => s !== serviceType) : [...prev, serviceType])
  }

  return (
    <Layout role="customer">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <div><h1 className="text-2xl font-bold">My Bookings</h1><p className="text-gray-500 text-sm">Book a cleaning service and track its status</p></div>
          <button onClick={() => router.push('/customer-book')} className="bg-accent hover:bg-accent-600 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition"><Plus className="w-4 h-4" /> New Booking</button>
        </div>

        {notification && (
          <div className="mb-4 p-3 bg-accent-100 text-accent-800 rounded-lg flex items-center gap-2 border-l-4 border-accent">
            <Bell className="w-4 h-4" /> {notification}
          </div>
        )}

        <div className="flex flex-wrap gap-2 mb-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by service, ID, or address..." className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm" />
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

        <div className="bg-white rounded-xl shadow-sm border p-1.5 mb-4 flex flex-wrap gap-1">
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition ${activeTab === tab.key ? 'bg-accent-100 text-accent-800' : 'text-gray-500 hover:bg-gray-50'}`}
            >
              {tab.label}
              <span className={`text-xs rounded-full px-1.5 ${activeTab === tab.key ? 'bg-accent-200 text-accent-800' : 'bg-gray-100 text-gray-500'}`}>{counts[tab.key]}</span>
            </button>
          ))}
        </div>

        <div className="bg-white rounded-xl shadow-sm border overflow-hidden mb-8">
          <div className="p-4 font-semibold border-b bg-gray-50 flex items-center gap-2">
            <span className="w-1 h-4 bg-accent rounded-full inline-block" /> {sectionLabel}
          </div>
          {pageBookings.length === 0 && <div className="p-8 text-center text-gray-400">No bookings found.</div>}
          {pageBookings.map(booking => {
            const visual = getServiceVisual(booking.serviceType)
            const Icon = visual.icon
            return (
              <div key={booking.id} className="p-4 border-b hover:bg-gray-50 flex justify-between items-start gap-4">
                <div className={`shrink-0 w-12 h-12 rounded-xl flex items-center justify-center ${visual.bg} ${visual.text}`}>
                  <Icon className="w-6 h-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-mono text-gray-400">{booking.shortId}</span>
                  </div>
                  <p className="font-medium text-gray-800">{booking.serviceType}</p>
                  <span className={`inline-block mt-1 text-xs px-2 py-0.5 rounded-full ${visual.pill}`}>{booking.companyName}</span>
                  <p className="text-xs text-gray-500 flex items-center gap-1 mt-1"><MapPin className="w-3 h-3" /> {booking.location}</p>
                  {booking.scheduledDate && (
                    <p className="text-xs text-gray-500 flex flex-wrap items-center gap-1 mt-1">
                      <Calendar className="w-3 h-3" /> {formatScheduled(booking.scheduledDate)} {booking.scheduledTime && `• ${booking.scheduledTime}`}
                      <button type="button" onClick={() => setViewBooking(booking)} className="ml-1 text-accent-600 hover:underline">View details</button>
                    </p>
                  )}
                  {!booking.scheduledDate && (
                    <button type="button" onClick={() => setViewBooking(booking)} className="mt-1 text-xs text-accent-600 hover:underline">View details</button>
                  )}

                  {booking.rawStatus === 'pending' && booking.assignedStaff !== 'Unassigned' && (
                    <div className="mt-2 flex items-start gap-1.5 bg-amber-50 text-amber-700 text-xs px-2 py-1.5 rounded-lg">
                      <Lightbulb className="w-3.5 h-3.5 shrink-0 mt-0.5" /> Suggested staff (pending manager approval): {booking.assignedStaff}
                    </div>
                  )}
                  {['approved', 'in_progress', 'completed'].includes(booking.rawStatus) && (
                    <div className="mt-2 flex items-start gap-1.5 bg-green-50 text-green-700 text-xs px-2 py-1.5 rounded-lg">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" /> Assigned staff: {booking.assignedStaff}
                    </div>
                  )}

                  {booking.status === 'Completed' && (
                    booking.feedback ? (
                      <div className="mt-2 space-y-2">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
                          <span className="text-yellow-500 tracking-tight">{'★'.repeat(booking.feedback.rating)}{'☆'.repeat(5 - booking.feedback.rating)}</span>
                          {booking.feedback.comment && <span className="italic text-gray-500">&ldquo;{booking.feedback.comment}&rdquo;</span>}
                        </div>
                        {booking.feedback.image_url && (
                          <a href={booking.feedback.image_url} target="_blank" rel="noreferrer">
                            <img src={booking.feedback.image_url} alt="Feedback attachment" className="h-16 w-16 rounded-lg object-cover border" />
                          </a>
                        )}
                      </div>
                    ) : (
                      <div className="mt-2 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="flex items-center gap-0.5">
                            {[1, 2, 3, 4, 5].map(value => (
                              <button
                                key={value}
                                type="button"
                                onClick={() => setFeedbackDrafts(prev => ({ ...prev, [booking.id]: { ...prev[booking.id], rating: value } }))}
                                className={`text-lg leading-none ${Number(feedbackDrafts[booking.id]?.rating || 0) >= value ? 'text-yellow-500' : 'text-gray-300'}`}
                                aria-label={`Rate ${value} star${value > 1 ? 's' : ''}`}
                              >★</button>
                            ))}
                          </div>
                          <input
                            value={feedbackDrafts[booking.id]?.comment || ''}
                            onChange={e => setFeedbackDrafts(prev => ({ ...prev, [booking.id]: { ...prev[booking.id], comment: e.target.value } }))}
                            placeholder="Leave a comment (optional)"
                            className="flex-1 min-w-[140px] border rounded-lg px-2 py-1 text-xs"
                          />
                          <button
                            type="button"
                            onClick={() => handleSubmitFeedback(booking)}
                            disabled={savingFeedbackId === booking.id}
                            className="text-xs text-accent-600 hover:underline disabled:opacity-50"
                          >
                            {savingFeedbackId === booking.id ? 'Saving...' : 'Submit feedback'}
                          </button>
                        </div>
                        <div className="flex items-center gap-2">
                          <label className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-accent-600 cursor-pointer">
                            <ImagePlus className="h-3.5 w-3.5" /> {feedbackDrafts[booking.id]?.imageFile ? 'Change photo' : 'Add photo'}
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={e => setFeedbackDrafts(prev => ({ ...prev, [booking.id]: { ...prev[booking.id], imageFile: e.target.files?.[0] || null } }))}
                            />
                          </label>
                          {feedbackDrafts[booking.id]?.imageFile && (
                            <>
                              <span className="text-xs text-gray-400 truncate max-w-[140px]">{feedbackDrafts[booking.id].imageFile.name}</span>
                              <button
                                type="button"
                                onClick={() => setFeedbackDrafts(prev => ({ ...prev, [booking.id]: { ...prev[booking.id], imageFile: null } }))}
                                className="text-xs text-red-500 hover:underline"
                              >
                                Remove
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    )
                  )}
                </div>
                <div className="text-right shrink-0">
                  <span className={`text-xs px-2 py-1 rounded-full ${STATUS_STYLES[booking.status] || 'bg-gray-100 text-gray-500'}`}>{booking.status}</span>
                  {['Pending', 'Approved'].includes(booking.status) && (
                    <div className="mt-2 flex justify-end gap-3">
                      {booking.status === 'Pending' && (
                        <button onClick={() => setEditBooking(booking)} className="inline-flex items-center gap-1 text-xs text-accent-600 hover:underline"><Edit3 className="h-3 w-3" /> Edit</button>
                      )}
                      <button onClick={() => handleCancelClick(booking)} className="inline-flex items-center gap-1 text-xs text-red-500 hover:underline"><Trash2 className="h-3 w-3" /> Cancel</button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}

          {visibleBookings.length > PAGE_SIZE && (
            <div className="flex items-center justify-center gap-1 p-4">
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

      {viewBooking && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Booking Details</h3>
              <button type="button" onClick={() => setViewBooking(null)} aria-label="Close"><X /></button>
            </div>
            <div className="space-y-2 text-sm">
              <p className="text-xs font-mono text-gray-400">{viewBooking.shortId}</p>
              <p><span className="text-gray-500">Service:</span> {viewBooking.serviceType}</p>
              <p><span className="text-gray-500">Company:</span> {viewBooking.companyName}</p>
              <p><span className="text-gray-500">Status:</span> {viewBooking.status}</p>
              <p><span className="text-gray-500">Location:</span> {viewBooking.location}</p>
              {viewBooking.scheduledDate && <p><span className="text-gray-500">Scheduled:</span> {formatScheduled(viewBooking.scheduledDate)} {viewBooking.scheduledTime}</p>}
              <p><span className="text-gray-500">Estimated hours:</span> {viewBooking.estimatedHours}</p>
              <p><span className="text-gray-500">Assigned staff:</span> {viewBooking.assignedStaff}</p>
              {viewBooking.description && <p><span className="text-gray-500">Description:</span> {viewBooking.description}</p>}
              {viewBooking.notes && <p><span className="text-gray-500">Notes:</span> {viewBooking.notes}</p>}
              <p><span className="text-gray-500">Requested:</span> {viewBooking.createdAt}</p>
            </div>
          </div>
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
