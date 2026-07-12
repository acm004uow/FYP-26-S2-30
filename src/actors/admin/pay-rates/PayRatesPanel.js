import { useEffect, useRef, useState } from 'react'
import { DollarSign, Wallet, Pencil } from 'lucide-react'
import { supabase } from '../../../../lib/supabaseClient'
import { loadServiceTypes } from '../../../../lib/serviceTypes'

export default function PayRatesPanel() {
  const [hostAdminId, setHostAdminId] = useState(null)
  const [serviceTypes, setServiceTypes] = useState([])
  const [rates, setRates] = useState({})
  const [staffList, setStaffList] = useState([])
  const [message, setMessage] = useState('')
  const [editingRates, setEditingRates] = useState({})
  const [editingSalaries, setEditingSalaries] = useState({})
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
    const { data: profile } = await supabase
      .from('profiles')
      .select('role,host_admin_id')
      .eq('id', user?.id)
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

  return (
    <div className="max-w-4xl mx-auto">
      <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
          <DollarSign className="h-5 w-5 text-green-600" /> Pay Rates
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          Set an hourly rate per service type. When staff complete a task, they earn an allowance equal to the task's estimated hours multiplied by this rate — shown alongside their basic salary in Business Reports.
        </p>

        {message && <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">{message}</div>}

        <div className="mt-5 divide-y divide-gray-100 rounded-xl border border-gray-100">
          {serviceTypes.map(serviceType => (
            <div key={serviceType} className="flex items-center justify-between gap-4 px-4 py-3">
              <span className="text-sm font-medium text-gray-700">{serviceType}</span>
              {editingRates[serviceType] ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-400">$</span>
                  <input
                    ref={el => { rateInputRefs.current[serviceType] = el }}
                    type="number"
                    min="0"
                    step="0.01"
                    defaultValue={rates[serviceType] || 0}
                    onBlur={event => handleSaveRate(serviceType, event.target.value)}
                    onKeyDown={event => handleEditKeyDown(event, () => cancelRateEdit(serviceType))}
                    className="w-28 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    aria-label={`Hourly rate for ${serviceType}`}
                  />
                  <span className="text-sm text-gray-400">/hr</span>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <span className="text-sm tabular-nums text-gray-600">${Number(rates[serviceType] || 0).toFixed(2)}/hr</span>
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
          {serviceTypes.length === 0 && <div className="px-4 py-8 text-center text-sm text-gray-400">No service types found.</div>}
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
          <Wallet className="h-5 w-5 text-blue-500" /> Basic Salary
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          Set each staff member's fixed base pay. This is paid regardless of tasks completed, on top of any allowance earned above.
        </p>

        <div className="mt-5 divide-y divide-gray-100 rounded-xl border border-gray-100">
          {staffList.map(staff => (
            <div key={staff.id} className="flex items-center justify-between gap-4 px-4 py-3">
              <span className="text-sm font-medium text-gray-700">{staff.staff_name}</span>
              {editingSalaries[staff.id] ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-400">$</span>
                  <input
                    ref={el => { salaryInputRefs.current[staff.id] = el }}
                    type="number"
                    min="0"
                    step="0.01"
                    defaultValue={staff.basic_salary || 0}
                    onBlur={event => handleSaveBasicSalary(staff.id, staff.staff_name, event.target.value)}
                    onKeyDown={event => handleEditKeyDown(event, () => cancelSalaryEdit(staff.id))}
                    className="w-28 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    aria-label={`Basic salary for ${staff.staff_name}`}
                  />
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <span className="text-sm tabular-nums text-gray-600">${Number(staff.basic_salary || 0).toFixed(2)}</span>
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
          ))}
          {staffList.length === 0 && <div className="px-4 py-8 text-center text-sm text-gray-400">No staff found.</div>}
        </div>
      </div>
    </div>
  )
}
