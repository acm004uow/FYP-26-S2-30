import { FileText } from 'lucide-react'

export default function AuditLogsPanel({ logs }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border p-6">
      <h2 className="text-lg font-semibold flex items-center gap-2 mb-4"><FileText className="w-5 h-5 text-purple-500" /> Audit Logs</h2>
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {logs.map(log => (
          <div key={log.id} className="text-sm p-2 border-b">
            <span className="text-gray-500">{new Date(log.created_at).toLocaleString()}</span> - {log.action} by {log.profiles?.email || 'system'}
          </div>
        ))}
      </div>
    </div>
  )
}
