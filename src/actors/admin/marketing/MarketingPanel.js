import { useEffect, useState } from 'react'
import { ExternalLink, Megaphone } from 'lucide-react'
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
    if (!error) setRates(cleanedRates)
  }

  if (loading) return <div className="bg-white rounded-xl shadow-sm border p-6 text-sm text-gray-400">Loading...</div>

  return (
    <div className="bg-white rounded-xl shadow-sm border p-6">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2"><Megaphone className="w-5 h-5 text-blue-500" /> Marketing Page</h2>
          <p className="mt-1 text-xs text-gray-500">Describe your business and set service rates for the public marketplace. Only published companies appear there.</p>
        </div>
        <a href="/marketplace" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50">
          View public page <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>

      <div className="space-y-4 max-w-xl">
        <div>
          <label className="text-sm font-medium text-gray-700">Business Name</label>
          <input value={businessName} disabled className="mt-1 w-full rounded-lg border bg-gray-50 p-2 text-sm text-gray-500" />
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700">Description</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={4}
            placeholder="Tell customers what your business does and what makes it stand out."
            className="mt-1 w-full rounded-lg border p-2 text-sm"
          />
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
                    placeholder="Not offered"
                    className="w-32 rounded-lg border p-2 text-sm"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <input type="checkbox" checked={published} onChange={e => setPublished(e.target.checked)} />
          Published (visible on the public marketplace)
        </label>
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-gradient-to-r from-blue-500 to-green-500 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-60"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
        {message && <p className="text-sm text-blue-600">{message}</p>}
      </div>
    </div>
  )
}
