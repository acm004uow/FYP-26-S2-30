import { useEffect, useState } from 'react'
import { Loader2, Search, Sparkles } from 'lucide-react'
import { supabase } from '../../../../lib/supabaseClient'
import { loadServiceCategoryCards } from '../../../../lib/serviceTypes'
import { findRequestedStaffByName } from '../../../../lib/recommendationEngine'

const QUICK_FILL_EXAMPLES = [
  'Home cleaning, 2 hours, this Saturday morning',
  'Deep clean my office before a client visit next week',
  'Move-out cleaning for a 3-room flat, need it done by Friday',
  'Weekly carpet cleaning for my apartment',
]

// Step 1 of the booking wizard: a free-text box the customer describes their need in, plus a grid
// of real service categories they can pick directly instead. Either path calls onProceed with the
// same shape so Step 2 doesn't care which one was used.
export default function Step1Need({ description, setDescription, onProceed }) {
  const [cards, setCards] = useState([])
  const [cardsLoading, setCardsLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    (async () => {
      try {
        setCards(await loadServiceCategoryCards(supabase))
      } catch (err) {
        console.error('Failed to load service categories:', err)
      } finally {
        setCardsLoading(false)
      }
    })()
  }, [])

  // Cross-company staff lookup happens locally against the real roster (never sent to the LLM) —
  // same matching function the recommendation engine already uses to honor a name request.
  async function resolveRequestedStaff(text) {
    if (!text.trim()) return null
    const { data } = await supabase
      .from('staff_profiles')
      .select('id,staff_name,host_admin_id')
      .eq('is_suspended', false)
      .eq('status', 'active')
    return findRequestedStaffByName(text, data || [])
  }

  const handleFindMatches = async () => {
    if (!description.trim() || submitting) return
    setSubmitting(true)
    setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const [response, requestedStaff] = await Promise.all([
        fetch('/api/customer/parse-need', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
          body: JSON.stringify({ text: description }),
        }),
        resolveRequestedStaff(description),
      ])
      const parsed = await response.json()
      if (!response.ok) throw new Error(parsed.error || 'Could not understand that description.')

      onProceed({
        serviceType: parsed.serviceType,
        priority: parsed.priority,
        scheduledDate: parsed.scheduledDate,
        scheduledTime: parsed.scheduledTime,
        estimatedHours: parsed.estimatedHours,
        description: parsed.description,
        requestedStaff,
      })
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleCardClick = async (card) => {
    if (submitting) return
    setSubmitting(true)
    setError('')
    try {
      const requestedStaff = await resolveRequestedStaff(description)
      onProceed({
        serviceType: card.name,
        priority: 'normal',
        scheduledDate: '',
        scheduledTime: '',
        estimatedHours: card.durationHours,
        description: description.trim() || `${card.name} service`,
        requestedStaff,
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
        <h3 className="font-semibold text-gray-800 mb-1">Tell us what you need</h3>
        <p className="text-sm text-gray-500 mb-4">
          Describe it in your own words. The system reads your description and works out the service, the cleaner and the timing - you confirm before anything is booked.
        </p>
        <textarea
          rows={6}
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="e.g. home cleaning, deep cleaning, carpet shampoo, window cleaning, etc. Include any special requests or preferences."
          className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-accent-500 text-sm bg-gray-50 resize-none"
        />

        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

        <button
          type="button"
          onClick={handleFindMatches}
          disabled={!description.trim() || submitting}
          className="mt-4 w-full flex items-center justify-center gap-2 rounded-xl bg-[#003152] px-5 py-3 text-sm font-semibold text-white transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          {submitting ? 'Finding matches...' : 'Find matching companies'}
        </button>

        <div className="mt-5">
          <p className="text-xs font-medium text-gray-400 mb-2">Try one of these</p>
          <div className="flex flex-wrap gap-2">
            {QUICK_FILL_EXAMPLES.map(example => (
              <button
                key={example}
                type="button"
                onClick={() => setDescription(example)}
                className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 transition"
              >
                {example}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
        <h3 className="font-semibold text-gray-800 mb-4">Or choose a service directly</h3>
        {cardsLoading ? (
          <p className="text-sm text-gray-400">Loading services...</p>
        ) : cards.length === 0 ? (
          <p className="text-sm text-gray-400">No service categories are set up yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {cards.map(card => (
              <button
                key={card.id}
                type="button"
                disabled={submitting}
                onClick={() => handleCardClick(card)}
                className="text-left rounded-xl border border-gray-200 p-4 hover:border-accent-300 hover:bg-accent-50 transition disabled:opacity-50"
              >
                <p className="font-semibold text-gray-800 text-sm flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-accent-500 shrink-0" /> {card.name}
                </p>
                {card.description && <p className="mt-1 text-xs text-gray-500 line-clamp-2">{card.description}</p>}
                <p className="mt-2 text-xs text-gray-400">
                  {card.durationHours}h{card.fromPrice != null ? ` · from $${card.fromPrice.toFixed(0)}` : ''}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
