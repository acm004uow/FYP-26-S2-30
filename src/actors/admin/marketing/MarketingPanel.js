import { useEffect, useMemo, useState } from 'react'
import {
  Building2, CheckCircle2, Droplets, ExternalLink, Eye, EyeOff, Home, Layers, Megaphone,
  MapPin, Pencil, ShieldCheck, Sparkles, Star, Truck,
} from 'lucide-react'
import { supabase } from '../../../../lib/supabaseClient'
import { SERVICE_TYPES, loadServiceTypes } from '../../../../lib/serviceTypes'

const SERVICE_ICONS = {
  'Home Cleaning': Home,
  'Office Cleaning': Building2,
  'Deep Cleaning': Droplets,
  'Move-Out Cleaning': Truck,
  'Carpet Cleaning': Layers,
}
const serviceIcon = (type) => SERVICE_ICONS[type] || Sparkles

// Mirrors src/pages/marketplace.js's CompanyCard styling exactly, so this preview is an honest
// representation of what customers will actually see, not just an approximation.
function PreviewCard({ businessName, description, ratedEntries }) {
  return (
    <div className="flex flex-col rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-100">
            <Building2 className="h-5 w-5 text-accent-600" />
          </span>
          <div className="min-w-0">
            <h3 className="truncate font-semibold text-gray-900">{businessName || 'Your business name'}</h3>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-500">
              <span className="inline-flex items-center gap-1">
                <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" /> New
              </span>
              <span aria-hidden="true">&middot;</span>
              <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> Singapore</span>
            </div>
          </div>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-green-50 px-2 py-1 text-xs font-semibold text-green-700">
          <ShieldCheck className="h-3.5 w-3.5" /> Verified
        </span>
      </div>

      <p className="text-sm leading-6 text-gray-600">
        {description || <span className="italic text-gray-300">Your description will appear here.</span>}
      </p>

      {ratedEntries.length > 0 && (
        <div className="mt-4 space-y-1.5 border-t border-gray-100 pt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Popular Services</p>
          {ratedEntries.slice(0, 4).map(([type, price]) => (
            <div key={type} className="flex items-center justify-between text-sm">
              <span className="text-gray-500">{type}</span>
              <span className="font-semibold text-gray-900">${Number(price).toFixed(2)}/hr</span>
            </div>
          ))}
        </div>
      )}

      <span className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-accent-600 to-green-500 px-4 py-2.5 text-sm font-semibold text-white opacity-80">
        Book a slot
      </span>
    </div>
  )
}

function ChecklistItem({ done, children }) {
  return (
    <li className="flex items-start gap-2.5 text-sm">
      <span className={`mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full ${done ? 'bg-green-100 text-green-600' : 'border-2 border-gray-200 text-transparent'}`}>
        <CheckCircle2 className="h-3.5 w-3.5" />
      </span>
      <span className={done ? 'text-gray-500 line-through' : 'text-gray-700'}>{children}</span>
    </li>
  )
}

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
  const [serviceTypes, setServiceTypes] = useState(SERVICE_TYPES)

  const load = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const [{ data }, types] = await Promise.all([
      supabase
        .from('profiles')
        .select('business_name,marketing_description,service_rates,marketing_published')
        .eq('id', user?.id)
        .single(),
      loadServiceTypes(supabase, user?.id),
    ])

    setBusinessName(data?.business_name || '')
    setDescription(data?.marketing_description || '')
    setRates(data?.service_rates || {})
    setPublished(data?.marketing_published || false)
    setServiceTypes(types)
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

  const ratedEntries = useMemo(
    () => serviceTypes
      .map(type => [type, rates[type]])
      .filter(([, price]) => price !== undefined && price !== null && price !== '' && Number(price) > 0),
    [serviceTypes, rates]
  )
  const pricedCount = ratedEntries.length
  const hasDescription = description.trim().length > 0
  const readyToPublish = pricedCount > 0 && hasDescription

  if (loading) return <div className="max-w-6xl mx-auto rounded-xl border border-gray-100 bg-white p-6 shadow-sm text-sm text-gray-400">Loading...</div>

  return (
    <div className="max-w-6xl mx-auto">
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
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <Pencil className="h-4 w-4" /> Edit
            </button>
          )}
          <a href="/marketplace" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            <ExternalLink className="h-4 w-4" /> View public page
          </a>
        </div>
      </div>

      <div className={`mb-6 flex items-center gap-3 rounded-xl border px-4 py-3 ${published ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'}`}>
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${published ? 'bg-green-100 text-green-600' : 'bg-amber-100 text-amber-600'}`}>
          {published ? <CheckCircle2 className="h-[18px] w-[18px]" /> : <EyeOff className="h-[18px] w-[18px]" />}
        </span>
        <div className="min-w-0">
          <p className={`text-sm font-semibold ${published ? 'text-green-800' : 'text-amber-800'}`}>
            {published ? 'Live on the public marketplace' : 'Not published yet'}
          </p>
          <p className={`text-xs ${published ? 'text-green-700' : 'text-amber-700'}`}>
            {published
              ? 'Customers can find and book your company right now.'
              : readyToPublish
                ? "You're ready to publish — toggle it on below and save."
                : 'Add at least one priced service and a description, then publish.'}
          </p>
        </div>
      </div>

      {message && <div className="mb-6 rounded-lg border border-accent-200 bg-accent-100 px-4 py-3 text-sm text-accent-800">{message}</div>}

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm sm:p-8">
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
                <div className="mt-1 flex items-center justify-between text-xs text-gray-400">
                  <span>Set your services and rates below first for a more tailored description, or generate now and edit afterward.</span>
                  <span className="shrink-0 pl-2 tabular-nums">{description.length} chars</span>
                </div>

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
            </div>
          </div>

          <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm sm:p-8">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-bold text-gray-900">Services &amp; Rates</p>
              <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-500">
                {pricedCount} of {serviceTypes.length} priced
              </span>
            </div>
            <p className="mb-3 text-xs text-gray-400">Rates are per hour — customers are charged rate &times; estimated hours. Leave a service blank if you don&apos;t offer it.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {serviceTypes.map(type => {
                const Icon = serviceIcon(type)
                const isPriced = rates[type] !== undefined && rates[type] !== null && rates[type] !== '' && Number(rates[type]) > 0
                return (
                  <div
                    key={type}
                    className={`flex items-center gap-3 rounded-lg border px-3 py-3 ${isPriced ? 'border-accent-200 bg-accent-100/40' : 'border-gray-200'}`}
                  >
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${isPriced ? 'bg-accent-100 text-accent-600' : 'bg-gray-100 text-gray-400'}`}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-gray-700">{type}</p>
                      <div className="mt-1 flex items-center gap-1.5">
                        <span className="text-sm text-gray-400">$</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={rates[type] ?? ''}
                          onChange={e => setRates(prev => ({ ...prev, [type]: e.target.value }))}
                          disabled={!editMode}
                          placeholder="Not offered"
                          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500 disabled:bg-gray-50 disabled:text-gray-400"
                        />
                        <span className="shrink-0 text-xs text-gray-400">/hr</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <button
            type="button"
            onClick={() => editMode && setPublished(v => !v)}
            disabled={!editMode}
            className={`flex w-full items-start gap-3 rounded-xl border px-4 py-4 text-left transition ${
              published ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-white'
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
            <div className="flex gap-3">
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

        <div className="space-y-6 lg:col-span-2">
          <div className="lg:sticky lg:top-20 space-y-6">
            <div>
              <p className="mb-3 flex items-center gap-1.5 text-sm font-bold text-gray-900">
                <Eye className="h-4 w-4 text-gray-400" /> Live preview
              </p>
              <PreviewCard businessName={businessName} description={description} ratedEntries={ratedEntries} />
            </div>

            <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
              <p className="mb-3 text-sm font-bold text-gray-900">Ready to publish?</p>
              <ul className="space-y-2.5">
                <ChecklistItem done={Boolean(businessName)}>Business name set</ChecklistItem>
                <ChecklistItem done={pricedCount > 0}>At least one service priced</ChecklistItem>
                <ChecklistItem done={hasDescription}>Description written</ChecklistItem>
                <ChecklistItem done={published}>Published to the marketplace</ChecklistItem>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
