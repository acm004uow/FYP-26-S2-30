import Layout from '../../../components/Layout'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { Download, ExternalLink, FileText, Printer, Save, Star } from 'lucide-react'
import { supabase } from '../../../../lib/supabaseClient'

export default function ManagerReports() {
  const router = useRouter()
  const [reportType, setReportType] = useState('daily')
  const [data, setData] = useState(null)
  const [message, setMessage] = useState('')
  const [completedTasks, setCompletedTasks] = useState([])
  const [showAllCompletedTasks, setShowAllCompletedTasks] = useState(false)
  const [reviewDrafts, setReviewDrafts] = useState({})
  const [reviewMessage, setReviewMessage] = useState('')
  const [savingReviewId, setSavingReviewId] = useState(null)

  const reportLabel = reportType.charAt(0).toUpperCase() + reportType.slice(1)
  const fileStamp = new Date().toISOString().slice(0, 10)

  const getReportRows = (reportData = data) => {
    if (!reportData) return []
    return [
      ['Report Type', reportLabel],
      ['Generated At', reportData.generatedAt],
      ['Total Tasks', reportData.totalTasks],
      ['Completed', reportData.completed],
      ['Pending', reportData.pending],
      ['Urgent', reportData.urgent],
      ['Efficiency', reportData.efficiency],
      ['Staff Utilization', reportData.staffUtilization],
      ['Top Performer', reportData.topStaff],
      ['Average Rating', reportData.avgRating],
      ...Object.entries(reportData.tasksByCategory).map(([category, value]) => [`Category: ${category}`, value]),
    ]
  }

  const escapeCsvCell = (value) => {
    const cell = String(value ?? '')
    return /[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell
  }

  const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')

  const loadCompletedTasks = async () => {
    const { data: tasks, error } = await supabase
      .from('task_requests')
      .select('id,title,location,priority,updated_at,assigned_staff_id,staff_profiles(staff_name),task_proofs(file_url,file_name,created_at),performance_reviews(id,rating,feedback,manager_id)')
      .eq('status', 'completed')
      .order('updated_at', { ascending: false })

    if (error) {
      setReviewMessage(error.message)
      return
    }

    const rows = tasks || []
    setCompletedTasks(rows)
    setReviewDrafts(rows.reduce((acc, task) => {
      const review = task.performance_reviews?.[0]
      acc[task.id] = {
        reviewId: review?.id || null,
        rating: review?.rating ? String(review.rating) : '',
        feedback: review?.feedback || '',
      }
      return acc
    }, {}))
  }

  useEffect(() => {
    loadCompletedTasks()
  }, [])

  useEffect(() => {
    if (router.query.section === 'completed') {
      setTimeout(() => document.getElementById('completed-task-reviews')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
    }
  }, [router.query.section])

  const saveReview = async (task) => {
    const draft = reviewDrafts[task.id] || {}
    const rating = draft.rating ? Number(draft.rating) : null
    const feedback = draft.feedback?.trim() || null

    if (rating !== null && (rating < 1 || rating > 5)) {
      setReviewMessage('Rating must be between 1 and 5.')
      return
    }
    if (rating === null && !feedback) {
      setReviewMessage('Add a rating or feedback before saving.')
      return
    }

    setSavingReviewId(task.id)
    const { data: { user } } = await supabase.auth.getUser()
    const payload = {
      task_id: task.id,
      staff_id: task.assigned_staff_id,
      manager_id: user?.id,
      rating,
      feedback,
    }
    const request = draft.reviewId
      ? supabase.from('performance_reviews').update(payload).eq('id', draft.reviewId)
      : supabase.from('performance_reviews').insert(payload)
    const { error } = await request

    if (!error && task.assigned_staff_id && rating !== null) {
      const { data: staffReviews } = await supabase
        .from('performance_reviews')
        .select('rating')
        .eq('staff_id', task.assigned_staff_id)
        .not('rating', 'is', null)
      const ratings = staffReviews || []
      const average = ratings.length
        ? ratings.reduce((sum, review) => sum + Number(review.rating || 0), 0) / ratings.length
        : rating
      await supabase
        .from('staff_profiles')
        .update({ performance_rating: Number(average.toFixed(1)), updated_at: new Date().toISOString() })
        .eq('id', task.assigned_staff_id)
    }

    setSavingReviewId(null)
    setReviewMessage(error ? error.message : 'Review saved.')
    await loadCompletedTasks()
    setTimeout(() => setReviewMessage(''), 3000)
  }

  const visibleCompletedTasks = showAllCompletedTasks ? completedTasks : completedTasks.slice(0, 3)

  const generate = async () => {
    const days = reportType === 'daily' ? 1 : reportType === 'weekly' ? 7 : 30
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
    const [{ data: tasks }, { data: staff }, { data: reviews }] = await Promise.all([
      supabase.from('task_requests').select('status,priority,required_skill,assigned_staff_id,staff_profiles(staff_name)').gte('created_at', since),
      supabase.from('staff_profiles').select('id,staff_name,current_workload'),
      supabase.from('performance_reviews').select('rating').gte('created_at', since),
    ])

    const taskRows = tasks || []
    const staffRows = staff || []
    const completed = taskRows.filter(task => task.status === 'completed').length
    const totalTasks = taskRows.length
    const assignedCounts = taskRows.reduce((acc, task) => {
      const name = task.staff_profiles?.staff_name
      if (name) acc[name] = (acc[name] || 0) + 1
      return acc
    }, {})
    const topEntry = Object.entries(assignedCounts).sort((a, b) => b[1] - a[1])[0]
    const tasksByCategory = taskRows.reduce((acc, task) => {
      const category = task.required_skill || 'General'
      acc[category] = (acc[category] || 0) + 1
      return acc
    }, {})
    const avgRating = reviews?.length ? (reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / reviews.length).toFixed(1) : '0.0'

    setData({
      totalTasks,
      completed,
      pending: taskRows.filter(task => task.status === 'pending').length,
      urgent: taskRows.filter(task => task.priority === 'High').length,
      efficiency: totalTasks ? `${Math.round((completed / totalTasks) * 100)}%` : '0%',
      staffUtilization: staffRows.length ? `${Math.round((taskRows.filter(task => task.assigned_staff_id).length / staffRows.length) * 100)}%` : '0%',
      topStaff: topEntry ? `${topEntry[0]} (${topEntry[1]} tasks)` : 'No assigned tasks',
      avgRating,
      tasksByCategory: Object.keys(tasksByCategory).length ? tasksByCategory : { General: 0 },
      generatedAt: new Date().toLocaleString(),
    })
    setMessage('')
  }

  const downloadCsv = () => {
    if (!data) return
    const csv = getReportRows().map(row => row.map(escapeCsvCell).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${reportType}-operational-report-${fileStamp}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    setMessage('CSV report downloaded.')
  }

  const exportPdf = () => {
    if (!data) return
    const reportRows = getReportRows()
    const categoryRows = Object.entries(data.tasksByCategory)
      .map(([category, value]) => `<tr><td>${escapeHtml(category)}</td><td>${escapeHtml(value)}</td></tr>`)
      .join('')

    const printWindow = window.open('', '_blank', 'width=900,height=700')
    if (!printWindow) {
      setMessage('Pop-up blocked. Allow pop-ups for this site, then try Export PDF again.')
      return
    }

    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>${escapeHtml(reportLabel)} Operational Report</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 32px; color: #111827; }
            h1 { margin: 0 0 6px; font-size: 24px; }
            h2 { margin-top: 24px; font-size: 18px; }
            .meta { color: #4b5563; margin-bottom: 24px; }
            .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 20px; }
            .metric { border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px; }
            .metric span { display: block; color: #6b7280; font-size: 12px; margin-bottom: 6px; }
            .metric strong { font-size: 22px; }
            table { width: 100%; border-collapse: collapse; margin-top: 14px; }
            th, td { border: 1px solid #e5e7eb; padding: 10px; text-align: left; font-size: 13px; }
            th { background: #f9fafb; }
            @media print { body { margin: 20px; } }
          </style>
        </head>
        <body>
          <h1>${escapeHtml(reportLabel)} Operational Report</h1>
          <div class="meta">Generated at ${escapeHtml(data.generatedAt)}</div>
          <div class="grid">
            <div class="metric"><span>Total Tasks</span><strong>${escapeHtml(data.totalTasks)}</strong></div>
            <div class="metric"><span>Completed</span><strong>${escapeHtml(data.completed)}</strong></div>
            <div class="metric"><span>Pending</span><strong>${escapeHtml(data.pending)}</strong></div>
            <div class="metric"><span>Urgent</span><strong>${escapeHtml(data.urgent)}</strong></div>
          </div>
          <table>
            <thead><tr><th>Metric</th><th>Value</th></tr></thead>
            <tbody>
              ${reportRows.map(([label, value]) => `<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(value)}</td></tr>`).join('')}
            </tbody>
          </table>
          <h2>Tasks by Category</h2>
          <table>
            <thead><tr><th>Category</th><th>Tasks</th></tr></thead>
            <tbody>${categoryRows}</tbody>
          </table>
          <script>
            window.onload = () => {
              window.print();
              window.onafterprint = () => window.close();
            };
          </script>
        </body>
      </html>
    `)
    printWindow.document.close()
    setMessage('PDF export opened. Choose Save as PDF in the print dialog.')
  }

  return (
    <Layout role="manager">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold">Operational Reports</h1>
        <p className="text-gray-500 text-sm mb-6">Generate daily, weekly, or monthly performance reports with detailed breakdowns.</p>
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <div className="flex gap-2 mb-4">
            {['daily', 'weekly', 'monthly'].map(t => (
              <button key={t} onClick={() => setReportType(t)} className={`px-4 py-2 rounded-lg text-sm font-medium ${reportType === t ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-700'}`}>{t.charAt(0).toUpperCase() + t.slice(1)}</button>
            ))}
          </div>
          <div className="flex flex-wrap gap-3">
            <button onClick={generate} className="bg-gradient-to-r from-blue-500 to-green-500 text-white px-4 py-2 rounded-lg flex items-center gap-2"><FileText className="w-4 h-4" /> Generate Report</button>
            {data && (
              <>
                <button onClick={downloadCsv} className="border border-gray-200 bg-white text-gray-700 px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium hover:bg-gray-50"><Download className="w-4 h-4" /> Download CSV</button>
                <button onClick={exportPdf} className="border border-gray-200 bg-white text-gray-700 px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium hover:bg-gray-50"><Printer className="w-4 h-4" /> Export PDF</button>
              </>
            )}
          </div>
          {message && <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">{message}</div>}

          {data && (
            <div className="mt-6 space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-gray-50 p-3 rounded-lg"><p className="text-xs text-gray-500">Total Tasks</p><p className="text-xl font-bold">{data.totalTasks}</p></div>
                <div className="bg-gray-50 p-3 rounded-lg"><p className="text-xs text-gray-500">Completed</p><p className="text-xl font-bold text-green-600">{data.completed}</p></div>
                <div className="bg-gray-50 p-3 rounded-lg"><p className="text-xs text-gray-500">Pending</p><p className="text-xl font-bold text-orange-500">{data.pending}</p></div>
                <div className="bg-gray-50 p-3 rounded-lg"><p className="text-xs text-gray-500">Urgent</p><p className="text-xl font-bold text-red-500">{data.urgent}</p></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 p-3 rounded-lg"><p className="text-xs text-gray-500">Efficiency</p><p className="text-lg font-semibold">{data.efficiency}</p><p className="text-xs">(Completed / Total)</p></div>
                <div className="bg-gray-50 p-3 rounded-lg"><p className="text-xs text-gray-500">Staff Utilization</p><p className="text-lg font-semibold">{data.staffUtilization}</p><p className="text-xs">Avg tasks per staff</p></div>
                <div className="bg-gray-50 p-3 rounded-lg"><p className="text-xs text-gray-500">Top Performer</p><p className="text-sm font-medium">{data.topStaff}</p></div>
                <div className="bg-gray-50 p-3 rounded-lg"><p className="text-xs text-gray-500">Average Rating</p><p className="text-lg font-semibold flex items-center gap-1"><Star className="w-5 h-5 fill-yellow-400 text-yellow-400" />{data.avgRating}</p></div>
              </div>
              <div className="bg-gray-50 p-3 rounded-lg">
                <p className="text-xs text-gray-500 mb-1">Tasks by Category</p>
                <div className="flex gap-4 text-sm">
                  {Object.entries(data.tasksByCategory).map(([cat, val]) => (<div key={cat}><span className="font-medium">{cat}:</span> {val}</div>))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div id="completed-task-reviews" className="mt-8 bg-white rounded-xl shadow-sm border p-6 scroll-mt-24">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Completed Task Reviews</h2>
              <p className="text-sm text-gray-500 mt-1">View uploaded proof, then optionally rate and leave feedback.</p>
            </div>
            {completedTasks.length > 3 && (
              <button
                type="button"
                onClick={() => setShowAllCompletedTasks(value => !value)}
                className="inline-flex items-center justify-center rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50"
              >
                {showAllCompletedTasks ? 'Show latest 3' : 'View all'}
              </button>
            )}
          </div>
          {reviewMessage && <div className="mb-4 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">{reviewMessage}</div>}
          <div className="space-y-4">
            {completedTasks.length === 0 && <div className="rounded-lg border p-8 text-center text-gray-400">No completed tasks yet.</div>}
            {visibleCompletedTasks.map(task => {
              const proof = task.task_proofs?.[0]
              const draft = reviewDrafts[task.id] || { rating: '', feedback: '' }
              return (
                <div key={task.id} className="rounded-xl border border-gray-100 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3 className="font-semibold text-gray-900">{task.title}</h3>
                      <p className="text-sm text-gray-500">{task.location} - Completed {task.updated_at ? new Date(task.updated_at).toLocaleString() : 'recently'}</p>
                      <p className="text-sm text-gray-500">Assigned staff: {task.staff_profiles?.staff_name || 'Unassigned'}</p>
                    </div>
                    {proof?.file_url ? (
                      <a href={proof.file_url} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50">
                        <ExternalLink className="h-4 w-4" /> View Proof
                      </a>
                    ) : (
                      <span className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-400">No proof uploaded</span>
                    )}
                  </div>
                  {proof?.file_name && <p className="mt-2 text-xs text-gray-400">Proof file: {proof.file_name}</p>}
                  <div className="mt-4 grid gap-3 sm:grid-cols-[160px_minmax(0,1fr)_auto]">
                    <select
                      value={draft.rating}
                      onChange={event => setReviewDrafts(prev => ({ ...prev, [task.id]: { ...draft, rating: event.target.value } }))}
                      className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    >
                      <option value="">No rating</option>
                      {[1, 2, 3, 4, 5].map(value => <option key={value} value={value}>{value} star{value > 1 ? 's' : ''}</option>)}
                    </select>
                    <input
                      value={draft.feedback}
                      onChange={event => setReviewDrafts(prev => ({ ...prev, [task.id]: { ...draft, feedback: event.target.value } }))}
                      placeholder="Optional feedback"
                      className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => saveReview(task)}
                      disabled={savingReviewId === task.id}
                      className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-60"
                    >
                      <Save className="h-4 w-4" /> {savingReviewId === task.id ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </Layout>
  )
}
