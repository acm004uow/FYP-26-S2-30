import { useState } from 'react'
import { Calendar, CheckCircle, ChevronDown, MapPin, X, XCircle } from 'lucide-react'
import { isStaffOffOnDate } from '../../../../lib/staffTimeOff'

const AVATAR_PALETTE = [
  'bg-blue-100 text-blue-700', 'bg-purple-100 text-purple-700', 'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-700', 'bg-pink-100 text-pink-700', 'bg-cyan-100 text-cyan-700',
]

function avatarColor(name) {
  let hash = 0
  const str = String(name || '')
  for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) | 0
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length]
}

function initialsFor(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase()
}

function statusBadge(uiStatus) {
  const className = `inline-block text-xs px-2 py-1 rounded-full font-medium ${
    uiStatus === 'assigned' || uiStatus === 'scheduled' ? 'bg-green-100 text-green-700'
      : uiStatus === 'skipped' ? 'bg-gray-100 text-gray-500'
        : uiStatus === 'rejected' ? 'bg-red-100 text-red-700'
          : uiStatus === 'error' ? 'bg-red-100 text-red-700'
            : 'bg-yellow-100 text-yellow-700'
  }`
  const label = uiStatus === 'assigning' ? 'Assigning...' : uiStatus === 'rejecting' ? 'Rejecting...' : uiStatus.charAt(0).toUpperCase() + uiStatus.slice(1)
  return <span className={className}>{label}</span>
}

function availabilityFor(staff, scheduledDate, approvedTimeOff) {
  const offOnDate = isStaffOffOnDate(staff.id, scheduledDate, approvedTimeOff)
  if (offOnDate) return { label: 'Off that day', dot: 'bg-red-500' }
  if (!staff.canAssign) return { label: 'Unavailable', dot: 'bg-gray-400' }
  return { label: `${staff.tasks || 0} task${staff.tasks === 1 ? '' : 's'} this week`, dot: 'bg-green-500' }
}

function formatBookingDate(dateIso) {
  if (!dateIso) return ''
  const weekday = new Date(`${dateIso}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })
  return `${dateIso} (${weekday})`
}

// A single staff candidate row, reused both as the collapsed "currently selected" summary and as
// each option inside the expanded picker list. The recommendation's score is only meaningful for
// whichever staff the recommendation engine actually ranked — other candidates don't have a
// computed score available client-side, so we simply don't show one for them rather than fabricate it.
function StaffRow({ staff, availability, score, trailing }) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <span className="relative flex-shrink-0">
        <span className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold ${avatarColor(staff.name)}`}>{initialsFor(staff.name)}</span>
        <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white ${availability.dot}`} />
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate text-sm font-medium text-gray-900">{staff.name}</span>
        <span className="block truncate text-xs text-gray-500">{availability.label}</span>
      </span>
      {Number.isFinite(score) && <span className="flex-shrink-0 text-sm font-semibold text-accent-600">{score}</span>}
      {trailing}
    </div>
  )
}

function StaffPicker({ row, staffRows, approvedTimeOff, selectedStaffId, onChange }) {
  const [open, setOpen] = useState(false)
  const selectedStaff = staffRows.find(staff => staff.id === selectedStaffId) || null
  const isRecommended = selectedStaffId && selectedStaffId === row.recommended_staff_id

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex w-full items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-left hover:bg-gray-50"
      >
        {selectedStaff ? (
          <StaffRow
            staff={selectedStaff}
            availability={availabilityFor(selectedStaff, row.scheduled_date, approvedTimeOff)}
            score={isRecommended ? row.score : undefined}
          />
        ) : (
          <span className="flex-1 text-sm text-gray-500">Unassign</span>
        )}
        <ChevronDown className={`w-4 h-4 flex-shrink-0 text-gray-400 transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-10 mt-1 w-full max-h-64 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
          <button
            type="button"
            onClick={() => { onChange(''); setOpen(false) }}
            className="flex w-full items-center px-3 py-2 text-left text-sm text-gray-500 hover:bg-gray-50"
          >
            Unassign
          </button>
          {staffRows.map(staff => (
            <button
              key={staff.id}
              type="button"
              onClick={() => { onChange(staff.id); setOpen(false) }}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-gray-50 ${staff.id === selectedStaffId ? 'bg-accent-100/40' : ''}`}
            >
              <StaffRow
                staff={staff}
                availability={availabilityFor(staff, row.scheduled_date, approvedTimeOff)}
                score={staff.id === row.recommended_staff_id ? row.score : undefined}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

const SORT_OPTIONS = [
  { value: 'recommended', label: 'Recommended order' },
  { value: 'score', label: 'Highest score first' },
  { value: 'name', label: 'Staff name (A–Z)' },
]

// Opened by clicking a booking (or a merged multi-staff group) on the ScheduleTimeline. Every
// staff candidate is annotated with its availability for THIS booking's date — off-day,
// unavailable, or current workload — so the manager can judge a reassignment without leaving the
// calendar.
export default function ReassignPanel({ rows, staffRows, approvedTimeOff, onApprove, onSkip, onReassign, onClose }) {
  const [selectedStaff, setSelectedStaff] = useState(() => Object.fromEntries(rows.map(row => [row.booking_id, row.recommended_staff_id || ''])))
  const [busyId, setBusyId] = useState(null)
  const [sortBy, setSortBy] = useState('recommended')

  if (rows.length === 0) return null
  const first = rows[0]
  const pendingSlotCount = rows.filter(row => row.uiStatus === 'pending' || row.uiStatus === 'error').length

  const sortedRows = [...rows].sort((a, b) => {
    if (sortBy === 'score') return (b.score ?? -Infinity) - (a.score ?? -Infinity)
    if (sortBy === 'name') return (a.recommended_staff_name || '').localeCompare(b.recommended_staff_name || '')
    return 0
  })

  const handleApprove = async (row) => {
    setBusyId(row.booking_id)
    await onApprove(row, selectedStaff[row.booking_id] || null)
    setBusyId(null)
  }

  const handleReassign = async (row) => {
    setBusyId(row.booking_id)
    await onReassign(row, selectedStaff[row.booking_id] || null)
    setBusyId(null)
  }

  return (
    <div className="fixed inset-0 z-[60] flex justify-end bg-gray-900/30" onClick={onClose}>
      <div className="flex h-full w-full max-w-md flex-col bg-white shadow-2xl" onClick={event => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b p-5 flex-shrink-0">
          <h3 className="font-semibold text-gray-900">Assign staff to this booking</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 flex-shrink-0" aria-label="Close"><X className="w-5 h-5 text-gray-500" /></button>
        </div>

        <div className="border-b p-5 flex-shrink-0 space-y-2">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-gray-900">{first.service_type}</p>
            {statusBadge(first.uiStatus)}
          </div>
          <p className="text-sm text-gray-500 flex items-center gap-1.5"><MapPin className="w-4 h-4 flex-shrink-0" />{first.location}</p>
          <p className="text-sm text-gray-500 flex items-center gap-1.5"><Calendar className="w-4 h-4 flex-shrink-0" />{formatBookingDate(first.scheduled_date)} {first.scheduled_time}</p>
        </div>

        <div className="flex items-center justify-between gap-3 border-b px-5 py-3 flex-shrink-0 text-xs text-gray-500">
          <span>{rows.length} slot{rows.length === 1 ? '' : 's'} · {pendingSlotCount} pending</span>
          {rows.length > 1 && (
            <select value={sortBy} onChange={event => setSortBy(event.target.value)} className="rounded-md border border-gray-200 px-2 py-1 text-xs">
              {SORT_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          )}
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
          {sortedRows.map((row, index) => (
            <div key={row.booking_id} className="p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                {rows.length > 1 && <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Slot {index + 1} of {rows.length}</p>}
                {statusBadge(row.uiStatus)}
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Staff availability for {row.scheduled_date}</label>
                <StaffPicker
                  row={row}
                  staffRows={staffRows}
                  approvedTimeOff={approvedTimeOff}
                  selectedStaffId={selectedStaff[row.booking_id] ?? ''}
                  onChange={staffId => setSelectedStaff(prev => ({ ...prev, [row.booking_id]: staffId }))}
                />
              </div>

              {row.errorMessage && <p className="text-sm text-red-500">{row.errorMessage}</p>}

              <div className="flex gap-2 pt-1">
                {(row.uiStatus === 'pending' || row.uiStatus === 'error') && (
                  <>
                    <button onClick={() => handleApprove(row)} disabled={busyId === row.booking_id} className="flex flex-1 items-center justify-center gap-1 px-3 py-2 bg-green-500 text-white rounded-lg text-sm disabled:opacity-60">
                      <CheckCircle className="w-4 h-4" /> {row.uiStatus === 'error' ? 'Retry' : 'Approve'}
                    </button>
                    <button onClick={() => onSkip(row)} className="flex items-center justify-center gap-1 px-3 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm">
                      <XCircle className="w-4 h-4" /> Skip
                    </button>
                  </>
                )}
                {row.uiStatus === 'scheduled' && (
                  <button onClick={() => handleReassign(row)} disabled={busyId === row.booking_id} className="flex flex-1 items-center justify-center gap-1 px-3 py-2 bg-accent hover:bg-accent-600 text-white rounded-lg text-sm disabled:opacity-60">
                    <CheckCircle className="w-4 h-4" /> Save reassignment
                  </button>
                )}
                {['skipped', 'rejected', 'assigned'].includes(row.uiStatus) && (
                  <p className="text-sm text-gray-400">No further action needed.</p>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="border-t px-5 py-2.5 flex-shrink-0 text-center text-[11px] text-gray-400">
          All times shown in local time (GMT+8)
        </div>
      </div>
    </div>
  )
}
