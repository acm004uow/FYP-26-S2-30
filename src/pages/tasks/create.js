import Layout from '../../components/Layout'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { ClipboardList, MapPin, Users, Calendar, AlertCircle, CheckCircle, Star, TrendingUp } from 'lucide-react'
import { supabase } from '../../../lib/supabaseClient'
import { generateRecommendations, formatRecommendationExplanation } from '../../../lib/recommendationEngine'

export default function TaskCreation({ initialRole = 'manager' }) {
  const router = useRouter()
  const role = initialRole
  const [submitted, setSubmitted] = useState(false)
  const [allStaff, setAllStaff] = useState([])
  const [categories, setCategories] = useState(['Maintenance', 'Inspection', 'Cleaning', 'Delivery', 'Administration'])
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    title: '', description: '', location: '', priority: 'Medium', urgent: false,
    category: '', dueDate: '', dueTime: '', assignee: '', notes: ''
  })
  const [recommendations, setRecommendations] = useState([])
  const [recommendationParams, setRecommendationParams] = useState(null)

  useEffect(() => {
    async function loadFormData() {
      const [{ data }, { data: categoryRows, error: categoryError }, { data: systemParams }] = await Promise.all([
        supabase
        .from('staff_profiles')
        .select('id,staff_name,skills,availability,performance_rating,current_workload,assigned_region,weekly_working_hours,max_weekly_hours,is_suspended,status')
        .eq('is_suspended', false)
          .eq('status', 'active'),
        supabase
          .from('task_categories')
          .select('name,status')
          .eq('status', 'active')
          .order('name'),
        supabase.from('system_parameters').select('*').eq('id', 1).single(),
      ])
      setAllStaff((data || []).map(row => ({
        id: row.id,
        staff_name: row.staff_name,
        name: row.staff_name,
        role: row.skills?.[0] || 'Staff Member',
        skills: row.skills || [],
        availability: row.availability,
        available: row.availability === 'available',
        performance_rating: row.performance_rating || 0,
        rating: row.performance_rating || 0,
        current_workload: row.current_workload || 0,
        tasks: row.current_workload || 0,
        assigned_region: row.assigned_region || '',
        location: row.assigned_region || '',
        weekly_working_hours: row.weekly_working_hours || 0,
        max_weekly_hours: row.max_weekly_hours || 40,
        is_suspended: row.is_suspended,
        status: row.status,
        workload: row.current_workload || 0,
      })))
      setRecommendationParams(systemParams || null)
      if (!categoryError && categoryRows?.length) {
        setCategories(categoryRows.map(category => category.name))
      }
    }
    loadFormData()
  }, [])

  // AI recommendation engine
  useEffect(() => {
    if (!form.category || !form.location) {
      setRecommendations([])
      return
    }
    const taskForScoring = {
      required_skill: form.category,
      location: form.location,
      estimated_hours: 1,
    }
    const staffById = new Map(allStaff.map(staff => [staff.id, staff]))
    const prioritized = generateRecommendations(allStaff, taskForScoring, recommendationParams || {})
      .slice(0, 3)
      .map(rec => {
        const staff = staffById.get(rec.staff_id) || {}
        return {
          ...staff,
          id: rec.staff_id,
          name: rec.staff_name,
          score: rec.score,
          reason: rec.reason,
          explanation: rec.explanation || [],
        }
      })
    setRecommendations(prioritized)
  }, [allStaff, form.category, form.location, recommendationParams])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (role === 'manager' && !form.assignee && recommendations.length > 0) {
      setError('Please select a staff member from recommendations.')
      return
    }
    const { data: { user } } = await supabase.auth.getUser()
    const scheduled_end = form.dueDate ? new Date(`${form.dueDate}T${form.dueTime || '23:59'}`).toISOString() : null
    const { data: createdTask, error: insertError } = await supabase.from('task_requests').insert({
      created_by: user?.id,
      title: form.title,
      description: form.description,
      location: form.location,
      required_skill: form.category || 'General',
      priority: form.urgent ? 'High' : form.priority,
      estimated_hours: 1,
      instructions: form.notes,
      scheduled_end,
      assigned_staff_id: role === 'manager' ? form.assignee || null : null,
      status: role === 'manager' ? 'approved' : 'pending',
    }).select('id').single()
    await supabase.from('audit_logs').insert({ user_id: user?.id, action: 'create_task', details: form.title })
    if (insertError) {
      setError(insertError.message)
      return
    }
    if (role === 'department' && createdTask?.id) {
      let { data: requesterProfile, error: requesterProfileError } = await supabase
        .from('profiles')
        .select('full_name,email,business_name,host_admin_id')
        .eq('id', user?.id)
        .single()

      if (requesterProfileError) {
        const fallbackProfile = await supabase
          .from('profiles')
          .select('full_name,email,business_name')
          .eq('id', user?.id)
          .single()
        requesterProfile = fallbackProfile.data
      }

      const managerQueries = []
      if (requesterProfile?.host_admin_id) {
        managerQueries.push(
          supabase
            .from('profiles')
            .select('id')
            .eq('role', 'manager')
            .eq('status', 'active')
            .eq('host_admin_id', requesterProfile.host_admin_id)
        )
      }
      if (requesterProfile?.business_name) {
        managerQueries.push(
          supabase
            .from('profiles')
            .select('id')
            .eq('role', 'manager')
            .eq('status', 'active')
            .eq('business_name', requesterProfile.business_name)
        )
      }
      if (managerQueries.length === 0) {
        managerQueries.push(
          supabase
            .from('profiles')
            .select('id')
            .eq('role', 'manager')
            .eq('status', 'active')
        )
      }

      const managerResults = await Promise.all(managerQueries)
      const managersById = new Map()
      managerResults.forEach(({ data }) => {
        ;(data || []).forEach(manager => managersById.set(manager.id, manager))
      })

      const requesterName = requesterProfile?.full_name || requesterProfile?.email || 'Department staff'
      const managerNotifications = Array.from(managersById.values()).map(manager => ({
        user_id: manager.id,
        title: 'New task request',
        message: `${requesterName} submitted ${form.title} for review.`,
      }))

      if (managerNotifications.length) {
        await supabase.from('notifications').insert(managerNotifications)
      }
    }
    if (role === 'manager' && form.assignee && createdTask?.id) {
      const { data: assignedStaff } = await supabase
        .from('staff_profiles')
        .select('user_id,staff_name,current_workload')
        .eq('id', form.assignee)
        .single()

      if (assignedStaff) {
        await supabase.from('staff_profiles').update({
          current_workload: Number(assignedStaff.current_workload || 0) + 1,
          updated_at: new Date().toISOString(),
        }).eq('id', form.assignee)

        if (assignedStaff.user_id) {
          await supabase.from('notifications').insert({
            user_id: assignedStaff.user_id,
            title: 'New task assignment',
            message: `${form.title} has been assigned to you.`,
          })
        }
      }
    }
    if (createdTask?.id && recommendations.length > 0) {
      await supabase.from('task_recommendations').insert(
        recommendations.map(rec => ({
          task_id: createdTask.id,
          staff_id: rec.id,
          score: rec.score,
          reason: rec.reason,
        }))
      )
    }
    setSubmitted(true)
    setTimeout(() => {
      router.push(role === 'manager' ? '/manager' : '/department')
    }, 2000)
  }

  if (submitted) {
    return (
      <Layout role={role}>
        <div className="min-h-[80vh] flex items-center justify-center">
          <div className="text-center">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-10 h-10 text-green-500" />
            </div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">Task Created!</h2>
            <p className="text-gray-500">Redirecting to dashboard...</p>
          </div>
        </div>
      </Layout>
    )
  }

  return (
    <Layout role={role}>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Create New Task</h1>
          <p className="text-gray-500 text-sm mt-1">Fill in the details and the system will recommend the best staff.</p>
        </div>
        {error && <div className="mb-4 rounded-lg border bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main Form */}
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                <h3 className="font-semibold text-gray-800 mb-5 flex items-center gap-2"><ClipboardList className="w-5 h-5 text-blue-500" /> Task Details</h3>
                <div className="space-y-4">
                  <div><label className="block text-sm font-medium text-gray-700 mb-2">Task Title *</label><input required value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. Equipment Maintenance Check" className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-gray-50" /></div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-2">Description</label><textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={4} placeholder="Describe the task requirements..." className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-gray-50 resize-none" /></div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className="block text-sm font-medium text-gray-700 mb-2">Category</label><select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-gray-50"><option value="">Select category</option>{categories.map(category => <option key={category} value={category}>{category}</option>)}</select></div>
                    <div><label className="block text-sm font-medium text-gray-700 mb-2">Priority</label><div className="flex gap-2">{['Low', 'Medium', 'High'].map(p => (<button key={p} type="button" onClick={() => setForm({ ...form, priority: p })} className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition ${form.priority === p ? p === 'High' ? 'bg-red-500 text-white' : p === 'Medium' ? 'bg-orange-500 text-white' : 'bg-gray-500 text-white' : 'bg-gray-50 text-gray-600 border-gray-200'}`}>{p}</button>))}</div></div>
                  </div>
                  <div className="flex items-center gap-3"><input type="checkbox" id="urgent" checked={form.urgent} onChange={e => setForm({ ...form, urgent: e.target.checked })} className="w-4 h-4" /><label htmlFor="urgent" className="text-sm text-gray-700">Mark as Urgent (requires faster allocation)</label></div>
                </div>
              </div>

              <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                <h3 className="font-semibold text-gray-800 mb-5 flex items-center gap-2"><MapPin className="w-5 h-5 text-green-500" /> Location & Schedule</h3>
                <div className="space-y-4">
                  <div><label className="block text-sm font-medium text-gray-700 mb-2">Location *</label><input required value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="e.g. Zone A, Building 1" className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-gray-50" /></div>
                  <div className="grid grid-cols-2 gap-4"><div><label className="block text-sm font-medium text-gray-700 mb-2">Due Date *</label><input required type="date" value={form.dueDate} onChange={e => setForm({ ...form, dueDate: e.target.value })} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-gray-50" /></div><div><label className="block text-sm font-medium text-gray-700 mb-2">Due Time</label><input type="time" value={form.dueTime} onChange={e => setForm({ ...form, dueTime: e.target.value })} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-gray-50" /></div></div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-2">Additional Notes</label><textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} placeholder="Any special instructions..." className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-gray-50 resize-none" /></div>
                </div>
              </div>
            </div>

            {/* AI Recommendation Panel */}
            <div className="space-y-6">
              <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                <h3 className="font-semibold text-gray-800 mb-5 flex items-center gap-2"><TrendingUp className="w-5 h-5 text-purple-500" /> Staff Recommendations</h3>
                {recommendations.length > 0 ? (
                  <div className="space-y-3">
                    {recommendations.map((rec, idx) => (
                      <div key={rec.id} onClick={() => role === 'manager' && setForm({ ...form, assignee: rec.id.toString() })} className={`p-3 rounded-xl border-2 transition ${role === 'manager' ? 'cursor-pointer' : ''} ${form.assignee === rec.id.toString() ? 'border-blue-500 bg-blue-50' : 'border-gray-100 hover:border-gray-300 bg-gray-50'}`}>
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 bg-gradient-to-br from-blue-400 to-green-400 rounded-full flex items-center justify-center text-white text-xs font-bold">{rec.name.split(' ').map(n=>n[0]).join('')}</div>
                          <div className="flex-1"><p className="text-sm font-medium text-gray-800">{rec.name} <span className="text-xs text-gray-400">(Score: {rec.score})</span></p><p className="text-xs text-gray-500">{rec.role} • {rec.tasks} tasks • ⭐{rec.rating}</p></div>
                          {idx === 0 && <span className="text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full">Best match</span>}
                        </div>
                        <div className="mt-3 space-y-1 text-xs text-gray-500">
                          {(rec.explanation?.filter(item => item.matched) || []).length > 0 ? (
                            <ul className="list-disc list-inside space-y-1">
                              {rec.explanation.filter(item => item.matched).map((item, index) => (
                                <li key={index}>{item.description}</li>
                              ))}
                            </ul>
                          ) : (
                            <p>{rec.reason}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">Select a category and location to see staff recommendations.</p>
                )}
                {role === 'manager' && form.assignee && <div className="mt-3 p-2 bg-green-50 text-green-700 text-xs rounded-lg flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Staff selected</div>}
                {role === 'department' && recommendations.length > 0 && <div className="mt-3 p-2 bg-blue-50 text-blue-700 text-xs rounded-lg flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Recommendations will be sent with this request</div>}
              </div>

              <div className="space-y-3">
                <button type="submit" className="w-full py-3 bg-gradient-to-r from-blue-500 to-green-500 text-white rounded-xl font-semibold text-sm hover:from-blue-600 hover:to-green-600 transition shadow-md">{role === 'manager' ? 'Create & Assign Task' : 'Submit Task Request'}</button>
                <button type="button" onClick={() => router.push(role === 'manager' ? '/manager' : '/department')} className="w-full py-3 bg-white border border-gray-200 text-gray-600 rounded-xl font-medium text-sm hover:bg-gray-50 transition">Cancel</button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </Layout>
  )
}

export async function getServerSideProps({ query }) {
  return {
    props: {
      initialRole: query.role === 'dept' ? 'department' : 'manager',
    },
  }
}
