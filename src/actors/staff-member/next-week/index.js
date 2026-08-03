import Layout from '../../../components/Layout'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { Calendar, Check, ChevronRight, Clock, Lightbulb, MapPin, Plus, Sparkles, SprayCan } from 'lucide-react'
import { supabase } from '../../../../lib/supabaseClient'
import { formatBookingAsTask, getNextWeekRange, isTaskAssignedToday, isTaskInRange, isTaskPastDue, statusColor } from '../../../../lib/staffTasks'
import { useAuthUser } from '../../../context/AuthUserContext'

export default function StaffNextWeek() {
  const { user } = useAuthUser()
  const router = useRouter()
  const [tasks, setTasks] = useState([])
  const [selectedTask, setSelectedTask] = useState(null)
  const [nextWeekRange] = useState(() => getNextWeekRange())

  useEffect(() => {
    if (!user) return
    let bookingChannel = null

    async function load() {
      const { data: staffProfile } = await supabase
        .from('staff_profiles')
        .select('id')
        .eq('user_id', user?.id)
        .single()

      if (!staffProfile?.id) return

      const { data: bookings } = await supabase
        .from('bookings')
        .select('id,created_at,service_type,location,scheduled_date,scheduled_time,status,description,notes,customer_id,checked_in_at,checked_out_at,customer:profiles!bookings_customer_id_fkey(full_name,email,phone)')
        .eq('assigned_staff_id', staffProfile.id)
        .neq('status', 'pending')
        .order('scheduled_date', { ascending: true })

      const rows = (bookings || []).map(formatBookingAsTask)
      setTasks(rows.filter(task => !isTaskAssignedToday(task) && !isTaskPastDue(task) && isTaskInRange(task, nextWeekRange)))

      bookingChannel = supabase
        .channel(`staff-next-week-${staffProfile.id}-${Date.now()}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'bookings', filter: `assigned_staff_id=eq.${staffProfile.id}` },
          load
        )
        .subscribe()
    }

    load()

    return () => {
      if (bookingChannel) supabase.removeChannel(bookingChannel)
    }
  }, [nextWeekRange, user])

  return (
    <Layout role="staffMember">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
            <Calendar className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Next Week&apos;s Tasks</h1>
            <p className="mt-0.5 text-sm text-gray-500">
              {nextWeekRange.start.toLocaleDateString()} – {nextWeekRange.end.toLocaleDateString()}
            </p>
          </div>
        </div>

        {tasks.length === 0 ? (
          <>
            <div className="mt-6 rounded-2xl border border-dashed border-emerald-200 bg-emerald-50/40 px-6 py-16 text-center">
              <div className="relative mx-auto mb-6 flex h-28 w-28 items-center justify-center">
                <span className="absolute inset-0 rounded-full bg-emerald-100/70" />
                <Sparkles className="absolute -top-1 left-3 h-4 w-4 text-emerald-300" />
                <Sparkles className="absolute bottom-3 -left-3 h-3 w-3 text-emerald-300" />
                <Sparkles className="absolute top-5 -right-2 h-3 w-3 text-emerald-300" />
                <Calendar className="relative h-14 w-14 text-emerald-400" strokeWidth={1.5} />
                <span className="absolute bottom-1 right-1 flex h-7 w-7 items-center justify-center rounded-full bg-emerald-600 text-white">
                  <Check className="h-4 w-4" />
                </span>
              </div>

              <p className="text-lg font-bold text-gray-900">No tasks assigned for next week yet</p>
              <p className="mt-1 text-sm text-gray-500">You&apos;re all caught up! New tasks will appear here once assigned.</p>

              <button
                type="button"
                onClick={() => router.push('/staffMember')}
                className="mt-5 inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-white px-5 py-2.5 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50"
              >
                <Plus className="h-4 w-4" />
                View All Tasks
              </button>
            </div>

            <div className="mt-4 flex items-center justify-between gap-4 rounded-2xl bg-emerald-50 px-6 py-5">
              <div className="flex items-center gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-emerald-600 shadow-sm">
                  <Lightbulb className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm font-bold text-emerald-700">Tip</p>
                  <p className="text-sm text-gray-600">Keep track of your schedule and check back later for new assignments.</p>
                </div>
              </div>

              <SprayCan className="hidden h-9 w-9 shrink-0 text-emerald-300 sm:block" strokeWidth={1.5} />
            </div>
          </>
        ) : (
          <div className="mt-6 space-y-3">
            {tasks.map(task => (
              <div
                key={task.id}
                onClick={() => setSelectedTask(selectedTask?.id === task.id ? null : task)}
                className="bg-white rounded-xl shadow-sm border-l-4 border-l-emerald-400 border border-gray-100 p-5 cursor-pointer hover:shadow-md transition"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[task.status] || statusColor.Pending}`}>
                        {task.status}
                      </span>
                    </div>

                    <h3 className="font-semibold text-gray-800 text-sm">{task.title}</h3>

                    <div className="flex flex-wrap items-center gap-4 mt-2">
                      <span className="text-xs text-gray-500 flex items-center gap-1"><MapPin className="w-3 h-3" />{task.location}</span>
                      <span className="text-xs text-gray-500 flex items-center gap-1"><Clock className="w-3 h-3" />{task.assignedDate}</span>
                    </div>
                  </div>

                  <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${selectedTask?.id === task.id ? 'rotate-90' : ''}`} />
                </div>

                {selectedTask?.id === task.id && (
                  <div className="mt-4 pt-4 border-t border-gray-100 text-sm text-gray-600 space-y-2">
                    {task.description && <p>{task.description}</p>}
                    <p><span className="font-medium text-gray-800">Assigned day:</span> {task.assignedDate}</p>
                    <p><span className="font-medium text-gray-800">Instructions:</span> {task.instructions}</p>
                    <p><span className="font-medium text-gray-800">Assigned by:</span> {task.supervisor}{task.customerPhone ? ` · ${task.customerPhone}` : ''}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  )
}
