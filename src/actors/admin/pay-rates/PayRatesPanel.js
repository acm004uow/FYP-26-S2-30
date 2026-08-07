import { useEffect, useMemo, useRef, useState } from 'react'
import { DollarSign, Pencil, Search, Tag, TrendingUp, Users, Wallet } from 'lucide-react'
import { supabase } from '../../../../lib/supabaseClient'
import { loadServiceTypes } from '../../../../lib/serviceTypes'

const AVATAR_PALETTE = [
  { bg: 'bg-purple-100', text: 'text-purple-600' },
  { bg: 'bg-teal-100', text: 'text-teal-600' },
  { bg: 'bg-pink-100', text: 'text-pink-600' },
  { bg: 'bg-orange-100', text: 'text-orange-600' },
  { bg: 'bg-blue-100', text: 'text-blue-600' },
  { bg: 'bg-green-100', text: 'text-green-600' },
]

const initialsOf = (name) => (name || '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()

function StatCard({ icon: Icon, iconBg, iconColor, label, value, subLabel }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-2 shadow-sm">
      <div className="flex items-center gap-3">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${iconBg} ${iconColor}`}>
          <Icon className="h-5 w-5" />
        </span>
        <p className="text-sm font-medium text-gray-500">{label}</p>
      </div>
      <p className="mt-3 text-2xl font-bold text-gray-900">{value}</p>
      {subLabel && <p className="mt-1 text-xs text-gray-400">{subLabel}</p>}
    </div>
  )
}

export default function PayRatesPanel() {
  const [hostAdminId, setHostAdminId] = useState(null)
  const [serviceTypes, setServiceTypes] = useState([])
  const [rates, setRates] = useState({})
  const [staffList, setStaffList] = useState([])
  const [message, setMessage] = useState('')
  const [editingRates, setEditingRates] = useState({})
  const [editingSalaries, setEditingSalaries] = useState({})
  const [serviceSearch, setServiceSearch] = useState('')
  const [staffSearch, setStaffSearch] = useState('')
  const rateInputRefs = useRef({})
  const salaryInputRefs = useRef({})

  const enableRateEdit = serviceType => {
    setEditingRates(prev => ({ ...prev, [serviceType]: true }))
    setTimeout(() => rateInputRefs.current[serviceType]?.focus(), 0)
  }

  const enableSalaryEdit = staffId => {
    setEditingSalaries(prev => ({ ...prev, [staffId]: true }))
    setTimeout(() => salaryInputRefs.current[staffId]?.focus(), 0)
  }

  const cancelRateEdit = serviceType => setEditingRates(prev => ({ ...prev, [serviceType]: false }))
  const cancelSalaryEdit = staffId => setEditingSalaries(prev => ({ ...prev, [staffId]: false }))

  const handleEditKeyDown = (event, onCancel) => {
    if (event.key === 'Enter') event.target.blur()
    if (event.key === 'Escape') {
      event.preventDefault()
      onCancel()
    }
  }

  const resolveHostAdminId = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.id) return null

    const { data: profile } = await supabase
      .from('profiles')
      .select('role,host_admin_id')
      .eq('id', user.id)
      .single()

    return profile?.role === 'system_admin' ? user.id : profile?.host_admin_id || null
  }

  const load = async () => {
    const resolvedHostAdminId = await resolveHostAdminId()
    setHostAdminId(resolvedHostAdminId)
    if (!resolvedHostAdminId) return

    const [types, { data: rateRows }, { data: staffRows }] = await Promise.all([
      loadServiceTypes(supabase, resolvedHostAdminId),
      supabase.from('service_pay_rates').select('service_type,hourly_rate').eq('host_admin_id', resolvedHostAdminId),
      supabase.from('staff_profiles').select('id,staff_name,basic_salary').eq('host_admin_id', resolvedHostAdminId).order('staff_name'),
    ])

    setServiceTypes(types)
    const rateMap = {}
    ;(rateRows || []).forEach(row => { rateMap[row.service_type] = row.hourly_rate })
    setRates(rateMap)
    setStaffList(staffRows || [])
  }

  useEffect(() => {
    load()
  }, [])

  const handleSaveRate = async (serviceType, value) => {
    if (!hostAdminId) {
      setMessage('Could not resolve your company.')
      return
    }
    const hourlyRate = Math.max(0, Number(value) || 0)

    const { error } = await supabase.from('service_pay_rates').upsert({
      host_admin_id: hostAdminId,
      service_type: serviceType,
      hourly_rate: hourlyRate,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'host_admin_id,service_type' })

    if (error) {
      setMessage(error.message)
      return
    }

    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('audit_logs').insert({
      user_id: user?.id,
      action: 'update_service_pay_rate',
      details: `${serviceType} hourly rate set to ${hourlyRate}`,
    })
    setRates(prev => ({ ...prev, [serviceType]: hourlyRate }))
    setEditingRates(prev => ({ ...prev, [serviceType]: false }))
    setMessage(`${serviceType} rate saved.`)
  }

  const handleSaveBasicSalary = async (staffProfileId, staffName, value) => {
    const basicSalary = Math.max(0, Number(value) || 0)

    const { error } = await supabase
      .from('staff_profiles')
      .update({ basic_salary: basicSalary, updated_at: new Date().toISOString() })
      .eq('id', staffProfileId)

    if (error) {
      setMessage(error.message)
      return
    }

    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('audit_logs').insert({
      user_id: user?.id,
      action: 'update_staff_basic_salary',
      details: `${staffName} basic salary set to ${basicSalary}`,
    })
    setStaffList(prev => prev.map(s => s.id === staffProfileId ? { ...s, basic_salary: basicSalary } : s))
    setEditingSalaries(prev => ({ ...prev, [staffProfileId]: false }))
    setMessage(`${staffName}'s basic salary saved.`)
  }

  const filteredServiceTypes = useMemo(
    () => serviceTypes.filter(type => type.toLowerCase().includes(serviceSearch.trim().toLowerCase())),
    [serviceTypes, serviceSearch],
  )
  const filteredStaff = useMemo(
    () => staffList.filter(staff => (staff.staff_name || '').toLowerCase().includes(staffSearch.trim().toLowerCase())),
    [staffList, staffSearch],
  )

  const stats = useMemo(() => {
    const rateValues = serviceTypes.map(type => Number(rates[type]) || 0)
    const avgRate = rateValues.length ? rateValues.reduce((sum, value) => sum + value, 0) / rateValues.length : 0
    const totalSalary = staffList.reduce((sum, staff) => sum + (Number(staff.basic_salary) || 0), 0)
    return { avgRate, totalSalary }
  }, [serviceTypes, rates, staffList])

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-start gap-4 mb-6">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-600">
          <DollarSign className="h-6 w-6" />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pay Rates</h1>
          <p className="text-gray-500 text-sm mt-1 max-w-xl">Set an hourly rate per service type and a basic salary per staff member — used to calculate payroll allowance in Business Reports.</p>
        </div>
      </div>

      {message && <div className="mb-4 rounded-lg border border-accent-200 bg-accent-100 px-4 py-3 text-sm text-accent-800">{message}</div>}

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={Tag} iconBg="bg-blue-100" iconColor="text-blue-600" label="Service Types" value={serviceTypes.length} subLabel="With hourly rates" />
        <StatCard icon={Users} iconBg="bg-purple-100" iconColor="text-purple-600" label="Staff Members" value={staffList.length} subLabel="With basic salary" />
        <StatCard icon={TrendingUp} iconBg="bg-green-100" iconColor="text-green-600" label="Avg Hourly Rate" value={`$${stats.avgRate.toFixed(2)}`} subLabel="Across service types" />
        <StatCard icon={Wallet} iconBg="bg-amber-100" iconColor="text-amber-600" label="Total Basic Salary" value={`$${stats.totalSalary.toFixed(2)}`} subLabel="Payroll base per period" />
      </div>

      <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-green-50 text-green-600">
              <DollarSign className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-gray-900">Service Type Rates</p>
              <p className="text-xs text-gray-400">Hourly allowance paid per completed task, by service</p>
            </div>
          </div>
          <div className="relative w-full sm:w-56">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={serviceSearch}
              onChange={event => setServiceSearch(event.target.value)}
              placeholder="Search service types..."
              className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
            />
          </div>
        </div>

        <div className="divide-y divide-gray-100 rounded-lg border border-gray-100">
          {filteredServiceTypes.map(serviceType => (
            <div key={serviceType} className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-green-50 text-green-600">
                  <Tag className="h-4 w-4" />
                </span>
                <span className="truncate text-sm font-medium text-gray-700">{serviceType}</span>
              </div>
              {editingRates[serviceType] ? (
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-sm text-gray-400">$</span>
                  <input
                    ref={el => { rateInputRefs.current[serviceType] = el }}
                    type="number"
                    min="0"
                    step="0.01"
                    defaultValue={rates[serviceType] || 0}
                    onBlur={event => handleSaveRate(serviceType, event.target.value)}
                    onKeyDown={event => handleEditKeyDown(event, () => cancelRateEdit(serviceType))}
                    className="w-28 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
                    aria-label={`Hourly rate for ${serviceType}`}
                  />
                  <span className="text-sm text-gray-400">/hr</span>
                </div>
              ) : (
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-sm font-semibold tabular-nums text-gray-900">${Number(rates[serviceType] || 0).toFixed(2)}/hr</span>
                  <button
                    type="button"
                    onClick={() => enableRateEdit(serviceType)}
                    className="rounded-lg p-2 text-gray-400 hover:bg-gray-50 hover:text-gray-600"
                    aria-label={`Edit hourly rate for ${serviceType}`}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          ))}
          {filteredServiceTypes.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-gray-400">
              {serviceTypes.length === 0 ? 'No service types found.' : 'No service types match your search.'}
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-100 text-accent-600">
              <Wallet className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-gray-900">Staff Basic Salary</p>
              <p className="text-xs text-gray-400">Fixed base pay per staff member, on top of any allowance earned</p>
            </div>
          </div>
          <div className="relative w-full sm:w-56">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={staffSearch}
              onChange={event => setStaffSearch(event.target.value)}
              placeholder="Search staff..."
              className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
            />
          </div>
        </div>

        <div className="divide-y divide-gray-100 rounded-lg border border-gray-100">
          {filteredStaff.map((staff, index) => {
            const palette = AVATAR_PALETTE[index % AVATAR_PALETTE.length]
            return (
              <div key={staff.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${palette.bg} ${palette.text}`}>
                    {initialsOf(staff.staff_name)}
                  </span>
                  <span className="truncate text-sm font-medium text-gray-700">{staff.staff_name}</span>
                </div>
                {editingSalaries[staff.id] ? (
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-sm text-gray-400">$</span>
                    <input
                      ref={el => { salaryInputRefs.current[staff.id] = el }}
                      type="number"
                      min="0"
                      step="0.01"
                      defaultValue={staff.basic_salary || 0}
                      onBlur={event => handleSaveBasicSalary(staff.id, staff.staff_name, event.target.value)}
                      onKeyDown={event => handleEditKeyDown(event, () => cancelSalaryEdit(staff.id))}
                      className="w-28 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
                      aria-label={`Basic salary for ${staff.staff_name}`}
                    />
                  </div>
                ) : (
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-sm font-semibold tabular-nums text-gray-900">${Number(staff.basic_salary || 0).toFixed(2)}</span>
                    <button
                      type="button"
                      onClick={() => enableSalaryEdit(staff.id)}
                      className="rounded-lg p-2 text-gray-400 hover:bg-gray-50 hover:text-gray-600"
                      aria-label={`Edit basic salary for ${staff.staff_name}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            )
          })}
          {filteredStaff.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-gray-400">
              {staffList.length === 0 ? 'No staff found.' : 'No staff match your search.'}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
