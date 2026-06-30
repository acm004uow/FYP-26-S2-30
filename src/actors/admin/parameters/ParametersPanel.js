import { Settings } from 'lucide-react'

const recommendationWeights = [
  { key: 'availabilityWeight', label: 'Availability Weight' },
  { key: 'skillWeight', label: 'Skill Match Weight' },
  { key: 'regionWeight', label: 'Region Match Weight' },
  { key: 'hoursWeight', label: 'Working Hours Weight' },
  { key: 'workloadWeight', label: 'Workload Weight' },
  { key: 'performanceWeight', label: 'Performance Weight' },
]

export default function ParametersPanel({ params, setParams, onSave }) {
  const totalWeight = recommendationWeights.reduce((total, item) => total + Number(params[item.key] || 0), 0)

  return (
    <div className="bg-white rounded-xl shadow-sm border p-6">
      <h2 className="text-lg font-semibold flex items-center gap-2 mb-4"><Settings className="w-5 h-5 text-gray-700" /> Global Parameters</h2>
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
          <label className="text-sm">Workload Threshold</label>
          <input type="number" value={params.workloadThreshold} onChange={event => setParams({ ...params, workloadThreshold: event.target.value })} className="w-full border rounded-lg p-2 text-sm" />
          </div>
          <div>
          <label className="text-sm">Proximity Radius (km)</label>
          <input type="number" value={params.proximityRadius} onChange={event => setParams({ ...params, proximityRadius: event.target.value })} className="w-full border rounded-lg p-2 text-sm" />
          </div>
        </div>

        <div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-gray-800">Recommendation Weights</h3>
              <p className="text-xs text-gray-500">Higher values make that factor more important in staff ranking.</p>
            </div>
            <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">Total: {totalWeight}</span>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {recommendationWeights.map(item => (
              <label key={item.key} className="text-sm">
                {item.label}
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={params[item.key]}
                  onChange={event => setParams({ ...params, [item.key]: event.target.value })}
                  className="mt-1 w-full border rounded-lg p-2 text-sm"
                />
              </label>
            ))}
          </div>
        </div>
        <button onClick={onSave} className="bg-blue-500 text-white px-4 py-2 rounded-lg text-sm">Save Configuration</button>
      </div>
    </div>
  )
}
