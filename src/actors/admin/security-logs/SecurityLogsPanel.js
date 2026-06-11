import { AlertTriangle } from 'lucide-react'

export default function SecurityLogsPanel({ logs }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border p-6">
      <h2 className="text-lg font-semibold flex items-center gap-2 mb-4"><AlertTriangle className="w-5 h-5 text-red-500" /> Security Logs</h2>
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {logs.map(log => (
          <div key={log.id} className="grid grid-cols-[minmax(180px,1fr)_160px_minmax(220px,1fr)] items-center gap-4 border-b p-2 text-sm">
            <span className="text-gray-500">{new Date(log.created_at).toLocaleString()}</span>
            <span className="text-center">{log.event_type}</span>
            <span className={`truncate text-right ${log.event_type.includes('failed') ? 'text-red-500' : 'text-green-500'}`}>{log.email || '-'}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
