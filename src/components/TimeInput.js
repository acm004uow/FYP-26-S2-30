import { useEffect, useRef, useState } from 'react'
import { Clock } from 'lucide-react'

// A custom modal time picker (type digits into Hour/Minute, tap AM/PM, Cancel/OK) instead of the
// native <input type="time"> — that picker is a browser/OS-native overlay with zero CSS styling
// hooks and no control over where it renders (it can render off-card in a cramped layout). A
// centered modal with its own backdrop is always predictable regardless of where the trigger
// button sits on the page, and typing digits directly is faster than scrolling any dropdown.

function parseTime(value) {
  if (!value) return null
  const [h, m] = value.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const hour12 = h % 12 || 12
  return { hour12: String(hour12), minute: String(m).padStart(2, '0'), period }
}

function toValue({ hour12, minute, period }) {
  let h = Number(hour12) % 12
  if (period === 'PM') h += 12
  return `${String(h).padStart(2, '0')}:${minute}`
}

function formatDisplay(value) {
  const parts = parseTime(value)
  if (!parts) return ''
  return `${parts.hour12}:${parts.minute} ${parts.period}`
}

function clampHour(raw) {
  const n = Number(raw)
  if (!raw || Number.isNaN(n) || n < 1 || n > 12) return '12'
  return String(n)
}

function clampMinute(raw) {
  const n = Number(raw)
  if (!raw || Number.isNaN(n)) return '00'
  return String(Math.min(59, n)).padStart(2, '0')
}

const DEFAULT_DRAFT = { hour12: '12', minute: '00', period: 'AM' }

// `required` controls the trigger's placeholder text only ("Select time" vs "--") — the modal
// itself always composes a full, valid time once confirmed, so there's no separate validation path.
export default function TimeInput({ value, onChange, required = false, className = '' }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(() => parseTime(value) || DEFAULT_DRAFT)
  const hourRef = useRef(null)
  const minuteRef = useRef(null)

  useEffect(() => {
    if (!open) setDraft(parseTime(value) || DEFAULT_DRAFT)
  }, [value, open])

  useEffect(() => {
    if (open) {
      hourRef.current?.focus()
      hourRef.current?.select()
    }
  }, [open])

  const confirm = () => {
    onChange(toValue({ ...draft, hour12: clampHour(draft.hour12), minute: clampMinute(draft.minute) }))
    setOpen(false)
  }

  const cancel = () => {
    setDraft(parseTime(value) || DEFAULT_DRAFT)
    setOpen(false)
  }

  const digitField = (field, ref, nextRef) => (
    <input
      ref={ref}
      type="text"
      inputMode="numeric"
      maxLength={2}
      value={draft[field]}
      onFocus={e => e.target.select()}
      onChange={e => {
        const digits = e.target.value.replace(/\D/g, '').slice(0, 2)
        setDraft(prev => ({ ...prev, [field]: digits }))
        if (digits.length === 2) nextRef?.current?.focus()
      }}
      onBlur={() => setDraft(prev => ({ ...prev, [field]: (field === 'hour12' ? clampHour : clampMinute)(prev[field]) }))}
      onKeyDown={e => {
        if (e.key === 'Enter') { e.preventDefault(); confirm() }
        if (e.key === 'Escape') { e.preventDefault(); cancel() }
      }}
      className="w-full rounded-xl bg-accent-50 text-center text-4xl font-medium text-gray-900 py-4 focus:outline-none focus:bg-accent-100 focus:ring-2 focus:ring-accent-500"
    />
  )

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-left text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
      >
        <span className={value ? 'text-gray-900' : 'text-gray-400'}>{value ? formatDisplay(value) : (required ? 'Select time' : '--')}</span>
        <Clock className="h-4 w-4 shrink-0 text-gray-400" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={cancel}>
          <div className="w-full max-w-xs rounded-2xl bg-white p-6 shadow-xl" onClick={e => e.stopPropagation()}>
            <p className="mb-5 text-sm font-medium text-gray-500">Enter time</p>
            <div className="flex items-start gap-2.5">
              <div className="flex-1">
                {digitField('hour12', hourRef, minuteRef)}
                <p className="mt-1.5 text-center text-xs text-gray-500">Hour</p>
              </div>
              <span className="pt-4 text-2xl text-gray-300">:</span>
              <div className="flex-1">
                {digitField('minute', minuteRef, null)}
                <p className="mt-1.5 text-center text-xs text-gray-500">Minute</p>
              </div>
              <div className="flex shrink-0 flex-col overflow-hidden rounded-xl border border-gray-200">
                <button
                  type="button"
                  onClick={() => setDraft(prev => ({ ...prev, period: 'AM' }))}
                  className={`px-4 py-2.5 text-sm font-semibold transition ${draft.period === 'AM' ? 'bg-accent-100 text-accent-800' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                >
                  AM
                </button>
                <button
                  type="button"
                  onClick={() => setDraft(prev => ({ ...prev, period: 'PM' }))}
                  className={`border-t border-gray-200 px-4 py-2.5 text-sm font-semibold transition ${draft.period === 'PM' ? 'bg-accent-100 text-accent-800' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                >
                  PM
                </button>
              </div>
            </div>
            <div className="mt-6 flex items-center justify-end gap-2">
              <button type="button" onClick={cancel} className="rounded-lg px-3 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50">Cancel</button>
              <button type="button" onClick={confirm} className="rounded-lg px-3 py-2 text-sm font-semibold text-accent-700 hover:bg-accent-50">OK</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
