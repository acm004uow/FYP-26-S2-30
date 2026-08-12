import { useEffect, useRef, useState } from 'react'
import { Calendar, ChevronDown, Info, Repeat } from 'lucide-react'
import AddressFields from '../../../components/AddressFields'

const TIME_SLOTS = ['09:00', '11:00', '13:00', '15:00', '17:00']
const DURATION_OPTIONS = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8]
const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Standard' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
]
const DAY_LABELS = [
  { value: 1, label: 'Mon' }, { value: 2, label: 'Tue' }, { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' }, { value: 5, label: 'Fri' }, { value: 6, label: 'Sat' }, { value: 0, label: 'Sun' },
]

function addHoursToTime(time, hours) {
  const [h, m] = time.split(':').map(Number)
  if (!Number.isFinite(h)) return null
  const totalMinutes = (h * 60 + m + Math.round(Number(hours) * 60)) % (24 * 60)
  const wrapped = totalMinutes < 0 ? totalMinutes + 24 * 60 : totalMinutes
  return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`
}

// Step 3 of the booking wizard: address (prefilled from Step 2's postal code), when, and a summary
// with a live cost estimate, ending in the confirm action. `form` is owned by the wizard orchestrator
// (index.js) and patched here via `patchForm` so submit logic stays in one place.
export default function Step3Schedule({
  selectedCompany, serviceType, requestedStaff, form, patchForm,
  bookingMode, setBookingMode, onLocationChange, onCoordinatesChange,
  minDate, onBack, onSubmit, submitting, error,
}) {
  const [daysDropdownOpen, setDaysDropdownOpen] = useState(false)
  const daysDropdownRef = useRef(null)

  useEffect(() => {
    if (!daysDropdownOpen) return
    const handleClickOutside = (event) => {
      if (daysDropdownRef.current && !daysDropdownRef.current.contains(event.target)) setDaysDropdownOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [daysDropdownOpen])

  const toggleDayOfWeek = (day) => {
    patchForm({ daysOfWeek: form.daysOfWeek.includes(day) ? form.daysOfWeek.filter(d => d !== day) : [...form.daysOfWeek, day] })
  }

  const finishTime = form.scheduledTime ? addHoursToTime(form.scheduledTime, form.estimatedHours) : null
  // The company's service_rates entry is an hourly rate (shown as "$X/hr" in Step 2), so the
  // estimated total scales with the chosen duration.
  const hourlyRate = selectedCompany?.price ?? null
  const price = hourlyRate != null ? hourlyRate * Number(form.estimatedHours || 0) : null

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-6 items-start">
      <div className="space-y-6">
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h3 className="font-semibold text-gray-800 mb-5">Where is the job?</h3>
          <AddressFields
            initialPostalCode={form.postalCode}
            onLocationChange={onLocationChange}
            onCoordinatesChange={onCoordinatesChange}
          />
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-semibold text-gray-800">When?</h3>
            <div className="inline-flex rounded-lg bg-gray-100 p-1">
              <button type="button" onClick={() => setBookingMode('one-time')} className={`px-3 py-1.5 text-sm font-medium rounded-md transition ${bookingMode === 'one-time' ? 'bg-white text-accent-600 shadow-sm' : 'text-gray-500'}`}>One-time</button>
              <button type="button" onClick={() => setBookingMode('recurring')} className={`px-3 py-1.5 text-sm font-medium rounded-md transition flex items-center gap-1 ${bookingMode === 'recurring' ? 'bg-white text-accent-600 shadow-sm' : 'text-gray-500'}`}><Repeat className="w-3.5 h-3.5" /> Recurring</button>
            </div>
          </div>

          {bookingMode === 'one-time' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Date *</label>
                <div className="relative">
                  <input required type="date" min={minDate} value={form.scheduledDate} onChange={e => patchForm({ scheduledDate: e.target.value })} className="date-input w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-500 text-sm bg-gray-50" />
                  <Calendar className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                </div>
                <p className="mt-1 flex items-start gap-1 text-xs text-accent-600"><Info className="w-3.5 h-3.5 shrink-0 mt-0.5" /> Bookings open from {minDate} onward.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Priority</label>
                <select value={form.priority} onChange={e => patchForm({ priority: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-accent-500">
                  {PRIORITY_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1"><Calendar className="w-4 h-4" /> Period start</label>
                  <input type="date" min={minDate} value={form.startDate} onChange={e => patchForm({ startDate: e.target.value })} className="date-input w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-500 text-sm bg-gray-50" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1"><Calendar className="w-4 h-4" /> Period end</label>
                  <input type="date" min={form.startDate || minDate} value={form.endDate} onChange={e => patchForm({ endDate: e.target.value })} className="date-input w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-500 text-sm bg-gray-50" />
                </div>
                <div className="relative" ref={daysDropdownRef}>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Days of week</label>
                  <button type="button" onClick={() => setDaysDropdownOpen(o => !o)} className="w-full flex items-center justify-between gap-1 px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-gray-50 text-left focus:outline-none focus:ring-2 focus:ring-accent-500">
                    <span className={`truncate ${form.daysOfWeek.length ? 'text-gray-800' : 'text-gray-400'}`}>
                      {form.daysOfWeek.length ? DAY_LABELS.filter(d => form.daysOfWeek.includes(d.value)).map(d => d.label).join(', ') : 'Select days'}
                    </span>
                    <ChevronDown className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${daysDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {daysDropdownOpen && (
                    <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-md p-1.5 space-y-0.5">
                      {DAY_LABELS.map(day => (
                        <label key={day.value} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-gray-50 cursor-pointer text-sm text-gray-700">
                          <input type="checkbox" checked={form.daysOfWeek.includes(day.value)} onChange={() => toggleDayOfWeek(day.value)} className="w-4 h-4 rounded border-gray-300 accent-accent" />
                          {day.label}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <p className="text-xs text-accent-600">Recurring bookings can only start from {minDate} onward.</p>
            </div>
          )}

          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Time slot *</label>
            <div className="flex flex-wrap gap-2">
              {TIME_SLOTS.map(slot => (
                <button
                  key={slot}
                  type="button"
                  onClick={() => patchForm({ scheduledTime: slot })}
                  className={`px-4 py-2 rounded-lg text-sm font-medium border transition ${form.scheduledTime === slot ? 'bg-[#003152] text-white border-[#003152]' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                >
                  {slot}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Cleaning duration *</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {DURATION_OPTIONS.map(hours => (
                <button
                  key={hours}
                  type="button"
                  onClick={() => patchForm({ estimatedHours: hours })}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition ${Number(form.estimatedHours) === hours ? 'bg-[#003152] text-white border-[#003152]' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                >
                  {hours} hr
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number" min="0.5" max="12" step="0.5"
                value={form.estimatedHours}
                onChange={e => patchForm({ estimatedHours: e.target.value })}
                className="w-24 px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-accent-500"
              />
              <span className="text-sm text-gray-400">hours (0.5 - 12)</span>
            </div>
            {finishTime && <p className="mt-1 text-xs text-accent-600">Finishes around {finishTime}. The cleaner is reserved for this long, so it decides who is still free.</p>}
          </div>

          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Additional requirements</label>
            <textarea
              rows={3}
              value={form.additionalRequirements}
              onChange={e => patchForm({ additionalRequirements: e.target.value })}
              placeholder="Access instructions, equipment notes, contact on site"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-accent-500 text-sm bg-gray-50 resize-none"
            />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 lg:sticky lg:top-6">
        <h3 className="font-semibold text-gray-800 mb-4">Summary</h3>
        <dl className="space-y-2.5 text-sm">
          <Row label="Service" value={serviceType} />
          <Row label="Company" value={selectedCompany?.business_name || '—'} />
          {requestedStaff && <Row label="Requested cleaner" value={requestedStaff.staff_name} />}
          <Row label="Address" value={form.composedLocation || 'Enter a postal code'} />
          <Row label="When" value={bookingMode === 'recurring' ? (form.startDate ? `${form.startDate} - ${form.endDate || '…'}` : 'Choose a period') : (form.scheduledDate || 'Choose a date')} />
          <Row label="Duration" value={`${form.estimatedHours} hours${finishTime ? ` (until ${finishTime})` : ''}`} />
          <Row label="Priority" value={PRIORITY_OPTIONS.find(p => p.value === form.priority)?.label} />
        </dl>

        <div className="mt-4 pt-4 border-t border-gray-100 flex items-baseline justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-700">Estimated total</p>
            <p className="text-xs text-gray-400">
              {price != null ? `$${hourlyRate.toFixed(2)}/hr × ${form.estimatedHours} hours — final price confirmed after site assessment` : 'Priced after site assessment'}
            </p>
          </div>
          <p className="text-xl font-bold text-gray-900">{price != null ? `$${price.toFixed(2)}` : '—'}</p>
        </div>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <div className="mt-4 flex items-center gap-3">
          <button type="button" onClick={onBack} className="px-5 py-2.5 bg-white border border-gray-200 text-gray-600 rounded-xl font-medium text-sm hover:bg-gray-50 transition">Back</button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={submitting}
            className="flex-1 px-5 py-2.5 bg-[#003152] text-white rounded-xl font-semibold text-sm transition disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting ? 'Submitting...' : 'CONFIRM BOOKING'}
          </button>
        </div>
        <p className="mt-3 text-xs text-gray-400">
          Confirming raises a task request with {selectedCompany?.business_name || 'the company'}. Their manager reviews it and the allocation engine proposes the nearest suitable cleaner.
        </p>
      </div>
    </div>
  )
}

function Row({ label, value }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-gray-500 shrink-0">{label}</dt>
      <dd className="text-gray-800 font-medium text-right">{value}</dd>
    </div>
  )
}
