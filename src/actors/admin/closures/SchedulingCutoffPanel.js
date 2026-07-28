import { useEffect, useState } from 'react'
import { Clock } from 'lucide-react'
import { supabase } from '../../../../lib/supabaseClient'
import TimeInput from '../../../components/TimeInput'
import { fetchSchedulingSettingsClient, saveSchedulingSettings } from '../../../../lib/scheduleSettings'
import { DEFAULT_CUTOFF } from '../../../../lib/businessWeek'

const DAY_OPTIONS = [
  { value: 0, label: 'Sunday' }, { value: 1, label: 'Monday' }, { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' }, { value: 4, label: 'Thursday' }, { value: 5, label: 'Friday' }, { value: 6, label: 'Saturday' },
]

export default function SchedulingCutoffPanel() {
  const [hostAdminId, setHostAdminId] = useState(null)
  const [dayOfWeek, setDayOfWeek] = useState(DEFAULT_CUTOFF.cutoff_day_of_week)
  const [time, setTime] = useState(DEFAULT_CUTOFF.cutoff_time)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const resolveHostAdminId = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profile } = await supabase
      .from('profiles')
      .select('role,host_admin_id')
      .eq('id', user?.id)
      .single()

    return profile?.role === 'system_admin' ? user.id : profile?.host_admin_id || null
  }

  const load = async () => {
    const resolvedHostAdminId = await resolveHostAdminId()
    setHostAdminId(resolvedHostAdminId)
    if (!resolvedHostAdminId) return

    const settings = await fetchSchedulingSettingsClient(supabase, resolvedHostAdminId)
    setDayOfWeek(settings.cutoff_day_of_week)
    setTime(settings.cutoff_time)
  }

  useEffect(() => {
    load()
  }, [])

  const handleSave = async (event) => {
    event.preventDefault()
    if (!hostAdminId) {
      setMessage('Could not resolve your company.')
      return
    }

    setSaving(true)
    try {
      await saveSchedulingSettings(supabase, hostAdminId, { cutoff_day_of_week: Number(dayOfWeek), cutoff_time: time })
      const { data: { user } } = await supabase.auth.getUser()
      await supabase.from('audit_logs').insert({
        user_id: user?.id,
        action: 'update_scheduling_cutoff',
        details: `Weekly booking cutoff set to ${DAY_OPTIONS.find(d => d.value === Number(dayOfWeek))?.label} ${time}`,
      })
      setMessage('Booking cutoff saved.')
    } catch (error) {
      setMessage(error.message)
    }
    setSaving(false)
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8 rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
          <Clock className="h-5 w-5 text-accent" /> Weekly Booking Cutoff
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          Once this day and time passes each week, customers can no longer book into the closing week, and the AI automatically generates next week&apos;s schedule for your manager to approve.
        </p>
        {message && <div className="mt-4 rounded-lg border border-accent-200 bg-accent-100 px-4 py-3 text-sm text-accent-800">{message}</div>}
        <form onSubmit={handleSave} className="mt-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <label className="mb-2 block text-sm font-medium text-gray-700">Day of Week</label>
              <select value={dayOfWeek} onChange={e => setDayOfWeek(e.target.value)} className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500">
                {DAY_OPTIONS.map(day => <option key={day.value} value={day.value}>{day.label}</option>)}
              </select>
            </div>
            <div className="flex-1">
              <label className="mb-2 block text-sm font-medium text-gray-700">Time</label>
              <TimeInput required value={time} onChange={setTime} />
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <button type="submit" disabled={saving} className="rounded-lg bg-accent hover:bg-accent-600 px-5 py-3 text-sm font-semibold text-white transition disabled:opacity-60">
              {saving ? 'Saving...' : 'Save Cutoff'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
