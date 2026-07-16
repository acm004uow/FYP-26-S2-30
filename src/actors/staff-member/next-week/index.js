import Layout from '../../../components/Layout'
import { useEffect, useState } from 'react'
import { Calendar, ChevronRight, Clock, MapPin } from 'lucide-react'
import { supabase } from '../../../../lib/supabaseClient'
import { formatBookingAsTask, getNextWeekRange, isTaskAssignedToday, isTaskInRange, isTaskPastDue, statusColor } from '../../../../lib/staffTasks'

export default function StaffNextWeek() {
  const [tasks, setTasks] = useState([])
  const [selectedTask, setSelectedTask] = useState(null)
  const [nextWeekRange] = useState(() => getNextWeekRange())

  useEffect(() => {
    let bookingChannel = null

    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
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
  }, [nextWeekRange])

  return (
    <Layout role="staffMember">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Calendar className="w-6 h-6 text-indigo-500" /> Next Week&apos;s Tasks</h1>
        <p className="text-gray-500 text-sm mt-1 mb-6">
          {nextWeekRange.start.toLocaleDateString()} – {nextWeekRange.end.toLocaleDateString()}
        </p>

        <div className="space-y-3">
          {tasks.length === 0 && (
            <div className="bg-white rounded-xl border p-8 text-center text-gray-400">
              No tasks assigned for next week yet.
            </div>
          )}

          {tasks.map(task => (
            <div
              key={task.id}
              onClick={() => setSelectedTask(selectedTask?.id === task.id ? null : task)}
              className="bg-white rounded-xl shadow-sm border-l-4 border-l-indigo-400 border border-gray-100 p-5 cursor-pointer hover:shadow-md transition"
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
                    <span className="text-xs text-gray-500 flex items-center gap-1"><Clock className="w-3 h-3" />{task.due}</span>
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
      </div>
    </Layout>
  )
}
