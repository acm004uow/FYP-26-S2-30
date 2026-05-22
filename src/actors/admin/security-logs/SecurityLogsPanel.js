import { AlertTriangle } from 'lucide-react'

export default function SecurityLogsPanel({ logs }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border p-6">
      <h2 className="text-lg font-semibold flex items-center gap-2 mb-4"><AlertTriangle className="w-5 h-5 text-red-500" /> Security Logs</h2>
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {logs.map(log => (
          <div key={log.id} className="flex items-center justify-between text-sm p-2 border-b gap-3">
            <span className="text-gray-500">{new Date(log.created_at).toLocaleString()}</span>
            <span>{log.event_type}</span>
            <span className={log.event_type.includes('failed') ? 'text-red-500' : 'text-green-500'}>{log.email || '-'}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
