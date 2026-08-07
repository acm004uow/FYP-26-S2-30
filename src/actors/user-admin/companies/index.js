import Layout from '../../../components/Layout'
import { useEffect, useMemo, useState } from 'react'
import { Building2, Calendar, ChevronDown, ChevronLeft, ChevronRight, Filter, Plus, Search, Users } from 'lucide-react'
import { supabase } from '../../../../lib/supabaseClient'
import { AddCompanyModal, avatarPaletteFor, initialsOf } from '../shared'

const PAGE_SIZE = 10

export default function UserAdminCompanies() {
  const [profiles, setProfiles] = useState([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [filterOpen, setFilterOpen] = useState(false)
  const [page, setPage] = useState(1)
  const [message, setMessage] = useState('')
  const [companyModal, setCompanyModal] = useState(false)
  const [saving, setSaving] = useState(false)

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

  useEffect(() => {
    setPage(1)
  }, [search, statusFilter])

  const companies = useMemo(() => {
    const owners = profiles.filter(p => p.role === 'system_admin')
    return owners.map(owner => ({
      id: owner.id,
      businessName: owner.business_name || 'Unnamed Company',
      ownerName: owner.full_name || owner.email,
      ownerEmail: owner.email,
      status: owner.status,
      createdAt: owner.created_at,
      userCount: profiles.filter(p => p.host_admin_id === owner.id).length,
    })).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
  }, [profiles])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return companies.filter(company => {
      if (statusFilter !== 'all' && company.status !== statusFilter) return false
      if (!term) return true
      return [company.businessName, company.ownerName, company.ownerEmail].some(value => String(value || '').toLowerCase().includes(term))
    })
  }, [companies, search, statusFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  const handleCreateCompany = async (form) => {
    if (!form.businessName.trim() || !form.ownerName.trim() || !form.email.trim()) {
      setMessage('Fill in business name, owner name, and email.')
      return
    }

    const { data: { session } } = await supabase.auth.getSession()
    setSaving(true)
    let result
    try {
      const response = await fetch('/api/admin/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          email: form.email.trim(),
          full_name: form.ownerName.trim(),
          business_name: form.businessName.trim(),
          role: 'system_admin',
        }),
      })
      result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Could not create company.')
    } catch (err) {
      setSaving(false)
      setMessage(err.message)
      return
    }
    setSaving(false)
    setCompanyModal(false)
    setMessage(`${form.businessName} created — an invite email was sent to ${form.email}.`)
    await loadPlatformData()
  }

  return (
    <Layout role="userAdmin">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-purple-100 text-purple-600">
              <Building2 className="h-6 w-6" />
            </span>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Companies</h1>
              <p className="text-gray-500 text-sm mt-1">Every company registered on Smart Task Allocation.</p>
            </div>
          </div>
          <button
            onClick={() => setCompanyModal(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-[#0F172A] hover:bg-[#1E293B] px-4 py-2.5 text-sm font-semibold text-white transition"
          >
            <Plus className="h-5 w-5" /> Add Company
          </button>
        </div>

        {message && <div className="mb-4 rounded-lg border border-accent-200 bg-accent-100 px-4 py-3 text-sm text-accent-800">{message}</div>}

        <div className="mb-6 flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Search by business name, owner, or email..."
              className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-12 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
            />
          </div>
          <div className="relative sm:w-44">
            <button
              type="button"
              onClick={() => setFilterOpen(v => !v)}
              className="flex w-full items-center gap-2 rounded-xl border border-gray-200 bg-white py-3 px-4 text-sm text-gray-700 hover:bg-gray-50"
            >
              <Filter className="h-4 w-4 text-gray-400" /> {statusFilter === 'all' ? 'Filter' : statusFilter === 'active' ? 'Active' : 'Inactive'}
              <ChevronDown className="ml-auto h-4 w-4 text-gray-400" />
            </button>
            {filterOpen && (
              <div className="absolute right-0 z-10 mt-1 w-40 rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
                {[{ value: 'all', label: 'All Companies' }, { value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }].map(option => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => { setStatusFilter(option.value); setFilterOpen(false) }}
                    className={`w-full rounded-md px-3 py-2 text-left text-sm hover:bg-accent-100 ${statusFilter === option.value ? 'font-semibold text-accent-600' : 'text-gray-700'}`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
          <div className="divide-y divide-gray-100">
            {paginated.map(company => {
              const palette = avatarPaletteFor(company.businessName)
              return (
                <div key={company.id} className="p-4 hover:bg-gray-50 flex justify-between items-center gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${palette.bg} ${palette.text}`}>
                      {initialsOf(company.businessName)}
                    </span>
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 truncate">{company.businessName}</p>
                      <p className="text-xs text-gray-500 truncate">Owner: {company.ownerName} ({company.ownerEmail})</p>
                      <p className="mt-0.5 flex items-center gap-1.5 text-xs text-gray-400">
                        <Calendar className="h-3.5 w-3.5 shrink-0" /> Joined {company.createdAt ? new Date(company.createdAt).toLocaleDateString() : 'Unknown'}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${company.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {company.status === 'active' ? 'Active' : 'Inactive'}
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-accent-100 text-accent-800 font-medium whitespace-nowrap">
                      <Users className="h-3.5 w-3.5" /> {company.userCount} users
                    </span>
                    <ChevronRight className="h-4 w-4 text-gray-300" />
                  </div>
                </div>
              )
            })}
            {filtered.length === 0 && (
              <div className="p-8 text-center text-gray-400">{companies.length === 0 ? 'No companies yet.' : 'No companies match your search.'}</div>
            )}
          </div>

          {filtered.length > 0 && (
            <div className="flex flex-col items-center justify-between gap-3 border-t border-gray-100 px-5 py-3 sm:flex-row">
              <p className="text-sm text-gray-500">Showing {paginated.length} of {filtered.length} companies</p>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(pageNumber => (
                  <button
                    key={pageNumber}
                    onClick={() => setPage(pageNumber)}
                    className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border text-sm font-medium ${pageNumber === currentPage ? 'border-accent-500 bg-accent-100 text-accent-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                  >
                    {pageNumber}
                  </button>
                ))}
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {companyModal && <AddCompanyModal onClose={() => setCompanyModal(false)} onCreate={handleCreateCompany} saving={saving} />}
    </Layout>
  )
}
