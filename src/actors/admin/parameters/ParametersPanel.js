import { useState } from 'react'
import { Gauge, HelpCircle, Info, ListChecks, Minus, Pencil, Plus, Save, Settings, X } from 'lucide-react'

const thresholdFields = [
  { key: 'workloadThreshold', label: 'Workload Threshold', description: 'Maximum number of active tasks a staff member can have before they\'re considered "overloaded" and lose the Workload Weight bonus.' },
  { key: 'proximityRadius', label: 'Proximity Radius (km)', description: "How close (in km) a staff member's home address must be to the job's address to count as \"nearby\" and earn the Proximity Weight bonus. Staff set their home address from their profile menu." },
]

const recommendationWeights = [
  { key: 'availabilityWeight', label: 'Availability Weight', description: 'Points awarded when the staff member is currently marked "available".' },
  { key: 'regionWeight', label: 'Proximity Weight', description: "Points awarded when the staff member's home address is within the Proximity Radius of the job's address." },
  { key: 'hoursWeight', label: 'Working Hours Weight', description: "Points awarded when taking this task would keep the staff member within their weekly working-hours limit." },
  { key: 'workloadWeight', label: 'Workload Weight', description: "Points awarded when the staff member's current task count is at or below the Workload Threshold." },
  { key: 'performanceWeight', label: 'Performance Weight', description: 'Points awarded when the staff member has a performance rating of 4 or higher.' },
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
        className={`w-full rounded-lg border p-2 text-center text-sm ${disabled ? 'cursor-not-allowed bg-gray-50 text-gray-400' : ''}`}
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
    <div className="rounded-xl border bg-white p-4">
      <div className="mb-2 flex items-center gap-1.5">
        <p className="text-sm font-medium text-gray-800">{field.label}</p>
        <InfoTooltip text={field.description} />
      </div>
      <Stepper value={value} onChange={onChange} disabled={disabled} />
    </div>
  )
}

function HowItWorksModal({ onClose }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-lg w-full p-6 max-h-[85vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-4">
          <h3 className="text-lg font-semibold">How Global Parameters Work</h3>
          <button type="button" onClick={onClose} aria-label="Close"><X className="w-5 h-5" /></button>
        </div>
        <p className="mt-3 text-sm text-gray-600">
          When a booking needs a staff member, the system scores every eligible staff member and recommends the highest-scoring match. Each factor below adds its weight to a candidate's score only if that factor is true for them — the numbers are points, not percentages, and don't need to add up to any fixed total.
        </p>

        <div className="mt-4 space-y-3">
          {thresholdFields.map(item => (
            <div key={item.key} className="rounded-lg bg-gray-50 p-3">
              <p className="text-sm font-medium text-gray-800">{item.label}</p>
              <p className="mt-1 text-xs text-gray-600">{item.description}</p>
            </div>
          ))}
          {recommendationWeights.map(item => (
            <div key={item.key} className="rounded-lg bg-gray-50 p-3">
              <p className="text-sm font-medium text-gray-800">{item.label}</p>
              <p className="mt-1 text-xs text-gray-600">{item.description}</p>
            </div>
          ))}
        </div>

        <p className="mt-4 text-xs text-gray-500">
          Example: a staff member who is available (+30) and nearby (+20) but over their weekly hours and overloaded scores 50. Candidates are ranked highest score first, and anyone who scores 0 across every factor is left off the recommendation list.
        </p>

        <button type="button" onClick={onClose} className="mt-4 w-full bg-gray-100 hover:bg-gray-200 text-gray-800 py-2 rounded-lg text-sm">Got it</button>
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
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-white p-6">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-700">
            <Settings className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-semibold text-gray-800">Global Parameters</h2>
            <p className="text-sm text-gray-500">Configure how the system scores and recommends staff for bookings.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowHowItWorks(true)}
          className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
        >
          <HelpCircle className="w-4 h-4" /> How it works
        </button>
      </div>
      {showHowItWorks && <HowItWorksModal onClose={() => setShowHowItWorks(false)} />}

      <div className="rounded-xl border bg-white p-6">
        <div className="mb-4 flex items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-purple-50 text-purple-600">
            <Gauge className="h-4 w-4" />
          </span>
          <h3 className="text-sm font-semibold text-gray-800">Thresholds</h3>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {thresholdFields.map(field => (
            <ParamCard key={field.key} field={field} value={params[field.key]} onChange={setField(field.key)} disabled={!isEditing} />
          ))}
        </div>
      </div>

      <div className="rounded-xl border bg-white p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-600">
              <ListChecks className="h-4 w-4" />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-gray-800">Recommendation Weights</h3>
              <p className="text-xs text-gray-500">Higher values make that factor more important in staff ranking.</p>
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
          className="flex items-center gap-1.5 rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save Configuration'}
        </button>
      </div>
    </div>
  )
}
