// Replaces the native <input type="time"> everywhere in the app — its picker is a
// browser/OS-native overlay with zero CSS styling hooks and no control over where it renders
// (it can render off-card, as in the cramped screenshot that prompted this). Three plain <select>
// elements give a fully custom, consistent look with no popover positioning to manage.
const HOURS = Array.from({ length: 12 }, (_, i) => i + 1)
const MINUTES = Array.from({ length: 60 }, (_, i) => i)
const PERIODS = ['AM', 'PM']

function parseTime(value) {
  if (!value) return { hour12: '', minute: '', period: '' }
  const [h, m] = value.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const hour12 = h % 12 || 12
  return { hour12: String(hour12), minute: String(m).padStart(2, '0'), period }
}

function toValue(hour12, minute, period) {
  if (hour12 === '' || minute === '' || period === '') return ''
  let h = Number(hour12) % 12
  if (period === 'PM') h += 12
  return `${String(h).padStart(2, '0')}:${minute}`
}

const selectClass = 'w-full rounded-lg border border-gray-200 bg-gray-50 px-2 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

// `required` omits the blank "--" option — use for fields that must always hold a value (e.g.
// the scheduling cutoff time). Leave it false for "preferred time" style fields where no
// selection means "no time preference," matching what an empty native time input used to mean.
export default function TimeInput({ value, onChange, required = false, className = '' }) {
  const { hour12, minute, period } = parseTime(value)

  return (
    <div className={`grid grid-cols-3 gap-2 ${className}`}>
      <select value={hour12} onChange={e => onChange(toValue(e.target.value, minute, period))} className={selectClass}>
        {!required && <option value="">--</option>}
        {HOURS.map(h => <option key={h} value={h}>{String(h).padStart(2, '0')}</option>)}
      </select>
      <select value={minute} onChange={e => onChange(toValue(hour12, e.target.value, period))} className={selectClass}>
        {!required && <option value="">--</option>}
        {MINUTES.map(m => <option key={m} value={String(m).padStart(2, '0')}>{String(m).padStart(2, '0')}</option>)}
      </select>
      <select value={period} onChange={e => onChange(toValue(hour12, minute, e.target.value))} className={selectClass}>
        {!required && <option value="">--</option>}
        {PERIODS.map(p => <option key={p} value={p}>{p}</option>)}
      </select>
    </div>
  )
}
