import { Settings } from 'lucide-react'

export default function ParametersPanel({ params, setParams, onSave }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border p-6">
      <h2 className="text-lg font-semibold flex items-center gap-2 mb-4"><Settings className="w-5 h-5 text-gray-700" /> Global Parameters</h2>
      <div className="space-y-3">
        <div>
          <label className="text-sm">Workload Threshold</label>
          <input type="number" value={params.workloadThreshold} onChange={event => setParams({ ...params, workloadThreshold: event.target.value })} className="w-full border rounded-lg p-2 text-sm" />
        </div>
        <div>
          <label className="text-sm">Proximity Radius (km)</label>
          <input type="number" value={params.proximityRadius} onChange={event => setParams({ ...params, proximityRadius: event.target.value })} className="w-full border rounded-lg p-2 text-sm" />
        </div>
        <div>
          <label className="text-sm">Performance Weight</label>
          <input type="number" value={params.priorityWeights} onChange={event => setParams({ ...params, priorityWeights: event.target.value })} className="w-full border rounded-lg p-2 text-sm" />
        </div>
        <button onClick={onSave} className="bg-blue-500 text-white px-4 py-2 rounded-lg text-sm">Save Configuration</button>
      </div>
    </div>
  )
}
