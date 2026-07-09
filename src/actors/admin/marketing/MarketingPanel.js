import { useEffect, useState } from 'react'
import { ExternalLink, Megaphone, Pencil, Sparkles } from 'lucide-react'
import { supabase } from '../../../../lib/supabaseClient'
import { SERVICE_TYPES } from '../../../../lib/serviceTypes'

export default function MarketingPanel() {
  const [businessName, setBusinessName] = useState('')
  const [description, setDescription] = useState('')
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

  const load = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data } = await supabase
      .from('profiles')
      .select('business_name,marketing_description,service_rates,marketing_published')
      .eq('id', user?.id)
      .single()

    setBusinessName(data?.business_name || '')
    setDescription(data?.marketing_description || '')
    setRates(data?.service_rates || {})
    setPublished(data?.marketing_published || false)
    // First-time setup (nothing saved yet) starts unlocked; anything already saved starts read-only.
    setEditMode(!data?.marketing_description && !data?.marketing_published)
    setLoading(false)
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
      .update({ marketing_description: description, service_rates: cleanedRates, marketing_published: published })
      .eq('id', user?.id)
    setSaving(false)
    setMessage(error ? error.message : 'Marketing page saved.')
    if (!error) {
      setRates(cleanedRates)
      setEditMode(false)
    }
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

  if (loading) return <div className="bg-white rounded-xl shadow-sm border p-6 text-sm text-gray-400">Loading...</div>

  return (
    <div className="bg-white rounded-xl shadow-sm border p-6">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2"><Megaphone className="w-5 h-5 text-blue-500" /> Marketing Page</h2>
          <p className="mt-1 text-xs text-gray-500">Describe your business and set service rates for the public marketplace. Only published companies appear there.</p>
        </div>
        <div className="flex shrink-0 gap-2">
          {!editMode && (
            <button
              type="button"
              onClick={() => { setEditMode(true); setMessage('') }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              <Pencil className="w-3.5 h-3.5" /> Edit
            </button>
          )}
          <a href="/marketplace" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50">
            View public page <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      {!editMode}

      <div className="space-y-4 max-w-xl">
        <div>
          <label className="text-sm font-medium text-gray-700">Business Name</label>
          <input value={businessName} disabled className="mt-1 w-full rounded-lg border bg-gray-50 p-2 text-sm text-gray-500" />
        </div>
        <div>
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-gray-700">Description</label>
            <button
              type="button"
              onClick={handleGenerateDescription}
              disabled={generating || !editMode}
              className="flex items-center gap-1 rounded-full bg-purple-50 px-2.5 py-1 text-xs font-medium text-purple-600 hover:bg-purple-100 disabled:opacity-60"
            >
              <Sparkles className="w-3 h-3" /> {generating ? 'Generating...' : 'Generate with AI'}
            </button>
          </div>
          {generateError && <p className="mt-1 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-600">{generateError}</p>}
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            disabled={!editMode}
            rows={4}
            placeholder="Tell customers what your business does and what makes it stand out."
            className="mt-1 w-full rounded-lg border p-2 text-sm disabled:bg-gray-50 disabled:text-gray-500"
          />
          <p className="mt-1 text-xs text-gray-400">Set your services and rates below first for a more tailored description, or generate now and edit afterward.</p>

          {description && editMode && (
            <div className="mt-2 flex gap-2">
              <input
                value={instruction}
                onChange={e => setInstruction(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleRefineDescription() } }}
                placeholder={'Don\'t like it? Tell the AI what to change, e.g. "make it shorter" or "mention we\'re eco-friendly"'}
                className="flex-1 rounded-lg border p-2 text-sm"
              />
              <button
                type="button"
                onClick={handleRefineDescription}
                disabled={refining}
                className="flex shrink-0 items-center gap-1 rounded-lg bg-purple-600 px-3 py-2 text-xs font-medium text-white hover:bg-purple-700 disabled:opacity-60"
              >
                <Sparkles className="w-3.5 h-3.5" /> {refining ? 'Applying...' : 'Apply change'}
              </button>
            </div>
          )}
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700">Services &amp; Rates</label>
          <p className="text-xs text-gray-400 mb-2">Leave a service blank if you don&apos;t offer it.</p>
          <div className="space-y-2">
            {SERVICE_TYPES.map(type => (
              <div key={type} className="flex items-center gap-3">
                <span className="w-40 shrink-0 text-sm text-gray-700">{type}</span>
                <div className="flex items-center gap-1">
                  <span className="text-sm text-gray-400">$</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={rates[type] ?? ''}
                    onChange={e => setRates(prev => ({ ...prev, [type]: e.target.value }))}
                    disabled={!editMode}
                    placeholder="Not offered"
                    className="w-32 rounded-lg border p-2 text-sm disabled:bg-gray-50 disabled:text-gray-500"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <input type="checkbox" checked={published} onChange={e => setPublished(e.target.checked)} disabled={!editMode} />
          Published (visible on the public marketplace)
        </label>
        {editMode && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-gradient-to-r from-blue-500 to-green-500 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-60"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        )}
        {message && <p className="text-sm text-blue-600">{message}</p>}
      </div>
    </div>
  )
}
