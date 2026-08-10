import { useEffect, useState } from 'react'
import { CheckCircle2, ExternalLink, EyeOff, Megaphone, Pencil, RefreshCw, Search, Sparkles, Star } from 'lucide-react'
import { supabase } from '../../../../lib/supabaseClient'
import { SERVICE_TYPES, loadServiceTypes } from '../../../../lib/serviceTypes'

export default function MarketingPanel() {
  const [businessName, setBusinessName] = useState('')
  const [description, setDescription] = useState('')
  const [paymentLinkUrl, setPaymentLinkUrl] = useState('')
  const [rates, setRates] = useState({})
  const [published, setPublished] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState('')
  const [instruction, setInstruction] = useState('')
  const [refining, setRefining] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [serviceTypes, setServiceTypes] = useState(SERVICE_TYPES)
  const [googlePlace, setGooglePlace] = useState(null)
  const [placeQuery, setPlaceQuery] = useState('')
  const [placeResults, setPlaceResults] = useState([])
  const [placeSearching, setPlaceSearching] = useState(false)
  const [placeError, setPlaceError] = useState('')
  const [placeLinking, setPlaceLinking] = useState(false)
  const [placeRefreshing, setPlaceRefreshing] = useState(false)

  const load = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const [{ data }, types] = await Promise.all([
      supabase
        .from('profiles')
        .select('business_name,marketing_description,service_rates,marketing_published,payment_link_url,google_place_id,google_place_name,google_rating,google_rating_count,google_rating_synced_at')
        .eq('id', user?.id)
        .single(),
      loadServiceTypes(supabase, user?.id),
    ])

    setBusinessName(data?.business_name || '')
    setDescription(data?.marketing_description || '')
    setPaymentLinkUrl(data?.payment_link_url || '')
    setRates(data?.service_rates || {})
    setPublished(data?.marketing_published || false)
    setServiceTypes(types)
    setGooglePlace(data?.google_place_id ? {
      placeId: data.google_place_id,
      name: data.google_place_name,
      rating: data.google_rating,
      userRatingCount: data.google_rating_count,
      syncedAt: data.google_rating_synced_at,
    } : null)
    // First-time setup (nothing saved yet) starts unlocked; anything already saved starts read-only.
    setEditMode(!data?.marketing_description && !data?.marketing_published)
    setLoading(false)
  }

  const handleSearchGooglePlace = async () => {
    setPlaceError('')
    setPlaceResults([])
    if (!placeQuery.trim()) {
      setPlaceError('Type your business name (and city) first.')
      return
    }
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) {
      setPlaceError('Your session has expired. Please log in again.')
      return
    }
    setPlaceSearching(true)
    let response, result
    try {
      response = await fetch('/api/places/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ query: placeQuery.trim() }),
      })
      result = await response.json()
    } catch {
      setPlaceSearching(false)
      setPlaceError('Could not reach the server. Check your connection and try again.')
      return
    }
    setPlaceSearching(false)
    if (!response.ok) {
      setPlaceError(result.error || 'Could not search Google Places.')
      return
    }
    setPlaceResults(result.results || [])
    if (!result.results?.length) setPlaceError('No matching Google listing found. Try a more specific search.')
  }

  const handleLinkGooglePlace = async (placeId) => {
    setPlaceError('')
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) {
      setPlaceError('Your session has expired. Please log in again.')
      return
    }
    setPlaceLinking(true)
    let response, result
    try {
      response = await fetch('/api/places/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ placeId }),
      })
      result = await response.json()
    } catch {
      setPlaceLinking(false)
      setPlaceError('Could not reach the server. Check your connection and try again.')
      return
    }
    setPlaceLinking(false)
    if (!response.ok) {
      setPlaceError(result.error || 'Could not link that listing.')
      return
    }
    setGooglePlace({ placeId: result.placeId, name: result.name, rating: result.rating, userRatingCount: result.userRatingCount, syncedAt: new Date().toISOString() })
    setPlaceResults([])
    setPlaceQuery('')
  }

  const handleRefreshGoogleRating = async () => {
    setPlaceError('')
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) {
      setPlaceError('Your session has expired. Please log in again.')
      return
    }
    setPlaceRefreshing(true)
    let response, result
    try {
      response = await fetch('/api/places/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({}),
      })
      result = await response.json()
    } catch {
      setPlaceRefreshing(false)
      setPlaceError('Could not reach the server. Check your connection and try again.')
      return
    }
    setPlaceRefreshing(false)
    if (!response.ok) {
      setPlaceError(result.error || 'Could not refresh the rating.')
      return
    }
    setGooglePlace(prev => ({ ...prev, rating: result.rating, userRatingCount: result.userRatingCount, syncedAt: new Date().toISOString() }))
  }

  useEffect(() => {
    load()
  }, [])

  const handleSave = async () => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    const cleanedRates = Object.fromEntries(
      Object.entries(rates).filter(([, value]) => value !== '' && value !== null && Number(value) > 0)
    )
    const { error } = await supabase
      .from('profiles')
      .update({ marketing_description: description, service_rates: cleanedRates, marketing_published: published, payment_link_url: paymentLinkUrl.trim() || null })
      .eq('id', user?.id)
    setSaving(false)
    setMessage(error ? error.message : 'Marketing page saved.')
    if (!error) {
      setRates(cleanedRates)
      setEditMode(false)
    }
  }

  const handleCancel = async () => {
    setMessage('')
    setGenerateError('')
    setInstruction('')
    setLoading(true)
    await load()
  }

  const handleGenerateDescription = async () => {
    setGenerateError('')
    if (!businessName) {
      setGenerateError('Business name is missing — cannot generate a description.')
      return
    }

    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) {
      setGenerateError('Your session has expired. Please log in again.')
      return
    }

    setGenerating(true)
    let response
    let result
    try {
      response = await fetch('/api/agent/generate-marketing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ businessName, serviceRates: rates }),
      })
      result = await response.json()
    } catch {
      setGenerating(false)
      setGenerateError('Could not reach the server. Check your connection and try again.')
      return
    }
    setGenerating(false)

    if (!response.ok) {
      setGenerateError(result.error || 'Could not generate a description.')
      return
    }

    setDescription(result.description)
  }

  const handleRefineDescription = async () => {
    setGenerateError('')
    if (!instruction.trim()) {
      setGenerateError('Type what you\'d like to change first.')
      return
    }

    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) {
      setGenerateError('Your session has expired. Please log in again.')
      return
    }

    setRefining(true)
    let response
    let result
    try {
      response = await fetch('/api/agent/generate-marketing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ businessName, serviceRates: rates, currentDescription: description, instruction: instruction.trim() }),
      })
      result = await response.json()
    } catch {
      setRefining(false)
      setGenerateError('Could not reach the server. Check your connection and try again.')
      return
    }
    setRefining(false)

    if (!response.ok) {
      setGenerateError(result.error || 'Could not apply that change.')
      return
    }

    setDescription(result.description)
    setInstruction('')
  }

  if (loading) return <div className="max-w-5xl mx-auto rounded-xl border border-gray-100 bg-white p-6 shadow-sm text-sm text-gray-400">Loading...</div>

  return (
    <div className="max-w-5xl mx-auto">
      <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent-100 text-accent-600">
              <Megaphone className="h-6 w-6" />
            </span>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Marketing Page</h1>
              <p className="mt-1 text-sm text-gray-500">Describe your business and set service rates for the public marketplace. Only published companies appear there.</p>
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            {!editMode && (
              <button
                type="button"
                onClick={() => { setEditMode(true); setMessage('') }}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                <Pencil className="h-4 w-4" /> Edit
              </button>
            )}
            <a href="/marketplace" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              <ExternalLink className="h-4 w-4" /> View public page
            </a>
          </div>
        </div>

        {message && <div className="mb-4 rounded-lg border border-accent-200 bg-accent-100 px-4 py-3 text-sm text-accent-800">{message}</div>}

        <p className="mb-3 text-sm font-bold text-gray-900">Business Information</p>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700">Business Name</label>
            <input value={businessName} disabled className="mt-2 w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-500" />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700">Description</label>
              <button
                type="button"
                onClick={handleGenerateDescription}
                disabled={generating || !editMode}
                className="flex items-center gap-1.5 rounded-full bg-purple-50 px-3 py-1.5 text-xs font-semibold text-purple-600 hover:bg-purple-100 disabled:opacity-60"
              >
                <Sparkles className="h-3.5 w-3.5" /> {generating ? 'Generating...' : 'Generate with AI'}
              </button>
            </div>
            {generateError && <p className="mt-1 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-600">{generateError}</p>}
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              disabled={!editMode}
              rows={4}
              placeholder="Tell customers what your business does and what makes it stand out."
              className="mt-2 w-full rounded-lg border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500 disabled:bg-gray-50 disabled:text-gray-500"
            />
            <p className="mt-1 text-xs text-gray-400">Set your services and rates below first for a more tailored description, or generate now and edit afterward.</p>

            {description && editMode && (
              <div className="mt-2 flex gap-2">
                <input
                  value={instruction}
                  onChange={e => setInstruction(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleRefineDescription() } }}
                  placeholder={'Don\'t like it? Tell the AI what to change, e.g. "make it shorter" or "mention we\'re eco-friendly"'}
                  className="flex-1 rounded-lg border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
                />
                <button
                  type="button"
                  onClick={handleRefineDescription}
                  disabled={refining}
                  className="flex shrink-0 items-center gap-1.5 rounded-lg bg-purple-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-60"
                >
                  <Sparkles className="h-4 w-4" /> {refining ? 'Applying...' : 'Apply change'}
                </button>
              </div>
            )}
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Payment Link</label>
            <input
              type="url"
              value={paymentLinkUrl}
              onChange={e => setPaymentLinkUrl(e.target.value)}
              disabled={!editMode}
              placeholder="https://your-paynow-or-bank-payment-page.example.com"
              className="mt-2 w-full rounded-lg border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500 disabled:bg-gray-50 disabled:text-gray-500"
            />
            <p className="mt-1 text-xs text-gray-400">
              Where customers pay you directly (PayNow, bank transfer page, etc.) — shown as a &quot;Pay now&quot; link on their bookings. This app doesn&apos;t process payments itself; mark bookings as paid from Bookings once you&apos;ve received payment.
            </p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Google Business Rating</label>
            <p className="mt-1 text-xs text-gray-400">
              Link your real Google Business Profile listing so customers see your actual Google rating (instead of just in-app reviews) when they&apos;re choosing a company on the booking page.
            </p>

            {placeError && <p className="mt-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-600">{placeError}</p>}

            {googlePlace ? (
              <div className="mt-2 flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                <div className="flex items-center gap-2">
                  <Star className="h-4 w-4 shrink-0 fill-amber-400 text-amber-400" />
                  <div>
                    <p className="text-sm font-semibold text-gray-800">
                      {typeof googlePlace.rating === 'number' ? `${googlePlace.rating.toFixed(1)}★` : 'Not rated yet'}
                      {googlePlace.userRatingCount ? ` (${googlePlace.userRatingCount} reviews)` : ''}
                    </p>
                    <p className="text-xs text-gray-500">{googlePlace.name || 'Linked Google listing'}{googlePlace.syncedAt ? ` — synced ${new Date(googlePlace.syncedAt).toLocaleDateString()}` : ''}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleRefreshGoogleRating}
                  disabled={placeRefreshing}
                  className="flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-white disabled:opacity-60"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${placeRefreshing ? 'animate-spin' : ''}`} /> {placeRefreshing ? 'Refreshing...' : 'Refresh now'}
                </button>
              </div>
            ) : (
              <div className="mt-2 flex gap-2">
                <input
                  value={placeQuery}
                  onChange={e => setPlaceQuery(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSearchGooglePlace() } }}
                  placeholder="Search your business name + city, e.g. &quot;Cleaning Pte Ltd Singapore&quot;"
                  className="flex-1 rounded-lg border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
                />
                <button
                  type="button"
                  onClick={handleSearchGooglePlace}
                  disabled={placeSearching}
                  className="flex shrink-0 items-center gap-1.5 rounded-lg bg-gray-800 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-900 disabled:opacity-60"
                >
                  <Search className="h-4 w-4" /> {placeSearching ? 'Searching...' : 'Search'}
                </button>
              </div>
            )}

            {placeResults.length > 0 && (
              <div className="mt-2 divide-y divide-gray-100 rounded-lg border border-gray-200">
                {placeResults.map(place => (
                  <div key={place.placeId} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <div>
                      <p className="text-sm font-medium text-gray-800">{place.name}</p>
                      <p className="text-xs text-gray-500">{place.address}{typeof place.rating === 'number' ? ` — ${place.rating.toFixed(1)}★ (${place.userRatingCount})` : ' — not rated yet'}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleLinkGooglePlace(place.placeId)}
                      disabled={placeLinking}
                      className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-600 disabled:opacity-60"
                    >
                      {placeLinking ? 'Linking...' : 'This is my business'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <hr className="my-6 border-gray-100" />

        <p className="text-sm font-bold text-gray-900">Services &amp; Rates</p>
        <p className="mb-3 text-xs text-gray-400">Leave a service blank if you don&apos;t offer it.</p>
        <div className="divide-y divide-gray-100 rounded-lg border border-gray-100">
          {serviceTypes.map(type => (
            <div key={type} className="flex items-center justify-between gap-4 px-4 py-3">
              <span className="text-sm text-gray-700">{type}</span>
              <div className="flex items-center gap-1.5">
                <span className="text-sm text-gray-400">$</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={rates[type] ?? ''}
                  onChange={e => setRates(prev => ({ ...prev, [type]: e.target.value }))}
                  disabled={!editMode}
                  placeholder="Not offered"
                  className="w-36 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500 disabled:bg-gray-50 disabled:text-gray-400"
                />
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => editMode && setPublished(v => !v)}
          disabled={!editMode}
          className={`mt-6 flex w-full items-start gap-3 rounded-lg border px-4 py-4 text-left transition ${
            published ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-gray-50'
          } ${editMode ? 'cursor-pointer hover:opacity-90' : 'cursor-default'}`}
        >
          <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded ${published ? 'bg-green-600 text-white' : 'border-2 border-gray-300 bg-white text-transparent'}`}>
            <CheckCircle2 className="h-4 w-4" />
          </span>
          <span>
            <span className={`flex items-center gap-1.5 text-sm font-semibold ${published ? 'text-green-800' : 'text-gray-700'}`}>
              {published ? 'Published (visible on the public marketplace)' : <><EyeOff className="h-3.5 w-3.5" /> Not published</>}
            </span>
            <span className="mt-0.5 block text-xs text-gray-500">
              {published ? 'Unpublish to hide your company from the public marketplace.' : 'Publish to make your company visible on the public marketplace.'}
            </span>
          </span>
        </button>

        {editMode && (
          <div className="mt-6 flex gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-600 disabled:opacity-60"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              disabled={saving}
              className="rounded-lg border border-gray-200 px-5 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
