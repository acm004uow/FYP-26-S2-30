import Layout from './Layout'
import { useEffect, useRef, useState } from 'react'
import { Building2, ChevronDown, ChevronLeft, ChevronRight, MoreVertical, Search, Star, Users } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuthUser } from '../context/AuthUserContext'

const staffStatusMeta = {
  Available: { dot: 'bg-green-500', pill: 'bg-green-100 text-green-700', bar: 'bg-green-500' },
  Busy: { dot: 'bg-blue-500', pill: 'bg-blue-100 text-blue-700', bar: 'bg-blue-500' },
  'Time Off': { dot: 'bg-purple-500', pill: 'bg-purple-100 text-purple-700', bar: 'bg-purple-500' },
  'On Leave': { dot: 'bg-gray-400', pill: 'bg-gray-100 text-gray-600', bar: 'bg-gray-400' },
}

const STATUS_FILTERS = ['All', 'Available', 'Busy', 'Time Off', 'On Leave']
const PAGE_SIZE_OPTIONS = [5, 10, 25, 50]

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

function staffInitials(name) {
  return (name || '?').split(' ').map(part => part[0]).join('').slice(0, 2).toUpperCase()
}

// Role-specific color tokens for this page only (kept separate from src/config/roleTheme.js,
// which is tailored to the Attendance/Time-off pages' quite different token set).
const staffDirectoryTheme = {
  departmentStaff: {
    iconSolid: 'bg-[#003333] text-white',
    soft: 'bg-[#E6F2F2] text-[#005252]',
    text: 'text-[#005252]',
    hoverBg: 'hover:bg-[#E6F2F2]',
    ring: 'focus:ring-[#005252]',
    pageActive: 'border-[#003333] bg-[#003333] text-white',
  },
  manager: {
    iconSolid: 'bg-[#003152] text-white',
    soft: 'bg-[#E6F0F7] text-[#003152]',
    text: 'text-[#003152]',
    hoverBg: 'hover:bg-[#E6F0F7]',
    ring: 'focus:ring-[#003152]',
    pageActive: 'border-[#003152] bg-[#003152] text-white',
  },
}

// Resolves the effective host_admin_id for whoever is viewing: the owner's own id if they're
// system_admin, otherwise their profile's host_admin_id — same pattern used throughout the app
// (e.g. src/actors/admin/departments/DepartmentsPanel.js) so this works for any role.
async function resolveHostAdminId(userId) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('role,host_admin_id')
    .eq('id', userId)
    .single()
  return profile?.role === 'system_admin' ? userId : profile?.host_admin_id || null
}

// Reused by department and manager (both full standalone pages with their own Layout/sidebar).
// The admin/owner equivalent is a separate embedded panel (src/actors/admin/staff/StaffPanel.js)
// since admin pages don't have per-route Layout wrappers — see src/actors/admin/dashboard/index.js.
export default function StaffDirectoryPage({ role, breadcrumbLabel }) {
  const theme = staffDirectoryTheme[role] || staffDirectoryTheme.manager
  const { user } = useAuthUser()
  const [staffRows, setStaffRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [staffSearch, setStaffSearch] = useState('')
  const [departmentFilter, setDepartmentFilter] = useState('All')
  const [statusFilter, setStatusFilter] = useState('All')
  const [departmentFilterOpen, setDepartmentFilterOpen] = useState(false)
  const [statusFilterOpen, setStatusFilterOpen] = useState(false)
  const [pageSize, setPageSize] = useState(5)
  const [pageSizeOpen, setPageSizeOpen] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const departmentFilterRef = useRef(null)
  const statusFilterRef = useRef(null)
  const pageSizeRef = useRef(null)

  const loadStaff = async () => {
    if (!user) return
    setLoading(true)
    const resolvedHostAdminId = await resolveHostAdminId(user.id)
    if (!resolvedHostAdminId) {
      setLoading(false)
      return
    }

    const { data: staff } = await supabase
      .from('staff_profiles')
      .select('id,staff_name,availability,current_workload,performance_rating,status,is_suspended,weekly_working_hours,max_weekly_hours,department_id,departments(name)')
      .eq('host_admin_id', resolvedHostAdminId)
      .eq('status', 'active')
      .order('staff_name')

    const staffIds = (staff || []).map(row => row.id)
    let reviewCounts = {}
    if (staffIds.length) {
      const { data: reviews } = await supabase.from('performance_reviews').select('staff_id').in('staff_id', staffIds)
      reviewCounts = (reviews || []).reduce((acc, review) => {
        acc[review.staff_id] = (acc[review.staff_id] || 0) + 1
        return acc
      }, {})
    }

    setStaffRows((staff || []).map(row => ({
      id: row.id,
      name: row.staff_name,
      department: row.departments?.name || 'Unassigned',
      status: row.is_suspended
        ? 'On Leave'
        : row.availability === 'available' ? 'Available' : row.availability === 'time_off' ? 'Time Off' : 'Busy',
      tasks: row.current_workload || 0,
      rating: row.performance_rating || 0,
      reviewCount: reviewCounts[row.id] || 0,
      workloadPercent: Math.min(100, Math.round(((row.weekly_working_hours || 0) / (row.max_weekly_hours || 40)) * 100)),
    })))
    setLoading(false)
  }

  useEffect(() => {
    loadStaff()
  }, [user])

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (departmentFilterRef.current && !departmentFilterRef.current.contains(event.target)) setDepartmentFilterOpen(false)
      if (statusFilterRef.current && !statusFilterRef.current.contains(event.target)) setStatusFilterOpen(false)
      if (pageSizeRef.current && !pageSizeRef.current.contains(event.target)) setPageSizeOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const departmentOptions = ['All', ...new Set(staffRows.map(staff => staff.department))]

  const visibleStaffRows = staffRows.filter(staff => {
    if (staffSearch.trim() && !staff.name.toLowerCase().includes(staffSearch.trim().toLowerCase()) && !staff.department.toLowerCase().includes(staffSearch.trim().toLowerCase())) return false
    if (departmentFilter !== 'All' && staff.department !== departmentFilter) return false
    if (statusFilter !== 'All' && staff.status !== statusFilter) return false
    return true
  })

  useEffect(() => {
    setCurrentPage(1)
  }, [staffSearch, departmentFilter, statusFilter, pageSize])

  const totalCount = visibleStaffRows.length
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
  const safePage = Math.min(currentPage, totalPages)
  const pagedStaffRows = visibleStaffRows.slice((safePage - 1) * pageSize, safePage * pageSize)
  const startIndex = totalCount === 0 ? 0 : (safePage - 1) * pageSize + 1
  const endIndex = Math.min(safePage * pageSize, totalCount)

  return (
    <Layout role={role}>
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-start gap-3 mb-6">
          <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${theme.iconSolid}`}>
            <Users className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide">
              <span className={theme.text}>{breadcrumbLabel}</span>
              <span className="text-gray-400"> / Staff</span>
            </p>
            <h1 className="text-2xl font-bold text-gray-900">Available Staff</h1>
            <p className="text-gray-500 mt-1">Browse the shared staff pool, their workload, and performance.</p>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="relative min-w-[240px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={staffSearch}
              onChange={e => setStaffSearch(e.target.value)}
              placeholder="Search staff by name or department..."
              className={`w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 ${theme.ring}`}
            />
          </div>

          <div className="relative" ref={departmentFilterRef}>
            <button
              type="button"
              onClick={() => setDepartmentFilterOpen(open => !open)}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3.5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              {departmentFilter === 'All' ? 'All Departments' : departmentFilter}
              <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${departmentFilterOpen ? 'rotate-180' : ''}`} />
            </button>
            {departmentFilterOpen && (
              <div className="absolute left-0 z-10 mt-1 w-48 rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
                {departmentOptions.map(option => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => { setDepartmentFilter(option); setDepartmentFilterOpen(false) }}
                    className={`w-full rounded-md px-3 py-2 text-left text-sm ${theme.hoverBg} ${departmentFilter === option ? `font-semibold ${theme.text}` : 'text-gray-700'}`}
                  >
                    {option === 'All' ? 'All Departments' : option}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="relative" ref={statusFilterRef}>
            <button
              type="button"
              onClick={() => setStatusFilterOpen(open => !open)}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3.5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <span className={`h-2 w-2 rounded-full ${statusFilter === 'All' ? 'bg-gray-400' : staffStatusMeta[statusFilter]?.dot}`} />
              {statusFilter === 'All' ? 'All Status' : statusFilter}
              <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${statusFilterOpen ? 'rotate-180' : ''}`} />
            </button>
            {statusFilterOpen && (
              <div className="absolute left-0 z-10 mt-1 w-40 rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
                {STATUS_FILTERS.map(option => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => { setStatusFilter(option); setStatusFilterOpen(false) }}
                    className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm ${theme.hoverBg} ${statusFilter === option ? `font-semibold ${theme.text}` : 'text-gray-700'}`}
                  >
                    <span className={`h-2 w-2 rounded-full ${option === 'All' ? 'bg-gray-400' : staffStatusMeta[option]?.dot}`} />
                    {option === 'All' ? 'All Status' : option}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <th className="px-5 py-3">Staff Member</th>
                  <th className="px-5 py-3">Department</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Workload</th>
                  <th className="px-5 py-3">Rating</th>
                  <th className="px-5 py-3 w-12" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {pagedStaffRows.map(staff => {
                  const meta = staffStatusMeta[staff.status] || staffStatusMeta['On Leave']
                  return (
                    <tr key={staff.id} className="hover:bg-gray-50/60">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${avatarColor(staff.name)}`}>
                            {staffInitials(staff.name)}
                          </span>
                          <div className="min-w-0">
                            <p className="font-semibold text-gray-900">{staff.name}</p>
                            <p className="text-xs text-gray-400">Team Member</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2 text-gray-600">
                          <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${theme.soft}`}>
                            <Building2 className="h-3.5 w-3.5" />
                          </span>
                          {staff.department}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${meta.pill}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} /> {staff.status}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <p className="mb-1 text-gray-700">{staff.tasks} active task{staff.tasks === 1 ? '' : 's'}</p>
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-24 rounded-full bg-gray-100">
                            <div className={`h-1.5 rounded-full ${meta.bar}`} style={{ width: `${staff.workloadPercent}%` }} />
                          </div>
                          <span className="text-xs text-gray-400">{staff.workloadPercent}%</span>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <p className="flex items-center gap-1 font-semibold text-gray-900">
                          <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" /> {staff.rating.toFixed(1)}
                        </p>
                        <p className="text-xs text-gray-400">({staff.reviewCount} review{staff.reviewCount === 1 ? '' : 's'})</p>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <button type="button" disabled className="inline-flex items-center justify-center rounded-lg p-2 text-gray-300" aria-label="No actions available">
                          <MoreVertical className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {!loading && pagedStaffRows.length === 0 && (
              <div className="p-10 text-center text-gray-400">
                {staffRows.length === 0 ? 'No active staff found.' : 'No staff match this search or filter.'}
              </div>
            )}
            {loading && <div className="p-10 text-center text-gray-400">Loading...</div>}
          </div>

          {!loading && totalCount > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 px-5 py-3">
              <p className="text-sm text-gray-500">Showing {startIndex} to {endIndex} of {totalCount} staff</p>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setCurrentPage(page => Math.max(1, page - 1))}
                  disabled={safePage === 1}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                {Array.from({ length: totalPages }, (_, index) => index + 1).map(pageNumber => (
                  <button
                    key={pageNumber}
                    type="button"
                    onClick={() => setCurrentPage(pageNumber)}
                    className={`flex h-8 w-8 items-center justify-center rounded-lg border text-sm font-medium ${pageNumber === safePage ? theme.pageActive : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'}`}
                  >
                    {pageNumber}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setCurrentPage(page => Math.min(totalPages, page + 1))}
                  disabled={safePage === totalPages}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              <div className="relative" ref={pageSizeRef}>
                <button
                  type="button"
                  onClick={() => setPageSizeOpen(open => !open)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
                >
                  {pageSize} per page
                  <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${pageSizeOpen ? 'rotate-180' : ''}`} />
                </button>
                {pageSizeOpen && (
                  <div className="absolute right-0 bottom-full z-20 mb-1 w-28 rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
                    {PAGE_SIZE_OPTIONS.map(option => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => { setPageSize(option); setPageSizeOpen(false) }}
                        className={`w-full rounded-md px-3 py-2 text-left text-sm ${theme.hoverBg} ${pageSize === option ? `font-semibold ${theme.text}` : 'text-gray-700'}`}
                      >
                        {option} per page
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}
