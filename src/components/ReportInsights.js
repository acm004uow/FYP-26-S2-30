import { AlertTriangle, FileText, Info, Sparkles, TrendingUp } from 'lucide-react'

const TONE_THEME = {
  positive: { bg: 'bg-green-50', color: 'text-green-600', icon: TrendingUp },
  warning: { bg: 'bg-amber-50', color: 'text-amber-600', icon: AlertTriangle },
  neutral: { bg: 'bg-purple-50', color: 'text-purple-600', icon: Info },
}

// AI-generated (OpenAI, via /api/reports/insights) short takeaways on top of a report's own
// numbers — shared between the manager and owner report pages so both stay visually consistent.
export default function ReportInsights({ insights, loading, error, onViewDetails }) {
  return (
    <div className="flex h-full flex-col rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <h3 className="text-lg font-semibold text-gray-900">Insights</h3>
        <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-purple-50 px-2 py-0.5 text-xs font-semibold text-purple-600">
          <Sparkles className="h-3 w-3" /> AI
        </span>
      </div>

      {loading ? (
        <p className="text-base text-gray-400">Generating insights…</p>
      ) : error ? (
        <p className="text-base text-gray-400">{error}</p>
      ) : !insights || insights.length === 0 ? (
        <p className="text-base text-gray-400">No insights yet.</p>
      ) : (
        <div className="flex-1 space-y-4">
          {insights.map((insight, index) => {
            const theme = TONE_THEME[insight.tone] || TONE_THEME.neutral
            return (
              <div key={index} className="flex items-start gap-3">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${theme.bg}`}>
                  <theme.icon className={`h-5 w-5 ${theme.color}`} />
                </span>
                <div className="min-w-0">
                  <p className="text-base font-semibold text-gray-900">{insight.title}</p>
                  <p className="text-sm text-gray-500">{insight.message}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {onViewDetails && (
        <button
          type="button"
          onClick={onViewDetails}
          className="mt-5 flex w-full items-center justify-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-base font-semibold text-accent-700 hover:bg-accent-50"
        >
          <FileText className="h-4 w-4" /> View detailed report
        </button>
      )}
    </div>
  )
}
