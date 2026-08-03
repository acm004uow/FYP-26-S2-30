import Layout from '../../../components/Layout'
import { useEffect, useState } from 'react'
import { ChevronDown, Filter, Search, Star, Users } from 'lucide-react'
import { supabase } from '../../../../lib/supabaseClient'
import { useAuthUser } from '../../../context/AuthUserContext'

const staffStatusColor = {
  Available: 'bg-green-100 text-green-700',
  Busy: 'bg-blue-100 text-blue-700',
  'Time Off': 'bg-amber-100 text-amber-700',
  'On Leave': 'bg-gray-100 text-gray-600',
}

const STAFF_STATUS_FILTERS = ['All', 'Available', 'Busy', 'Time Off', 'On Leave']

// Deterministic per-name color so the same staff member always gets the same avatar color.
const AVATAR_PALETTE = [
  'bg-purple-500 text-white',
  'bg-green-500 text-white',
  'bg-teal-500 text-white',
  'bg-orange-500 text-white',
  'bg-indigo-500 text-white',
  'bg-pink-500 text-white',
  'bg-blue-500 text-white',
]

function avatarColor(name) {
  let hash = 0
  for (let i = 0; i < (name || '').length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length]
}

export default function DepartmentStaff() {
  const { user } = useAuthUser()
  const [staffRows, setStaffRows] = useState([])
  const [staffSearch, setStaffSearch] = useState('')
  const [staffStatusFilter, setStaffStatusFilter] = useState('All')
  const [staffFiltersOpen, setStaffFiltersOpen] = useState(false)

  const loadStaff = async () => {
    if (!user) return
    const { data: myProfile } = await supabase
      .from('profiles')
      .select('host_admin_id')
      .eq('id', user?.id)
      .single()

    const resolvedHostAdminId = myProfile?.host_admin_id
    if (!resolvedHostAdminId) return

    const { data: staff } = await supabase
      .from('staff_profiles')
      .select('id,staff_name,skills,availability,current_workload,performance_rating,status,is_suspended')
      .eq('host_admin_id', resolvedHostAdminId)
      .eq('status', 'active')
      .order('staff_name')

    setStaffRows((staff || []).map(row => ({
      id: row.id,
      name: row.staff_name,
      role: row.skills?.[0] || 'Staff Member',
      status: row.is_suspended
        ? 'On Leave'
        : row.availability === 'available' ? 'Available' : row.availability === 'time_off' ? 'Time Off' : 'Busy',
      tasks: row.current_workload || 0,
      rating: row.performance_rating || 0,
    })))
  }

  useEffect(() => {
    loadStaff()
  }, [user])

  const visibleStaffRows = staffRows.filter(staff => {
    if (staffSearch.trim() && !staff.name.toLowerCase().includes(staffSearch.trim().toLowerCase())) return false
    if (staffStatusFilter !== 'All' && staff.status !== staffStatusFilter) return false
    return true
  })

  return (
    <Layout role="departmentStaff">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="flex items-start gap-3 mb-6">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent text-white">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Department / Staff</p>
            <h1 className="text-2xl font-bold text-gray-900">Available Staff</h1>
            <p className="text-gray-500 mt-1">Browse the shared staff pool and their current availability and workload.</p>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="p-5 border-b">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  value={staffSearch}
                  onChange={e => setStaffSearch(e.target.value)}
                  placeholder="Search staff..."
                  className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent-200"
                />
              </div>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setStaffFiltersOpen(open => !open)}
                  className="flex items-center gap-1 px-3 py-2 border rounded-lg text-sm text-gray-700 hover:bg-gray-50"
                >
                  <Filter className="w-4 h-4" /> <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                </button>
                {staffFiltersOpen && (
                  <div className="absolute right-0 mt-1 w-36 bg-white border rounded-lg shadow-lg z-10 overflow-hidden">
                    {STAFF_STATUS_FILTERS.map(option => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => { setStaffStatusFilter(option); setStaffFiltersOpen(false) }}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${staffStatusFilter === option ? 'text-accent-600 font-medium' : 'text-gray-700'}`}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="divide-y divide-gray-50">
            {visibleStaffRows.map(staff => (
              <div key={staff.id} className="p-4">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold text-sm flex-shrink-0 ${avatarColor(staff.name)}`}>
                    {staff.name.split(' ').map(part => part[0]).join('').slice(0, 2)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-800 truncate">{staff.name}</p>
                    <p className="text-xs text-gray-500 truncate">{staff.role} - {staff.tasks} active tasks</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${staffStatusColor[staff.status]}`}>{staff.status}</span>
                    <span className="text-xs text-yellow-500 flex items-center gap-0.5"><Star className="w-3 h-3 fill-yellow-400" />{staff.rating}</span>
                  </div>
                </div>
              </div>
            ))}
            {visibleStaffRows.length === 0 && (
              <div className="p-8 text-center text-gray-400">
                {staffRows.length === 0 ? 'No active staff found.' : 'No staff match this search or filter.'}
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  )
}
