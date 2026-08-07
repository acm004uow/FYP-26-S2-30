import { useState } from 'react'
import { BarChart3, Clock, Gauge, HelpCircle, Info, MapPin, Minus, Pencil, Plus, Save, Settings, Star, UserCheck, X } from 'lucide-react'

const THEME = {
  purple: { iconBg: 'bg-purple-50', iconColor: 'text-purple-600', pill: 'bg-purple-100 text-purple-700' },
  blue: { iconBg: 'bg-blue-50', iconColor: 'text-blue-600', pill: 'bg-blue-100 text-blue-700' },
  green: { iconBg: 'bg-green-50', iconColor: 'text-green-600', pill: 'bg-green-100 text-green-700' },
  amber: { iconBg: 'bg-amber-50', iconColor: 'text-amber-600', pill: 'bg-amber-100 text-amber-700' },
  red: { iconBg: 'bg-red-50', iconColor: 'text-red-600', pill: 'bg-red-100 text-red-700' },
}

const thresholdFields = [
  { key: 'workloadThreshold', label: 'Workload Threshold', description: 'Maximum number of active tasks a staff member can have before they\'re considered "overloaded" and lose the Workload Weight bonus.', icon: Gauge, theme: 'purple' },
  { key: 'proximityRadius', label: 'Proximity Radius (km)', description: "How close (in km) a staff member's home address must be to the job's address to count as \"nearby\" and earn the Proximity Weight bonus. Staff set their home address from their profile menu.", icon: MapPin, theme: 'blue' },
]

const recommendationWeights = [
  { key: 'availabilityWeight', label: 'Availability Weight', description: 'Points awarded when the staff member is currently marked "available".', icon: UserCheck, theme: 'green' },
  { key: 'regionWeight', label: 'Proximity Weight', description: "Points awarded when the staff member's home address is within the Proximity Radius of the job's address.", icon: MapPin, theme: 'blue' },
  { key: 'hoursWeight', label: 'Working Hours Weight', description: "Points awarded when taking this task would keep the staff member within their weekly working-hours limit.", icon: Clock, theme: 'amber' },
  { key: 'workloadWeight', label: 'Workload Weight', description: "Points awarded when the staff member's current task count is at or below the Workload Threshold.", icon: BarChart3, theme: 'red' },
  { key: 'performanceWeight', label: 'Performance Weight', description: 'Points awarded when the staff member has a performance rating of 4 or higher.', icon: Star, theme: 'purple' },
]

function InfoTooltip({ text }) {
  return (
    <span className="group relative inline-flex">
      <Info className="h-3.5 w-3.5 text-gray-400 cursor-help" />
      <span className="pointer-events-none absolute left-1/2 top-full z-10 mt-2 w-56 -translate-x-1/2 rounded-lg bg-gray-900 px-3 py-2 text-xs leading-relaxed text-white opacity-0 shadow-lg transition group-hover:opacity-100">
        {text}
      </span>
    </span>
  )
}

function Stepper({ value, onChange, min = 0, step = 1, disabled = false }) {
  const numeric = Number(value) || 0
  const buttonClass = `flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border text-gray-500 transition ${disabled ? 'cursor-not-allowed opacity-40' : 'hover:bg-gray-50'}`
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(String(Math.max(min, numeric - step)))}
        className={buttonClass}
        aria-label="Decrease"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <input
        type="number"
        min={min}
        step={step}
        value={value}
        disabled={disabled}
        onChange={event => onChange(event.target.value)}
        className={`w-full rounded-lg border bg-gray-50 p-2.5 text-center text-base font-semibold text-gray-900 ${disabled ? 'cursor-not-allowed text-gray-400' : ''}`}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(String(numeric + step))}
        className={buttonClass}
        aria-label="Increase"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

function ParamCard({ field, value, onChange, disabled }) {
  return (
    <div className="rounded-xl border bg-white p-2 shadow-sm">
      <div className="mb-2 flex items-center gap-1.5">
        <p className="text-sm font-medium text-gray-800">{field.label}</p>
        <InfoTooltip text={field.description} />
      </div>
      <Stepper value={value} onChange={onChange} disabled={disabled} />
    </div>
  )
}

function HowItWorksModal({ onClose }) {
  const items = [
    ...thresholdFields.map(item => ({ ...item, tag: 'Threshold' })),
    ...recommendationWeights.map(item => ({ ...item, tag: 'Weight' })),
  ]

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl max-w-xl w-full p-5 sm:p-8 max-h-[80vh] overflow-y-auto" onClick={event => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-accent-100 text-accent-600">
              <HelpCircle className="h-4 w-4" />
            </span>
            <h3 className="pt-1 text-xl font-bold text-gray-900">How Global Parameters Work</h3>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="shrink-0 text-gray-400 hover:text-gray-600">
            <X className="h-6 w-6" />
          </button>
        </div>

        <p className="mt-4 text-xs leading-relaxed text-gray-600">
          When a booking needs a staff member, the system scores every eligible staff member and recommends the highest-scoring match. Each factor below adds its weight to a candidate&apos;s score only if that factor is true for them — the numbers are points, not percentages, and don&apos;t need to add up to any fixed total.
        </p>

        <div className="mt-5 flex items-start gap-3 rounded-xl border border-accent-100 bg-accent-50 p-3">
          <Star className="mt-0.5 h-5 w-5 shrink-0 text-accent-500" />
          <p className="text-xs leading-relaxed text-gray-700">
            <span className="font-bold text-gray-900">Example:</span> A staff member who is available (<span className="font-bold text-accent-700">+30</span>) and nearby (<span className="font-bold text-accent-700">+20</span>) but over their weekly hours and overloaded <span className="font-bold text-gray-900">scores 50</span>. Candidates are ranked highest score first, and anyone who scores 0 across every factor is left off the recommendation list.
          </p>
        </div>

        <div className="mt-5 space-y-3">
          {items.map(item => {
            const theme = THEME[item.theme]
            const Icon = item.icon
            return (
              <div key={item.key} className="flex items-start gap-4 rounded-xl border border-gray-100 p-3">
                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${theme.iconBg} ${theme.iconColor}`}>
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-base font-bold text-gray-900">{item.label}</p>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${theme.pill}`}>{item.tag}</span>
                  </div>
                  <p className="mt-1 text-xs text-gray-600">{item.description}</p>
                </div>
                <Info className="mt-1 h-5 w-5 shrink-0 text-accent-400" />
              </div>
            )
          })}
        </div>

        <button type="button" onClick={onClose} className="mt-6 w-full rounded-lg bg-accent py-3 text-sm font-semibold text-white transition hover:bg-accent-600">Got it</button>
      </div>
    </div>
  )
}

export default function ParametersPanel({ params, setParams, onSave }) {
  const [showHowItWorks, setShowHowItWorks] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [snapshot, setSnapshot] = useState(null)
  const [saving, setSaving] = useState(false)
  const totalWeight = recommendationWeights.reduce((total, item) => total + Number(params[item.key] || 0), 0)

  const setField = key => value => setParams({ ...params, [key]: value })

  const startEditing = () => {
    setSnapshot(params)
    setIsEditing(true)
  }

  const cancelEditing = () => {
    if (snapshot) setParams(snapshot)
    setIsEditing(false)
  }

  const handleSave = async () => {
    setSaving(true)
    await onSave()
    setSaving(false)
    setIsEditing(false)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-white p-3">
        <div className="flex items-center gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent-100 text-accent-600">
            <Settings className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Global Parameters</h1>
            <p className="text-sm text-gray-500">Configure how the system scores and recommends staff for bookings.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowHowItWorks(true)}
          className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
        >
          <Info className="w-4 h-4" /> How it works
        </button>
      </div>
      {showHowItWorks && <HowItWorksModal onClose={() => setShowHowItWorks(false)} />}

      <div className="rounded-xl border bg-white p-3">
        <div className="mb-4 flex items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-100 text-sm font-bold text-accent-700">
            01
          </span>
          <div>
            <h3 className="text-lg font-bold text-accent-700">Thresholds</h3>
            <p className="text-xs text-gray-500">Set the limits used by the system when matching staff to bookings.</p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {thresholdFields.map(field => (
            <ParamCard key={field.key} field={field} value={params[field.key]} onChange={setField(field.key)} disabled={!isEditing} />
          ))}
        </div>
      </div>

      <div className="rounded-xl border bg-white p-3">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-100 text-sm font-bold text-accent-700">
              02
            </span>
            <div>
              <h3 className="text-lg font-bold text-accent-700">Recommendation Weights</h3>
              <p className="text-xs text-gray-500">Assign importance to each factor used in staff ranking.</p>
            </div>
          </div>
          <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">Total points: {totalWeight}</span>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {recommendationWeights.map(field => (
            <ParamCard key={field.key} field={field} value={params[field.key]} onChange={setField(field.key)} disabled={!isEditing} />
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-4">
        <button
          type="button"
          onClick={isEditing ? cancelEditing : startEditing}
          disabled={saving}
          className="flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
        >
          {isEditing ? <X className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
          {isEditing ? 'Cancel' : 'Edit'}
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!isEditing || saving}
          className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save Configuration'}
        </button>
      </div>
    </div>
  )
}
