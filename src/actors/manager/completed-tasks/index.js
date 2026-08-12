import Layout from '../../../components/Layout'
import { Fragment, useEffect, useState } from 'react'
import { AlertTriangle, Calendar, CheckCircle2, ChevronLeft, ChevronRight, Clock, Eye, FileText, MapPin, Save, Star, X } from 'lucide-react'
import { supabase } from '../../../../lib/supabaseClient'
import { useAuthUser } from '../../../context/AuthUserContext'

// attendance_status is only 'present'/'late'/null (see lib/attendance.js) — null means the task
// was never checked into via the staff check-in flow, so there's nothing to show a badge for.
function AttendanceBadge({ status }) {
  if (status !== 'present' && status !== 'late') return null
  const isLate = status === 'late'
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${isLate ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
      <Clock className="h-3 w-3" /> {isLate ? 'Late' : 'Present'}
    </span>
  )
}

const PAGE_SIZE = 5

function initials(name) {
  return String(name || '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join('') || '?'
}

function ratingTheme(rating) {
  if (rating >= 4.5) return { bg: 'bg-green-50', text: 'text-green-700', icon: 'text-green-500 fill-green-500' }
  if (rating >= 3.5) return { bg: 'bg-accent-100', text: 'text-accent-700', icon: 'text-accent-500 fill-accent-500' }
  return { bg: 'bg-red-50', text: 'text-red-700', icon: 'text-red-500 fill-red-500' }
}

function relativeCompletedLabel(dateStr) {
  if (!dateStr) return 'Recently'
  const date = new Date(dateStr)
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const diffDays = Math.round((startOfToday - startOfDate) / 86400000)
  if (diffDays <= 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  const weekday = date.toLocaleDateString([], { weekday: 'short' })
  if (diffDays < 7) return weekday
  if (diffDays < 14) return `Last ${weekday}`
  const weeks = Math.floor(diffDays / 7)
  return `${weeks} week${weeks > 1 ? 's' : ''} ago`
}

export default function ManagerCompletedTasks() {
  const { user } = useAuthUser()
  const [completedTasks, setCompletedTasks] = useState([])
  const [reviewDrafts, setReviewDrafts] = useState({})
  const [reviewMessage, setReviewMessage] = useState('')
  const [savingReviewId, setSavingReviewId] = useState(null)
  const [activeTaskId, setActiveTaskId] = useState(null)
  const [hoverRating, setHoverRating] = useState(0)
  const [resolvingId, setResolvingId] = useState(null)
  const [currentPage, setCurrentPage] = useState(1)

  const loadCompletedTasks = async () => {
    if (!user) return
    const { data: managerProfile } = await supabase
      .from('profiles')
      .select('host_admin_id')
      .eq('id', user?.id)
      .single()

    const { data: tasks, error } = await supabase
      .from('bookings')
      .select('id,service_type,location,status,updated_at,assigned_staff_id,attendance_status,issue_status,issue_description,issue_reported_at,issue_reported_by,staff_profiles(staff_name),task_proofs(file_url,file_name,created_at),performance_reviews(id,rating,feedback,manager_id),booking_feedback(rating,comment,image_url)')
      .eq('host_admin_id', managerProfile?.host_admin_id)
      .or('status.eq.completed,issue_status.eq.open')
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
  }, [user])

  useEffect(() => {
    setHoverRating(0)
  }, [activeTaskId])

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
    const payload = {
      booking_id: task.id,
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

  const handleResolveIssue = async (task) => {
    setResolvingId(task.id)
    const { error } = await supabase
      .from('bookings')
      .update({ issue_status: 'resolved', issue_resolved_at: new Date().toISOString(), issue_resolved_by: user.id })
      .eq('id', task.id)
    setResolvingId(null)

    if (error) {
      setReviewMessage(error.message)
      return
    }

    if (task.issue_reported_by) {
      await supabase.from('notifications').insert({
        user_id: task.issue_reported_by,
        title: 'Issue resolved',
        message: `Your reported issue on ${task.service_type} has been marked resolved.`,
      })
    }

    await supabase.from('audit_logs').insert({ user_id: user.id, action: 'resolve_booking_issue', details: `Booking ${task.id}` })
    setReviewMessage('Issue marked resolved.')
    await loadCompletedTasks()
    setTimeout(() => setReviewMessage(''), 3000)
  }

  const activeTask = completedTasks.find(task => task.id === activeTaskId) || null
  const activeDraft = activeTask ? (reviewDrafts[activeTask.id] || { rating: '', feedback: '' }) : null

  const totalPages = Math.max(1, Math.ceil(completedTasks.length / PAGE_SIZE))
  const safePage = Math.min(currentPage, totalPages)
  const pagedTasks = completedTasks.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  return (
    <Layout role="manager">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">Manager / Completed Tasks</p>
        <h1 className="text-2xl font-bold">Completed tasks</h1>
        <p className="text-gray-500 mb-6">Grade performance and leave feedback after completion.</p>

        {reviewMessage && <div className="mb-4 rounded-lg border border-accent-200 bg-accent-100 px-4 py-3 text-sm text-accent-800">{reviewMessage}</div>}

        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <th className="px-5 py-3">Task</th>
                  <th className="px-5 py-3">Staff</th>
                  <th className="px-5 py-3">Completed</th>
                  <th className="px-5 py-3">Proof</th>
                  <th className="px-5 py-3">Rating</th>
                  <th className="px-5 py-3 w-12" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {pagedTasks.map(task => {
                  const proof = task.task_proofs?.[0]
                  const review = task.performance_reviews?.[0]
                  const theme = review?.rating ? ratingTheme(Number(review.rating)) : null
                  const hasOpenIssue = task.issue_status === 'open'
                  return (
                    <Fragment key={task.id}>
                    <tr className="hover:bg-gray-50/60">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-100 text-accent-600">
                            <CheckCircle2 className="h-4 w-4" />
                          </span>
                          <span className="font-semibold text-gray-900">{task.service_type}</span>
                          <AttendanceBadge status={task.attendance_status} />
                          {task.status !== 'completed' && (
                            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">Reopened for rework</span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-purple-100 text-purple-700 text-xs font-bold">
                            {initials(task.staff_profiles?.staff_name)}
                          </span>
                          <span className="text-gray-700">{task.staff_profiles?.staff_name || 'Unassigned'}</span>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-gray-600">{relativeCompletedLabel(task.updated_at)}</td>
                      <td className="px-5 py-4">
                        {proof?.file_url ? (
                          <a href={proof.file_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full bg-accent-100 px-3 py-1 text-xs font-semibold text-accent-700 hover:bg-accent-200">
                            <FileText className="h-3.5 w-3.5" /> View
                          </a>
                        ) : (
                          <span className="text-gray-400">No proof</span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        {review?.rating ? (
                          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${theme.bg} ${theme.text}`}>
                            <Star className={`h-3.5 w-3.5 ${theme.icon}`} /> {Number(review.rating).toFixed(1)}
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setActiveTaskId(task.id)}
                            className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-200"
                          >
                            <Star className="h-3.5 w-3.5 text-amber-500" /> Rate
                          </button>
                        )}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <button
                          type="button"
                          onClick={() => setActiveTaskId(task.id)}
                          aria-label="View task details"
                          className="inline-flex items-center justify-center rounded-lg border border-gray-200 p-2 text-gray-500 hover:bg-accent-50 hover:text-accent-600 hover:border-accent-200"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                    {hasOpenIssue && (
                      <tr>
                        <td colSpan={6} className="px-5 pb-4">
                          <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                            <div className="flex items-start gap-2 text-sm text-amber-800">
                              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                              <span>
                                <strong>Issue reported:</strong> {task.issue_description}
                                {task.issue_reported_at && <span className="block text-xs text-amber-600 mt-0.5">Reported {new Date(task.issue_reported_at).toLocaleString()}</span>}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleResolveIssue(task)}
                              disabled={resolvingId === task.id}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white transition disabled:opacity-60"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" /> {resolvingId === task.id ? 'Resolving...' : 'Mark resolved'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
            {completedTasks.length === 0 && <div className="p-10 text-center text-gray-400">No completed tasks yet.</div>}
          </div>

          {totalPages > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 px-5 py-3">
              <p className="text-sm text-gray-500">
                Showing {(safePage - 1) * PAGE_SIZE + 1} to {Math.min(safePage * PAGE_SIZE, completedTasks.length)} of {completedTasks.length} tasks
              </p>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setCurrentPage(page => Math.max(1, page - 1))}
                  disabled={safePage === 1}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                {Array.from({ length: totalPages }, (_, index) => index + 1).map(pageNumber => (
                  <button
                    key={pageNumber}
                    type="button"
                    onClick={() => setCurrentPage(pageNumber)}
                    className={`flex h-8 w-8 items-center justify-center rounded-lg border text-sm font-medium ${pageNumber === safePage ? 'border-accent-600 bg-accent-600 text-white' : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'}`}
                  >
                    {pageNumber}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setCurrentPage(page => Math.min(totalPages, page + 1))}
                  disabled={safePage === totalPages}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="Next page"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {activeTask && activeDraft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setActiveTaskId(null)}>
          <div className="w-full max-w-lg rounded-2xl bg-white max-h-[90vh] overflow-y-auto" onClick={event => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 p-6 pb-5 border-b border-gray-100">
              <div className="flex items-start gap-3 min-w-0">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-100 text-accent-600">
                  <CheckCircle2 className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-semibold text-gray-900">{activeTask.service_type}</h3>
                    <AttendanceBadge status={activeTask.attendance_status} />
                  </div>
                  <p className="text-sm text-gray-500 mt-0.5 flex items-start gap-1"><MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0 text-gray-400" /> {activeTask.location}</p>
                </div>
              </div>
              <button type="button" onClick={() => setActiveTaskId(null)} aria-label="Close" className="shrink-0 text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>

            <div className="p-6 space-y-5">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2.5 text-gray-600">
                  <Calendar className="h-4 w-4 text-gray-400 shrink-0" />
                  <span className="truncate">{activeTask.updated_at ? new Date(activeTask.updated_at).toLocaleString() : 'Recently'}</span>
                </div>
                <div className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2.5 text-gray-600">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-purple-100 text-purple-700 text-[10px] font-bold">
                    {(activeTask.staff_profiles?.staff_name || '?').split(' ').filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase()).join('') || '?'}
                  </span>
                  <span className="truncate">{activeTask.staff_profiles?.staff_name || 'Unassigned'}</span>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Proof of work</p>
                {activeTask.task_proofs?.[0]?.file_url ? (
                  <a
                    href={activeTask.task_proofs[0].file_url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between gap-2 rounded-lg border border-accent-200 bg-accent-100 px-4 py-3 text-sm font-semibold text-accent-700 hover:bg-accent-200 transition"
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <FileText className="h-4 w-4 shrink-0" />
                      <span className="truncate">{activeTask.task_proofs[0].file_name || 'View proof'}</span>
                    </span>
                    <span className="shrink-0 text-xs">Open →</span>
                  </a>
                ) : (
                  <div className="rounded-lg border border-dashed border-gray-200 px-4 py-3 text-sm text-gray-400">
                    No proof uploaded
                  </div>
                )}
              </div>

              {activeTask.issue_status === 'open' && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Reported issue</p>
                  <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                    <div className="flex items-start gap-2 text-sm text-amber-800">
                      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                      <span>
                        {activeTask.issue_description}
                        {activeTask.issue_reported_at && <span className="block text-xs text-amber-600 mt-0.5">Reported {new Date(activeTask.issue_reported_at).toLocaleString()}</span>}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleResolveIssue(activeTask)}
                      disabled={resolvingId === activeTask.id}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white transition disabled:opacity-60"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" /> {resolvingId === activeTask.id ? 'Resolving...' : 'Mark resolved'}
                    </button>
                  </div>
                </div>
              )}

              {activeTask.booking_feedback?.[0] && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Customer feedback</p>
                  <div className="rounded-lg border-l-4 border-yellow-400 bg-yellow-50 p-3">
                    <p className="text-sm text-gray-700">
                      <span className="text-yellow-500">{'★'.repeat(activeTask.booking_feedback[0].rating)}{'☆'.repeat(5 - activeTask.booking_feedback[0].rating)}</span>
                      {activeTask.booking_feedback[0].comment && <span className="italic text-gray-600"> &ldquo;{activeTask.booking_feedback[0].comment}&rdquo;</span>}
                    </p>
                    {activeTask.booking_feedback[0].image_url && (
                      <a href={activeTask.booking_feedback[0].image_url} target="_blank" rel="noreferrer">
                        <img src={activeTask.booking_feedback[0].image_url} alt="Customer feedback attachment" className="mt-2 h-16 w-16 rounded-lg object-cover border" />
                      </a>
                    )}
                  </div>
                </div>
              )}

              <div className="border-t border-gray-100 pt-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">Rate this job</p>
                <div className="flex items-center gap-1 mb-3" onMouseLeave={() => setHoverRating(0)}>
                  {[1, 2, 3, 4, 5].map(value => {
                    const filled = value <= (hoverRating || Number(activeDraft.rating) || 0)
                    return (
                      <button
                        key={value}
                        type="button"
                        onMouseEnter={() => setHoverRating(value)}
                        onClick={() => setReviewDrafts(prev => ({ ...prev, [activeTask.id]: { ...activeDraft, rating: String(value) } }))}
                        aria-label={`${value} star${value > 1 ? 's' : ''}`}
                        className="p-0.5"
                      >
                        <Star className={`h-7 w-7 transition ${filled ? 'text-amber-400 fill-amber-400' : 'text-gray-200 fill-gray-200'}`} />
                      </button>
                    )
                  })}
                  {activeDraft.rating && (
                    <button
                      type="button"
                      onClick={() => setReviewDrafts(prev => ({ ...prev, [activeTask.id]: { ...activeDraft, rating: '' } }))}
                      className="ml-2 text-xs text-gray-400 hover:text-gray-600"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <textarea
                  value={activeDraft.feedback}
                  onChange={event => setReviewDrafts(prev => ({ ...prev, [activeTask.id]: { ...activeDraft, feedback: event.target.value } }))}
                  placeholder="Optional feedback"
                  rows={2}
                  className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm mb-3"
                />
                <button
                  type="button"
                  onClick={() => saveReview(activeTask)}
                  disabled={savingReviewId === activeTask.id}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent-600 transition disabled:opacity-60"
                >
                  <Save className="h-4 w-4" /> {savingReviewId === activeTask.id ? 'Saving...' : 'Save review'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
