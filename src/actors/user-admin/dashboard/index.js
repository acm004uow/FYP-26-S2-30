import Link from 'next/link'
import Layout from '../../../components/Layout'
import { useEffect, useMemo, useState } from 'react'
import { BarChart3, Building2, ChevronRight, Users as UsersIcon } from 'lucide-react'
import { supabase } from '../../../../lib/supabaseClient'
import { ROLE_META, avatarPaletteFor, initialsOf, roleLabel } from '../shared'

const PREVIEW_COUNT = 3

export default function UserAdminDashboard() {
  const [profiles, setProfiles] = useState([])

  useEffect(() => {
    supabase
      .from('profiles')
      .select('id,full_name,email,role,business_name,host_admin_id,status,created_at')
      .order('created_at', { ascending: false })
      .then(({ data }) => setProfiles(data || []))
  }, [])

  const companies = useMemo(() => {
    const owners = profiles.filter(p => p.role === 'system_admin')
    return owners.map(owner => ({
      id: owner.id,
      businessName: owner.business_name || 'Unnamed Company',
      ownerName: owner.full_name || owner.email,
      ownerEmail: owner.email,
      createdAt: owner.created_at,
      userCount: profiles.filter(p => p.host_admin_id === owner.id).length,
    })).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
  }, [profiles])

  const recentCompanies = companies.slice(0, PREVIEW_COUNT)
  const recentUsers = profiles.slice(0, PREVIEW_COUNT)

  return (
    <Layout role="userAdmin">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6 flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600">
            <BarChart3 className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Platform Overview</h1>
            <p className="text-gray-500 text-sm mt-1">Companies and users across all Smart Task Allocation accounts.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-purple-100 text-purple-600">
                <Building2 className="h-5 w-5" />
              </span>
              <p className="text-sm font-semibold text-gray-700">Companies</p>
            </div>
            <p className="mt-3 text-2xl font-bold text-gray-900">{companies.length}</p>
            <p className="mt-1 text-xs text-gray-400">Total registered companies</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-green-100 text-green-600">
                <UsersIcon className="h-5 w-5" />
              </span>
              <p className="text-sm font-semibold text-gray-700">Total Users</p>
            </div>
            <p className="mt-3 text-2xl font-bold text-gray-900">{profiles.length}</p>
            <p className="mt-1 text-xs text-gray-400">Across all companies</p>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-5 border-b border-gray-100 flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                <Building2 className="h-4 w-4" />
              </span>
              <div>
                <p className="font-semibold text-gray-900">Companies ({companies.length})</p>
                <p className="text-xs text-gray-400">Most recently registered.</p>
              </div>
            </div>
            <div className="divide-y divide-gray-100">
              {recentCompanies.map(company => {
                const palette = avatarPaletteFor(company.businessName)
                return (
                  <div key={company.id} className="p-4 flex justify-between items-center gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${palette.bg} ${palette.text}`}>
                        {initialsOf(company.businessName)}
                      </span>
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 truncate">{company.businessName}</p>
                        <p className="text-xs text-gray-500 truncate">Owner: {company.ownerName} ({company.ownerEmail})</p>
                      </div>
                    </div>
                    <span className="text-xs px-2.5 py-1 rounded-full bg-accent-100 text-accent-800 font-medium whitespace-nowrap">{company.userCount} users</span>
                  </div>
                )
              })}
              {companies.length === 0 && <div className="p-8 text-center text-gray-400">No companies yet.</div>}
            </div>
            <Link href="/user-admin-companies" className="w-full border-t border-gray-100 py-3 text-sm font-semibold text-accent-600 hover:bg-gray-50 flex items-center justify-center gap-1">
              View all companies <ChevronRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-5 border-b border-gray-100 flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-green-50 text-green-600">
                <UsersIcon className="h-4 w-4" />
              </span>
              <div>
                <p className="font-semibold text-gray-900">All Users ({profiles.length})</p>
                <p className="text-xs text-gray-400">Most recently joined.</p>
              </div>
            </div>
            <div className="divide-y divide-gray-100">
              {recentUsers.map(p => {
                const palette = avatarPaletteFor(p.full_name || p.email)
                const meta = ROLE_META[p.role]
                return (
                  <div key={p.id} className="p-4 flex justify-between items-center gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${palette.bg} ${palette.text}`}>
                        {initialsOf(p.full_name || p.email)}
                      </span>
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 truncate">{p.full_name || 'Unnamed'}</p>
                        <p className="text-xs text-gray-500 truncate">{p.email}</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className={`inline-block text-xs px-2.5 py-1 rounded-full font-medium whitespace-nowrap ${meta?.pill || 'bg-gray-100 text-gray-700'}`}>{roleLabel(p.role)}</span>
                      <p className={`text-xs mt-1 font-medium ${p.status === 'active' ? 'text-green-600' : 'text-red-500'}`}>{p.status === 'active' ? 'Active' : 'Inactive'}</p>
                    </div>
                  </div>
                )
              })}
              {profiles.length === 0 && <div className="p-8 text-center text-gray-400">No users found.</div>}
            </div>
            <Link href="/user-admin-users" className="w-full border-t border-gray-100 py-3 text-sm font-semibold text-accent-600 hover:bg-gray-50 flex items-center justify-center gap-1">
              View all users <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </Layout>
  )
}
