import Layout from '../../../components/Layout'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { ClipboardList, MapPin, Calendar, CheckCircle } from 'lucide-react'
import { supabase } from '../../../../lib/supabaseClient'

const SERVICE_TYPES = ['Home Cleaning', 'Office Cleaning', 'Deep Cleaning', 'Move-Out Cleaning', 'Carpet Cleaning']

export default function CustomerBooking() {
  const router = useRouter()
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [postalCode, setPostalCode] = useState('')
  const [postalLookupStatus, setPostalLookupStatus] = useState('')
  const [address, setAddress] = useState({ blockNo: '', streetName: '', building: '', unitNo: '' })
  const [form, setForm] = useState({
    serviceType: SERVICE_TYPES[0], description: '',
    scheduledDate: '', scheduledTime: '', estimatedHours: 2, notes: '',
  })

  useEffect(() => {
    if (postalCode.length !== 6) {
      setPostalLookupStatus('')
      return
    }

    let cancelled = false
    setPostalLookupStatus('loading')

    fetch(`https://www.onemap.gov.sg/api/common/elastic/search?searchVal=${postalCode}&returnGeom=N&getAddrDetails=Y&pageNum=1`)
      .then(res => res.json())
      .then(data => {
        if (cancelled) return
        const result = data?.results?.[0]
        if (result) {
          setAddress(prev => ({
            ...prev,
            blockNo: result.BLK_NO || '',
            streetName: result.ROAD_NAME || '',
            building: result.BUILDING && result.BUILDING !== 'NIL' ? result.BUILDING : '',
          }))
          setPostalLookupStatus('found')
        } else {
          setPostalLookupStatus('not_found')
        }
      })
      .catch(() => {
        if (!cancelled) setPostalLookupStatus('error')
      })

    return () => { cancelled = true }
  }, [postalCode])

  const composedLocation = [
    [address.blockNo, address.streetName].filter(Boolean).join(' '),
    address.building,
    address.unitNo ? `#${address.unitNo}` : null,
    postalCode.length === 6 ? `Singapore ${postalCode}` : null,
  ].filter(Boolean).join(', ')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (submitting) return
    if (postalCode.length !== 6 || !address.blockNo || !address.streetName) {
      setError('Please provide a postal code, block number, and street name.')
      return
    }
    setSubmitting(true)
    setError('')
    const { data: { user } } = await supabase.auth.getUser()
    const { data: createdBooking, error: insertError } = await supabase.from('bookings').insert({
      customer_id: user?.id,
      service_type: form.serviceType,
      description: form.description,
      location: composedLocation,
      scheduled_date: form.scheduledDate || null,
      scheduled_time: form.scheduledTime || null,
      estimated_hours: form.estimatedHours || 2,
      notes: form.notes,
      status: 'pending',
    }).select('id').single()

    if (insertError) {
      setError(insertError.message)
      setSubmitting(false)
      return
    }

    await supabase.from('audit_logs').insert({ user_id: user?.id, action: 'create_booking', details: form.serviceType })

    if (createdBooking?.id) {
      let { data: customerProfile } = await supabase
        .from('profiles')
        .select('full_name,email')
        .eq('id', user?.id)
        .single()

      const { data: managers } = await supabase
        .from('profiles')
        .select('id')
        .eq('role', 'manager')
        .eq('status', 'active')

      const customerName = customerProfile?.full_name || customerProfile?.email || 'A customer'
      const managerNotifications = (managers || []).map(manager => ({
        user_id: manager.id,
        title: 'New booking request',
        message: `${customerName} booked ${form.serviceType} at ${composedLocation}.`,
      }))

      if (managerNotifications.length) {
        await supabase.from('notifications').insert(managerNotifications)
      }
    }

    setSubmitted(true)
    setTimeout(() => {
      router.push('/customer')
    }, 2000)
  }

  if (submitted) {
    return (
      <Layout role="customer">
        <div className="min-h-[80vh] flex items-center justify-center">
          <div className="text-center">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-10 h-10 text-green-500" />
            </div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">Booking Submitted!</h2>
            <p className="text-gray-500">Redirecting to your bookings...</p>
          </div>
        </div>
      </Layout>
    )
  }

  return (
    <Layout role="customer">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Book a Cleaning Service</h1>
          <p className="text-gray-500 text-sm mt-1">Tell us what you need and a manager will review and assign staff.</p>
        </div>
        {error && <div className="mb-4 rounded-lg border bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <h3 className="font-semibold text-gray-800 mb-5 flex items-center gap-2"><ClipboardList className="w-5 h-5 text-blue-500" /> Service Details</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Service Type *</label>
                <select required value={form.serviceType} onChange={e => setForm({ ...form, serviceType: e.target.value })} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-gray-50">
                  {SERVICE_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={4} placeholder="Describe what needs to be cleaned..." className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-gray-50 resize-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Estimated Hours</label>
                <input type="number" min="1" step="0.5" value={form.estimatedHours} onChange={e => setForm({ ...form, estimatedHours: e.target.value })} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-gray-50" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <h3 className="font-semibold text-gray-800 mb-5 flex items-center gap-2"><MapPin className="w-5 h-5 text-green-500" /> Location & Schedule</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Singapore Postal Code *</label>
                <input
                  required
                  value={postalCode}
                  onChange={e => setPostalCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  inputMode="numeric"
                  pattern="\d{6}"
                  maxLength={6}
                  title="Enter a 6-digit Singapore postal code"
                  placeholder="e.g. 129588"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-gray-50"
                />
                {postalLookupStatus === 'loading' && <p className="mt-1 text-xs text-gray-400">Looking up address...</p>}
                {postalLookupStatus === 'not_found' && <p className="mt-1 text-xs text-red-500">No address found for this postal code. Enter it manually below.</p>}
                {postalLookupStatus === 'error' && <p className="mt-1 text-xs text-red-500">Address lookup failed. Enter it manually below.</p>}
                {postalLookupStatus === '' && <p className="mt-1 text-xs text-gray-400">6-digit postal code, e.g. 129588</p>}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Block No. *</label>
                  <input
                    required
                    value={address.blockNo}
                    onChange={e => setAddress({ ...address, blockNo: e.target.value })}
                    placeholder="e.g. 693"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-gray-50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Unit No.</label>
                  <input
                    value={address.unitNo}
                    onChange={e => setAddress({ ...address, unitNo: e.target.value })}
                    placeholder="e.g. 12-34"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-gray-50"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Street Name *</label>
                <input
                  required
                  value={address.streetName}
                  onChange={e => setAddress({ ...address, streetName: e.target.value })}
                  placeholder="e.g. Hougang Street 61"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-gray-50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Building Name</label>
                <input
                  value={address.building}
                  onChange={e => setAddress({ ...address, building: e.target.value })}
                  placeholder="e.g. Hougang Spring (optional)"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-gray-50"
                />
              </div>
              <p className="text-xs text-gray-400">Enter the postal code above to auto-fill block, street, and building. Add your unit number manually.</p>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1"><Calendar className="w-4 h-4" /> Preferred Date</label><input type="date" value={form.scheduledDate} onChange={e => setForm({ ...form, scheduledDate: e.target.value })} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-gray-50" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-2">Preferred Time</label><input type="time" value={form.scheduledTime} onChange={e => setForm({ ...form, scheduledTime: e.target.value })} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-gray-50" /></div>
              </div>
              <div><label className="block text-sm font-medium text-gray-700 mb-2">Additional Notes</label><textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} placeholder="Any special instructions..." className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-gray-50 resize-none" /></div>
            </div>
          </div>

          <div className="space-y-3">
            <button type="submit" disabled={submitting} className="w-full py-3 bg-gradient-to-r from-blue-500 to-green-500 text-white rounded-xl font-semibold text-sm hover:from-blue-600 hover:to-green-600 transition shadow-md disabled:opacity-60 disabled:cursor-not-allowed">{submitting ? 'Submitting...' : 'Submit Booking'}</button>
            <button type="button" onClick={() => router.push('/customer')} className="w-full py-3 bg-white border border-gray-200 text-gray-600 rounded-xl font-medium text-sm hover:bg-gray-50 transition">Cancel</button>
          </div>
        </form>
      </div>
    </Layout>
  )
}
