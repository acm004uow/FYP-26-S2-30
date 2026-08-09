import { useEffect, useState } from 'react'
import { Calendar, Clock, Save } from 'lucide-react'
import { supabase } from '../../../../lib/supabaseClient'
import TimeInput from '../../../components/TimeInput'
import { fetchSchedulingSettingsClient, saveSchedulingSettings } from '../../../../lib/scheduleSettings'
import { DEFAULT_CUTOFF } from '../../../../lib/businessWeek'

const DAY_OPTIONS = [
  { value: 0, label: 'Sunday' }, { value: 1, label: 'Monday' }, { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' }, { value: 4, label: 'Thursday' }, { value: 5, label: 'Friday' }, { value: 6, label: 'Saturday' },
]

function formatTimeDisplay(value) {
  if (!value) return '--'
  const [h, m] = value.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const hour12 = h % 12 || 12
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`
}

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

  const dayLabel = DAY_OPTIONS.find(d => d.value === Number(dayOfWeek))?.label || 'Sunday'

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <div className="flex items-start gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent-100 text-accent-600">
          <Clock className="h-6 w-6" />
        </span>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold text-gray-900">Booking Cutoff</h2>
            <span className="rounded-full bg-accent-100 px-2.5 py-0.5 text-xs font-semibold text-accent-700">Weekly</span>
          </div>
          <p className="mt-1 text-sm text-gray-500">Set when bookings for the upcoming week close.</p>
          <p className="text-sm text-gray-500">After the cutoff, AI automatically prepares the next schedule for manager review.</p>
        </div>
      </div>

      {message && <div className="mt-4 rounded-lg border border-accent-200 bg-accent-100 px-4 py-3 text-sm text-accent-800">{message}</div>}

      <form onSubmit={handleSave} className="mt-5 border-t border-gray-100 pt-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Day of Week</label>
            <div className="relative">
              <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <select
                value={dayOfWeek}
                onChange={e => setDayOfWeek(e.target.value)}
                className="w-full appearance-none rounded-lg border border-gray-200 py-2.5 pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
              >
                {DAY_OPTIONS.map(day => <option key={day.value} value={day.value}>{day.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Time</label>
            <TimeInput required value={time} onChange={setTime} />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Current Cutoff</label>
            <div className="flex h-[42px] items-center gap-2 rounded-lg border border-accent-200 bg-accent-100 px-3 text-sm font-semibold text-accent-700">
              <Calendar className="h-4 w-4 shrink-0" />
              <span className="truncate">Every {dayLabel} at {formatTimeDisplay(time)}</span>
            </div>
          </div>
        </div>

        <div className="mt-5 flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-600 disabled:opacity-60"
          >
            <Save className="h-4 w-4" /> {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  )
}
