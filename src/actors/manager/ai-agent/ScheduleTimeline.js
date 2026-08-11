import { useMemo, useState } from 'react'
import { Calendar, CheckCircle, ChevronLeft, ChevronRight, List as ListIcon, MapPin, User, XCircle } from 'lucide-react'
import { getWeekDates, shiftWeek, formatTime12h } from '../../../../lib/weekDates'

const ROW_HEIGHT = 56
const MIN_VISIBLE_HOURS = 4
const MIN_BLOCK_HEIGHT = 58

// Cycled by a hash of the booking's location so repeat visits to the same address always land on
// the same color, without needing a real per-customer color assignment anywhere in the data model.
const PALETTE = [
  { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-200', dot: 'bg-blue-500' },
  { bg: 'bg-purple-100', text: 'text-purple-800', border: 'border-purple-200', dot: 'bg-purple-500' },
  { bg: 'bg-emerald-100', text: 'text-emerald-800', border: 'border-emerald-200', dot: 'bg-emerald-500' },
  { bg: 'bg-amber-100', text: 'text-amber-800', border: 'border-amber-200', dot: 'bg-amber-500' },
  { bg: 'bg-pink-100', text: 'text-pink-800', border: 'border-pink-200', dot: 'bg-pink-500' },
  { bg: 'bg-cyan-100', text: 'text-cyan-800', border: 'border-cyan-200', dot: 'bg-cyan-500' },
]

function colorFor(key) {
  let hash = 0
  const str = String(key || '')
  for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) | 0
  return PALETTE[Math.abs(hash) % PALETTE.length]
}

function parseTimeMinutes(time) {
  if (!time) return null
  const [h, m] = String(time).split(':').map(Number)
  if (Number.isNaN(h)) return null
  return h * 60 + (m || 0)
}

function endTimeLabel(startMin, durationMin) {
  const totalMin = (startMin + durationMin) % 1440
  return formatTime12h(`${String(Math.floor(totalMin / 60)).padStart(2, '0')}:${String(totalMin % 60).padStart(2, '0')}`)
}

// Same recurring visit with staff_count > 1 produces several booking rows sharing the identical
// date/time (see lib/recurringBookings.js#generateWeeklyVisits) — group them into one visual
// block ("2 staff") instead of drawing overlapping blocks. One-off bookings (no recurring_booking_id)
// never merge with each other, even if they happen to share a date/time.
function groupProposal(proposal) {
  const groups = new Map()
  for (const row of proposal) {
    const key = row.recurring_booking_id
      ? `${row.recurring_booking_id}|${row.scheduled_date}|${row.scheduled_time}`
      : `single|${row.booking_id}`
    if (!groups.has(key)) {
      groups.set(key, {
        groupKey: key,
        service_type: row.service_type,
        location: row.location,
        scheduled_date: row.scheduled_date,
        scheduled_time: row.scheduled_time,
        estimated_hours: row.estimated_hours,
        recurring: !!row.recurring_booking_id,
        bookingIds: [],
        staffNames: [],
        statuses: [],
      })
    }
    const group = groups.get(key)
    group.bookingIds.push(row.booking_id)
    if (row.recommended_staff_name) group.staffNames.push(row.recommended_staff_name)
    group.statuses.push(row.uiStatus)
  }
  return [...groups.values()].sort((a, b) => `${a.scheduled_date}${a.scheduled_time || ''}`.localeCompare(`${b.scheduled_date}${b.scheduled_time || ''}`))
}

function computeHourRange(groups) {
  let minHour = null
  let maxHour = null
  for (const group of groups) {
    const startMin = parseTimeMinutes(group.scheduled_time)
    if (startMin == null) continue
    const durationMin = Math.max(30, Math.round((Number(group.estimated_hours) || 1) * 60))
    const endMin = Math.min(startMin + durationMin, 24 * 60)
    const startHour = Math.floor(startMin / 60)
    const endHour = Math.ceil(endMin / 60)
    if (minHour === null || startHour < minHour) minHour = startHour
    if (maxHour === null || endHour > maxHour) maxHour = endHour
  }
  if (minHour === null) return { startHour: 8, endHour: 18 }
  let startHour = Math.max(0, minHour - 1)
  let endHour = Math.min(24, maxHour + 1)
  if (endHour - startHour < MIN_VISIBLE_HOURS) endHour = Math.min(24, startHour + MIN_VISIBLE_HOURS)
  return { startHour, endHour }
}

function hourLabel(hour) {
  const period = hour >= 12 ? 'PM' : 'AM'
  const hour12 = hour % 12 || 12
  return `${hour12} ${period}`
}

function weekdayDateLabel(dateIso) {
  return new Date(`${dateIso}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
}

function TimelineBlock({ group, startHour, endHour, isSelected, onSelect }) {
  const palette = colorFor(group.location)
  const startMin = parseTimeMinutes(group.scheduled_time)
  const durationMin = Math.max(30, Math.round((Number(group.estimated_hours) || 1) * 60))
  const rangeStartMin = startHour * 60
  const rangeEndMin = endHour * 60
  const top = ((startMin - rangeStartMin) / 60) * ROW_HEIGHT
  // Capped to the visible grid rather than extended — a visit that wraps past midnight keeps its
  // full duration in the underlying data, this just avoids drawing outside the day's column.
  const maxHeight = ((rangeEndMin - startMin) / 60) * ROW_HEIGHT
  const height = Math.max(MIN_BLOCK_HEIGHT, Math.min((durationMin / 60) * ROW_HEIGHT, maxHeight))
  const endLabel = endTimeLabel(startMin, durationMin)
  const staffLabel = group.bookingIds.length > 1 ? `${group.bookingIds.length} staff` : (group.staffNames[0] || 'Unassigned')

  return (
    <button
      type="button"
      onClick={() => onSelect(group)}
      title={`${group.service_type} • ${group.location} • ${formatTime12h(group.scheduled_time)}–${endLabel} • ${staffLabel}`}
      style={{ top, height }}
      className={`absolute inset-x-1 overflow-hidden rounded-md border px-2 py-1.5 text-left text-[11px] leading-tight shadow-sm transition hover:shadow-md ${palette.bg} ${palette.text} ${palette.border} ${
        isSelected ? 'ring-2 ring-offset-1 ring-accent' : ''
      }`}
    >
      <p className="truncate opacity-70">{formatTime12h(group.scheduled_time)} – {endLabel}</p>
      <p className="truncate font-semibold">{group.service_type}</p>
      <p className="mt-0.5 flex items-center gap-1 truncate opacity-80"><User className="w-2.5 h-2.5 flex-shrink-0" />{staffLabel}</p>
      <p className="flex items-center gap-1 truncate opacity-80"><MapPin className="w-2.5 h-2.5 flex-shrink-0" />{group.location}</p>
    </button>
  )
}

function TimelineGrid({ weekDates, groupsByDate, countByDate, todayIso, selectedGroupKey, onSelectGroup }) {
  const allGroups = weekDates.flatMap(date => groupsByDate[date] || [])
  const { startHour, endHour } = useMemo(() => computeHourRange(allGroups), [allGroups])
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i)
  const gridHeight = hours.length * ROW_HEIGHT

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[720px]">
        <div className="grid grid-cols-[56px_repeat(7,1fr)] border-b border-gray-200">
          <div />
          {weekDates.map(date => (
            <div key={date} className={`border-l border-gray-200 px-2 py-2 text-center ${date === todayIso ? 'bg-accent-100/40' : ''}`}>
              <p className={`text-xs font-semibold uppercase tracking-wide ${date === todayIso ? 'text-accent-600' : 'text-gray-500'}`}>{weekdayDateLabel(date)}</p>
              <p className={`mt-0.5 text-[11px] ${date === todayIso ? 'text-accent-600 font-medium' : 'text-gray-400'}`}>{countByDate[date] || 0} booking{(countByDate[date] || 0) === 1 ? '' : 's'}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-[56px_repeat(7,1fr)]">
          <div style={{ height: gridHeight }}>
            {hours.map(hour => (
              <div key={hour} className="relative text-right text-[10px] text-gray-400" style={{ height: ROW_HEIGHT }}>
                <span className="absolute right-2 -top-2">{hourLabel(hour)}</span>
              </div>
            ))}
          </div>
          {weekDates.map(date => (
            <div key={date} className={`relative border-l border-gray-200 ${date === todayIso ? 'bg-accent-100/10' : ''}`} style={{ height: gridHeight }}>
              {hours.map((hour, i) => (
                <div key={hour} className="absolute inset-x-0 border-t border-gray-100" style={{ top: i * ROW_HEIGHT }} />
              ))}
              {(groupsByDate[date] || []).map(group => (
                <TimelineBlock
                  key={group.groupKey}
                  group={group}
                  startHour={startHour}
                  endHour={endHour}
                  isSelected={group.groupKey === selectedGroupKey}
                  onSelect={onSelectGroup}
                />
              ))}
              {(groupsByDate[date] || []).length === 0 && (
                <div className="absolute inset-x-2 top-2 flex h-9 items-center justify-center rounded-lg border border-dashed border-gray-200 text-gray-300">
                  <Calendar className="w-3.5 h-3.5" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function ListRows({ weekDates, groupsByDate, todayIso, selectedGroupKey, onSelectGroup }) {
  const nonEmptyDates = weekDates.filter(date => (groupsByDate[date] || []).length > 0)
  if (nonEmptyDates.length === 0) {
    return <p className="px-5 py-10 text-center text-sm text-gray-400">No bookings this week.</p>
  }
  return (
    <div className="divide-y divide-gray-100">
      {nonEmptyDates.map(date => (
        <div key={date} className="px-5 py-3">
          <p className={`text-xs font-semibold uppercase tracking-wide ${date === todayIso ? 'text-accent-600' : 'text-gray-400'}`}>
            {weekdayDateLabel(date)}{date === todayIso ? ' · Today' : ''}
          </p>
          <div className="mt-2 space-y-1.5">
            {groupsByDate[date].map(group => {
              const palette = colorFor(group.location)
              const durationMin = Math.max(30, Math.round((Number(group.estimated_hours) || 1) * 60))
              const startMin = parseTimeMinutes(group.scheduled_time)
              const endLabel = startMin == null ? '' : endTimeLabel(startMin, durationMin)
              const staffLabel = group.bookingIds.length > 1 ? `${group.bookingIds.length} staff` : (group.staffNames[0] || 'Unassigned')
              return (
                <button
                  key={group.groupKey}
                  type="button"
                  onClick={() => onSelectGroup(group)}
                  className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm transition hover:border-accent-300 ${
                    group.groupKey === selectedGroupKey ? 'border-accent ring-1 ring-accent' : 'border-gray-100'
                  }`}
                >
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${palette.dot}`} />
                  <span className="min-w-[92px] shrink-0 text-xs text-gray-500">
                    {group.scheduled_time ? `${formatTime12h(group.scheduled_time)}${endLabel ? `–${endLabel}` : ''}` : 'Unscheduled'}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium text-gray-900">{group.service_type}</span>
                  <span className="shrink-0 text-xs text-gray-400 truncate max-w-[160px]">{group.location}</span>
                  <span className="shrink-0 text-xs text-gray-500">{staffLabel}</span>
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

export default function ScheduleTimeline({ proposal, weekAnchor, onWeekAnchorChange, selectedGroupKey, onSelectGroup, pendingCount, onApproveAll, onRejectAll }) {
  const [view, setView] = useState('timeline')
  const todayIso = new Date().toISOString().slice(0, 10)

  const groups = useMemo(() => groupProposal(proposal), [proposal])
  const weekDates = useMemo(() => getWeekDates(weekAnchor), [weekAnchor])
  const groupsByDate = useMemo(() => {
    const byDate = {}
    for (const date of weekDates) byDate[date] = []
    for (const group of groups) {
      if (byDate[group.scheduled_date] && group.scheduled_time) byDate[group.scheduled_date].push(group)
    }
    return byDate
  }, [groups, weekDates])
  const unscheduled = useMemo(() => groups.filter(group => weekDates.includes(group.scheduled_date) && !group.scheduled_time), [groups, weekDates])
  const countByDate = useMemo(() => {
    const counts = {}
    for (const row of proposal) counts[row.scheduled_date] = (counts[row.scheduled_date] || 0) + 1
    return counts
  }, [proposal])
  // Only the customers actually visible in the current week — an unbounded legend listing every
  // customer ever proposed would be as unreadable as no legend at all.
  const legendEntries = useMemo(() => {
    const seen = new Map()
    for (const date of weekDates) {
      for (const group of groupsByDate[date] || []) {
        if (!seen.has(group.location)) seen.set(group.location, colorFor(group.location))
      }
    }
    return [...seen.entries()]
  }, [weekDates, groupsByDate])

  const weekBookingCount = weekDates.reduce((sum, date) => sum + (countByDate[date] || 0), 0)
  const weekLabel = `${weekdayDateLabel(weekDates[0])} – ${weekdayDateLabel(weekDates[6])}`

  return (
    <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b p-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-purple-600 text-white text-xs font-semibold flex-shrink-0">2</span>
            <h2 className="font-semibold text-gray-900">Proposed Schedule</h2>
          </div>
          <p className="text-xs text-gray-400 mt-1 ml-8">
            {proposal.length === 0 ? 'AI generated · Review and approve' : `${weekBookingCount} booking${weekBookingCount === 1 ? '' : 's'} this week (${weekLabel})${pendingCount != null ? ` · ${pendingCount} pending review` : ''}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-1">
            <button type="button" onClick={() => onWeekAnchorChange(shiftWeek(weekAnchor, -7))} aria-label="Previous week" className="flex h-7 w-7 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100"><ChevronLeft className="w-4 h-4" /></button>
            <button type="button" onClick={() => onWeekAnchorChange(todayIso)} className="rounded-md px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100">Today</button>
            <button type="button" onClick={() => onWeekAnchorChange(shiftWeek(weekAnchor, 7))} aria-label="Next week" className="flex h-7 w-7 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100"><ChevronRight className="w-4 h-4" /></button>
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-1">
            <button type="button" onClick={() => setView('timeline')} className={`rounded-md px-3 py-1 text-xs font-medium transition ${view === 'timeline' ? 'bg-accent text-white' : 'text-gray-500 hover:bg-gray-100'}`}>Timeline</button>
            <button type="button" onClick={() => setView('list')} className={`flex items-center gap-1 rounded-md px-3 py-1 text-xs font-medium transition ${view === 'list' ? 'bg-accent text-white' : 'text-gray-500 hover:bg-gray-100'}`}><ListIcon className="w-3.5 h-3.5" /> List</button>
          </div>
        </div>
      </div>

      {proposal.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-gray-400">Ask the agent to create a schedule to see it visualized here.</p>
      ) : view === 'timeline' ? (
        <TimelineGrid weekDates={weekDates} groupsByDate={groupsByDate} countByDate={countByDate} todayIso={todayIso} selectedGroupKey={selectedGroupKey} onSelectGroup={onSelectGroup} />
      ) : (
        <ListRows weekDates={weekDates} groupsByDate={groupsByDate} todayIso={todayIso} selectedGroupKey={selectedGroupKey} onSelectGroup={onSelectGroup} />
      )}

      {unscheduled.length > 0 && (
        <div className="border-t bg-gray-50 px-5 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1.5">Unscheduled this week</p>
          <div className="flex flex-wrap gap-1.5">
            {unscheduled.map(group => (
              <button
                key={group.groupKey}
                type="button"
                onClick={() => onSelectGroup(group)}
                className={`rounded-full border px-2.5 py-1 text-[11px] ${group.groupKey === selectedGroupKey ? 'border-accent text-accent-700 bg-accent-100' : 'border-gray-200 text-gray-600 bg-white'}`}
              >
                {group.service_type} · {group.location}
              </button>
            ))}
          </div>
        </div>
      )}

      {proposal.length > 0 && view === 'timeline' && (
        <div className="flex flex-wrap items-center gap-4 border-t px-5 py-3 text-xs text-gray-500">
          {legendEntries.map(([location, palette]) => (
            <span key={location} className="flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-full ${palette.dot}`} />{location}</span>
          ))}
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full border border-gray-300 bg-white" />Open slot</span>
        </div>
      )}

      {proposal.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-gray-50 px-5 py-3">
          <p className="text-xs text-gray-500">Tip: Click any booking to view details or change assignment.</p>
          <div className="flex items-center gap-2">
            <button
              onClick={onRejectAll}
              disabled={!pendingCount}
              className="flex items-center gap-1 px-4 py-2 bg-red-500 text-white rounded-lg text-sm disabled:opacity-50 hover:bg-red-600"
            >
              <XCircle className="w-4 h-4" /> Reject All ({pendingCount || 0})
            </button>
            <button
              onClick={onApproveAll}
              disabled={!pendingCount}
              className="flex items-center gap-1 px-4 py-2 bg-accent hover:bg-accent-600 text-white rounded-lg text-sm transition disabled:opacity-50"
            >
              <CheckCircle className="w-4 h-4" /> Approve All ({pendingCount || 0})
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
