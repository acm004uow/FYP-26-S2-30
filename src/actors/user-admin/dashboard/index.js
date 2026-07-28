import Layout from '../../../components/Layout'
import { useEffect, useMemo, useState } from 'react'
import { Building2, Search, Users as UsersIcon } from 'lucide-react'
import { supabase } from '../../../../lib/supabaseClient'

const roleLabel = (role) => ({
  manager: 'Manager',
  department_staff: 'Department Staff',
  staff_member: 'Staff Member',
  system_admin: 'Owner',
  customer: 'Customer',
  user_admin: 'User Admin',
}[role] || role)

export default function UserAdminDashboard() {
  const [profiles, setProfiles] = useState([])
  const [search, setSearch] = useState('')

  const loadPlatformData = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('id,full_name,email,role,business_name,host_admin_id,status,created_at')
      .order('created_at', { ascending: false })

    setProfiles(data || [])
  }

  useEffect(() => {
    loadPlatformData()
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
    })).sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0))
  }, [profiles])

  const filteredProfiles = profiles.filter(p => [
    p.full_name,
    p.email,
    p.role,
    p.business_name,
  ].some(value => String(value || '').toLowerCase().includes(search.toLowerCase())))

  return (
    <Layout role="userAdmin">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-2xl font-bold text-gray-900">Platform Overview</h1>
        <p className="text-gray-500 text-sm mb-6">Companies and users across all Smart Task Allocation accounts.</p>

        <div className="grid grid-cols-2 gap-4 mb-8">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center gap-2 text-gray-500 text-xs font-medium mb-2"><Building2 className="w-4 h-4" /> Companies</div>
            <p className="text-2xl font-bold text-gray-900">{companies.length}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center gap-2 text-gray-500 text-xs font-medium mb-2"><UsersIcon className="w-4 h-4" /> Total Users</div>
            <p className="text-2xl font-bold text-gray-900">{profiles.length}</p>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border overflow-hidden mb-8">
          <div className="p-4 font-semibold border-b bg-gray-50">Companies ({companies.length})</div>
          {companies.length === 0 && <div className="p-8 text-center text-gray-400">No companies yet.</div>}
          {companies.map(company => (
            <div key={company.id} className="p-4 border-b hover:bg-gray-50 flex justify-between items-center">
              <div>
                <p className="font-medium text-gray-800">{company.businessName}</p>
                <p className="text-xs text-gray-500">Owner: {company.ownerName} ({company.ownerEmail})</p>
                <p className="text-xs text-gray-400 mt-1">Joined {company.createdAt ? new Date(company.createdAt).toLocaleDateString() : 'Unknown'}</p>
              </div>
              <span className="text-xs px-2 py-1 rounded-full bg-accent-100 text-accent-800 font-medium">{company.userCount} users</span>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="p-4 font-semibold border-b bg-gray-50">All Users ({profiles.length})</div>
          <div className="p-4 border-b">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, email, role, or company..." className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm" />
            </div>
          </div>
          {filteredProfiles.length === 0 && <div className="p-8 text-center text-gray-400">No users found.</div>}
          {filteredProfiles.map(p => (
            <div key={p.id} className="p-4 border-b hover:bg-gray-50 flex justify-between items-center">
              <div>
                <p className="font-medium text-gray-800">{p.full_name || 'Unnamed'}</p>
                <p className="text-xs text-gray-500">{p.email}</p>
                <p className="text-xs text-gray-400 mt-1">{p.business_name || 'No company'} - Joined {p.created_at ? new Date(p.created_at).toLocaleDateString() : 'Unknown'}</p>
              </div>
              <div className="text-right">
                <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-700 font-medium">{roleLabel(p.role)}</span>
                <p className={`text-xs mt-1 ${p.status === 'active' ? 'text-green-600' : 'text-red-600'}`}>{p.status === 'active' ? 'Active' : 'Inactive'}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Layout>
  )
}
