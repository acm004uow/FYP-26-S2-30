import Layout from '../../../components/Layout'
import { useEffect, useState } from 'react'
import { ExternalLink, Save } from 'lucide-react'
import { supabase } from '../../../../lib/supabaseClient'

export default function ManagerCompletedTasks() {
  const [completedTasks, setCompletedTasks] = useState([])
  const [showAllCompletedTasks, setShowAllCompletedTasks] = useState(false)
  const [reviewDrafts, setReviewDrafts] = useState({})
  const [reviewMessage, setReviewMessage] = useState('')
  const [savingReviewId, setSavingReviewId] = useState(null)

  const loadCompletedTasks = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: managerProfile } = await supabase
      .from('profiles')
      .select('host_admin_id')
      .eq('id', user?.id)
      .single()

    const { data: tasks, error } = await supabase
      .from('bookings')
      .select('id,service_type,location,updated_at,assigned_staff_id,staff_profiles(staff_name),task_proofs(file_url,file_name,created_at),performance_reviews(id,rating,feedback,manager_id),booking_feedback(rating,comment,image_url)')
      .eq('host_admin_id', managerProfile?.host_admin_id)
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

  const visibleCompletedTasks = showAllCompletedTasks ? completedTasks : completedTasks.slice(0, 3)

  return (
    <Layout role="manager">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold">Completed Tasks</h1>
        <p className="text-gray-500 text-sm mb-6">View uploaded proof, then optionally rate and leave feedback.</p>

        <div className="bg-white rounded-xl shadow-sm border p-6">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Completed Task Reviews</h2>
              <p className="text-sm text-gray-500 mt-1">View uploaded proof, then optionally rate and leave feedback.</p>
            </div>
            {completedTasks.length > 3 && (
              <button
                type="button"
                onClick={() => setShowAllCompletedTasks(value => !value)}
                className="inline-flex items-center justify-center rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-accent-600 hover:bg-accent-100"
              >
                {showAllCompletedTasks ? 'Show latest 3' : 'View all'}
              </button>
            )}
          </div>
          {reviewMessage && <div className="mb-4 rounded-lg border border-accent-200 bg-accent-100 px-4 py-3 text-sm text-accent-800">{reviewMessage}</div>}
          <div className="space-y-4">
            {completedTasks.length === 0 && <div className="rounded-lg border p-8 text-center text-gray-400">No completed tasks yet.</div>}
            {visibleCompletedTasks.map(task => {
              const proof = task.task_proofs?.[0]
              const customerFeedback = task.booking_feedback?.[0]
              const draft = reviewDrafts[task.id] || { rating: '', feedback: '' }
              return (
                <div key={task.id} className="rounded-xl border border-gray-100 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3 className="font-semibold text-gray-900">{task.service_type}</h3>
                      <p className="text-sm text-gray-500">{task.location} - Completed {task.updated_at ? new Date(task.updated_at).toLocaleString() : 'recently'}</p>
                      <p className="text-sm text-gray-500">Assigned staff: {task.staff_profiles?.staff_name || 'Unassigned'}</p>
                      {customerFeedback && (
                        <div className="mt-1">
                          <p className="text-sm text-gray-600">
                            Customer feedback: <span className="text-yellow-500">{'★'.repeat(customerFeedback.rating)}{'☆'.repeat(5 - customerFeedback.rating)}</span>
                            {customerFeedback.comment && <span className="italic text-gray-500"> &ldquo;{customerFeedback.comment}&rdquo;</span>}
                          </p>
                          {customerFeedback.image_url && (
                            <a href={customerFeedback.image_url} target="_blank" rel="noreferrer">
                              <img src={customerFeedback.image_url} alt="Customer feedback attachment" className="mt-1 h-16 w-16 rounded-lg object-cover border" />
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                    {proof?.file_url ? (
                      <a href={proof.file_url} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-accent-600 hover:bg-accent-100">
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
                      className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-600 transition disabled:opacity-60"
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
