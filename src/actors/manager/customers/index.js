import Layout from '../../../components/Layout'
import { useEffect, useState } from 'react'
import { AlertTriangle, Lock, ShieldCheck, Unlock, Users, X } from 'lucide-react'
import { supabase } from '../../../../lib/supabaseClient'

export default function ManagerCustomers() {
  const [customers, setCustomers] = useState([])
  const [message, setMessage] = useState('')
  const [unlockTarget, setUnlockTarget] = useState(null)

  const loadCustomers = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: managerProfile } = await supabase
      .from('profiles')
      .select('host_admin_id')
      .eq('id', user?.id)
      .single()

    const hostAdminId = managerProfile?.host_admin_id
    if (!hostAdminId) return

    const { data, error } = await supabase
      .from('profiles')
      .select('id,full_name,email,status,late_cancellation_count,created_at')
      .eq('host_admin_id', hostAdminId)
      .eq('role', 'customer')
      .order('full_name', { ascending: true })

    if (error) {
      setMessage(error.message)
      return
    }
    setCustomers(data || [])
  }

  useEffect(() => {
    loadCustomers()
  }, [])

  const confirmUnlock = async () => {
    if (!unlockTarget) return
    const { error } = await supabase
      .from('profiles')
      .update({ status: 'active', late_cancellation_count: 0, updated_at: new Date().toISOString() })
      .eq('id', unlockTarget.id)
    if (!error) {
      await supabase.from('audit_logs').insert({ user_id: unlockTarget.id, action: 'unlock_customer', details: `Unlocked ${unlockTarget.full_name}` })
    }
    setMessage(error ? error.message : `${unlockTarget.full_name}'s account has been unlocked.`)
    setUnlockTarget(null)
    await loadCustomers()
  }

  return (
    <Layout role="manager">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Customers</h1>
          <p className="text-gray-500 text-sm mt-1">Accounts auto-lock after 2 late (within 24h) cancellations of an approved booking.</p>
        </div>
        {message && <div className="mb-4 rounded-lg border bg-blue-50 px-4 py-3 text-sm text-blue-700">{message}</div>}

        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="text-lg font-semibold flex items-center gap-2"><Users className="w-5 h-5 text-blue-500" /> Customer Accounts</h2>

          <div className="mt-4 space-y-3">
            {customers.length === 0 && <p className="text-sm text-gray-400">No customers found.</p>}
            {customers.map(customer => {
              const isLocked = customer.status === 'locked'
              const strikes = customer.late_cancellation_count || 0
              return (
                <div key={customer.id} className={`flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between ${isLocked ? 'border-red-200 bg-red-50' : 'border-gray-100'}`}>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-semibold text-gray-900">{customer.full_name}</p>
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${isLocked ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                        {isLocked ? <Lock className="h-3 w-3" /> : <ShieldCheck className="h-3 w-3" />}
                        {isLocked ? 'Locked' : 'Active'}
                      </span>
                    </div>
                    <p className="truncate text-xs text-gray-500">{customer.email}</p>
                    <p className={`mt-1 text-xs ${strikes > 0 ? 'text-amber-600' : 'text-gray-400'}`}>
                      Late cancellation strikes: {strikes}/2
                    </p>
                  </div>
                  {isLocked && (
                    <button
                      onClick={() => setUnlockTarget(customer)}
                      className="inline-flex shrink-0 items-center justify-center gap-1 rounded-full bg-green-600 px-4 py-2 text-xs font-semibold text-white hover:bg-green-700"
                    >
                      <Unlock className="h-3.5 w-3.5" /> Unlock
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {unlockTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6">
            <div className="flex justify-between gap-4">
              <h3 className="flex items-center gap-2 text-lg font-semibold"><AlertTriangle className="h-5 w-5 text-amber-500" /> Unlock Customer Account</h3>
              <button type="button" onClick={() => setUnlockTarget(null)} aria-label="Close"><X /></button>
            </div>
            <p className="mt-4 text-sm text-gray-600">
              {unlockTarget.full_name} will be able to sign in and book again. Their late cancellation count will be reset to 0.
            </p>
            <div className="mt-6 flex gap-2">
              <button type="button" onClick={confirmUnlock} className="flex-1 rounded-lg bg-green-600 py-2 text-sm font-medium text-white hover:bg-green-700">Unlock Account</button>
              <button type="button" onClick={() => setUnlockTarget(null)} className="flex-1 rounded-lg bg-gray-200 py-2 text-sm font-medium text-gray-700">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
