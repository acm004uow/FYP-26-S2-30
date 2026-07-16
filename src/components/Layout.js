import { useRouter } from 'next/router'
import Link from 'next/link'
import { useState, useEffect, useRef } from 'react'
import { Bell, Headphones, LayoutDashboard, LogOut, Menu, Pencil, X } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import Chatbot from './Chatbot'
import { navMap } from '../config/navigation'

const roleDisplayMap = {
  manager: 'Manager',
  staffMember: 'Staff Member',
  admin: 'Owner',
  customer: 'Customer',
  userAdmin: 'User Admin',
}

const profileRoleDisplayMap = {
  manager: 'Manager',
  department_staff: 'Department Staff',
  staff_member: 'Staff Member',
  staffMember: 'Staff Member',
  system_admin: 'Owner',
  admin: 'Owner',
  customer: 'Customer',
  user_admin: 'User Admin',
  userAdmin: 'User Admin',
}

export default function Layout({ children, role = 'manager' }) {
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [showNotifications, setShowNotifications] = useState(false)
  const [pendingBookingsCount, setPendingBookingsCount] = useState(0)
  const [showProfileMenu, setShowProfileMenu] = useState(false)
  const [businessName, setBusinessName] = useState('Smart Task Allocation')
  const [profileInfo, setProfileInfo] = useState(null)
  const [userId, setUserId] = useState(null)
  const [editingProfile, setEditingProfile] = useState(false)
  const [profileEditForm, setProfileEditForm] = useState({ full_name: '', phone: '' })
  const [savingProfile, setSavingProfile] = useState(false)
  const notificationRef = useRef(null)
  const profileRef = useRef(null)
  const nav = navMap[role] || navMap.manager

  const addNotification = (message) => {
    const newNotif = { id: Date.now(), message, time: new Date().toLocaleTimeString() }
    setNotifications(prev => [newNotif, ...prev].slice(0, 10))
  }

  useEffect(() => {
    let notificationChannel = null
    let bookingsChannel = null
    let cancelled = false

    async function loadSessionData() {
      const { data: { user } } = await supabase.auth.getUser()
      if (cancelled) return
      if (!user) {
        router.push(`/login?next=${encodeURIComponent(router.asPath)}`)
        return
      }

      const [{ data: profile }, { data: notificationRows }] = await Promise.all([
        supabase
          .from('profiles')
          .select('full_name,email,role,business_name,status,host_admin_id,phone')
          .eq('id', user.id)
          .single(),
        supabase
          .from('notifications')
          .select('id,title,message,created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(10),
      ])
      if (cancelled) return

      const resolvedProfile = profile || {
        full_name: user.user_metadata?.full_name || user.email,
        email: user.email,
        role,
        business_name: user.user_metadata?.business_name || '',
        status: 'active',
        phone: '',
      }

      let resolvedBusinessName = resolvedProfile.business_name
      if (!resolvedBusinessName && !['customer', 'userAdmin'].includes(role)) {
        const { data: adminProfiles } = await supabase
          .from('profiles')
          .select('business_name,created_at')
          .eq('role', 'system_admin')
          .not('business_name', 'is', null)
          .order('created_at', { ascending: true })
          .limit(1)

        resolvedBusinessName = adminProfiles?.[0]?.business_name || ''
      }

      if (resolvedProfile.status !== 'active') {
        await supabase.auth.signOut()
        router.push('/login')
        return
      }

      const expectedRoleMap = {
        manager: 'manager',
        staffMember: 'staff_member',
        admin: 'system_admin',
        customer: 'customer',
        userAdmin: 'user_admin',
        departmentStaff: 'department_staff',
      }
      const expectedRole = expectedRoleMap[role] || role
      if (resolvedProfile.role && resolvedProfile.role !== expectedRole) {
        router.push('/login')
        return
      }

      setProfileInfo({ ...resolvedProfile, business_name: resolvedBusinessName })
      setUserId(user.id)
      setProfileEditForm({ full_name: resolvedProfile.full_name || '', phone: resolvedProfile.phone || '' })
      if (resolvedBusinessName) setBusinessName(resolvedBusinessName)
      setNotifications((notificationRows || []).map(item => ({
        id: item.id,
        title: item.title,
        message: item.message,
        time: new Date(item.created_at).toLocaleString(),
      })))

      notificationChannel = supabase
        .channel(`notifications-${user.id}-${Date.now()}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
          (payload) => {
            const row = payload.new
            setNotifications(prev => [{
              id: row.id,
              title: row.title,
              message: row.message,
              time: new Date(row.created_at).toLocaleString(),
            }, ...prev].slice(0, 10))
          }
        )
        .subscribe()

      if (role === 'manager' && resolvedProfile.host_admin_id) {
        const hostAdminId = resolvedProfile.host_admin_id
        const refreshPendingCount = async () => {
          const { count } = await supabase
            .from('bookings')
            .select('id', { count: 'exact', head: true })
            .eq('host_admin_id', hostAdminId)
            .eq('status', 'pending')
          if (!cancelled) setPendingBookingsCount(count || 0)
        }

        await refreshPendingCount()

        bookingsChannel = supabase
          .channel(`bookings-badge-${hostAdminId}-${Date.now()}`)
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'bookings', filter: `host_admin_id=eq.${hostAdminId}` },
            refreshPendingCount
          )
          .subscribe()
      }
    }

    loadSessionData()

    const handleClickOutside = (event) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target)) {
        setShowNotifications(false)
      }
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setShowProfileMenu(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      cancelled = true
      document.removeEventListener('mousedown', handleClickOutside)
      if (notificationChannel) supabase.removeChannel(notificationChannel)
      if (bookingsChannel) supabase.removeChannel(bookingsChannel)
    }
  }, [role, router])

  const roleDisplay = roleDisplayMap[role]
  const profileRoleDisplay = profileRoleDisplayMap[profileInfo?.role || role] || roleDisplay
  const profileInitials = (profileInfo?.full_name || profileInfo?.email || 'User')
    .split(/[ @.]/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join('') || 'U'

  const isCustomerNav = role === 'customer'

  const openSupportChat = () => {
    document.getElementById('chatbot-toggle-button')?.click()
  }

  const renderHelpCard = () => (
    isCustomerNav ? (
      <div className="mt-4 border-t border-slate-700 pt-4">
        <div className="flex items-center gap-2 text-teal-400">
          <Headphones className="h-5 w-5" />
          <p className="text-sm font-semibold text-white">Need help?</p>
        </div>
        <p className="mt-1 text-xs text-slate-400">Chat with our support team anytime.</p>
        <button
          type="button"
          onClick={openSupportChat}
          className="mt-3 w-full rounded-lg border border-teal-700 bg-slate-900 py-2 text-xs font-semibold text-teal-400 hover:bg-slate-700"
        >
          Contact Support →
        </button>
      </div>
    ) : (
      <div className="mt-4 rounded-xl border border-green-100 bg-green-50 p-4">
        <div className="flex items-center gap-2 text-green-700">
          <Headphones className="h-5 w-5" />
          <p className="text-sm font-semibold">Need help?</p>
        </div>
        <p className="mt-1 text-xs text-gray-500">Chat with our support team anytime.</p>
        <button
          type="button"
          onClick={openSupportChat}
          className="mt-3 w-full rounded-lg border border-green-200 bg-white py-2 text-xs font-semibold text-green-700 hover:bg-green-50"
        >
          Contact Support
        </button>
      </div>
    )
  )

  const renderCustomerNavCard = (onLinkClick) => (
    <div className="flex h-full flex-col rounded-2xl border border-slate-800 bg-slate-900 p-4">
      <p className="mb-4 px-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Bookings</p>
      <div className="space-y-1">
        {nav.map(item => renderNavLink(item, { onClick: onLinkClick }))}
      </div>
      <div className="mt-auto">
        {renderHelpCard()}
        <p className="mt-4 px-2 text-center text-[11px] text-slate-600">© {new Date().getFullYear()} Smart Task Allocation</p>
      </div>
    </div>
  )

  const renderNavLink = (item, options = {}) => {
    const [itemPath, itemQuery] = item.path.split('?')
    const isActive = itemQuery
      ? router.pathname === itemPath && router.asPath.includes(itemQuery)
      : router.pathname === itemPath && !(itemPath === '/admin' && router.asPath.includes('section='))
    const badgeCount = itemPath === '/manager-bookings' ? pendingBookingsCount : 0
    const activeClasses = isCustomerNav ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-600'
    const inactiveClasses = isCustomerNav ? 'text-slate-300 hover:bg-slate-800 hover:text-white' : 'text-gray-600 hover:bg-gray-50'
    return (
      <Link key={item.path} href={item.path}
        onClick={options.onClick}
        className={`flex w-full items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition ${isActive ? activeClasses : inactiveClasses}`}>
        <item.icon className="h-5 w-5 shrink-0" />
        <span className="flex-1">{item.name}</span>
        {badgeCount > 0 && (
          <span className="flex h-5 min-w-[1.25rem] shrink-0 items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-semibold text-white">
            {badgeCount > 9 ? '9+' : badgeCount}
          </span>
        )}
      </Link>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              <button onClick={() => setMobileOpen(!mobileOpen)} className="lg:hidden p-2 rounded-lg hover:bg-gray-100">
                {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-green-500 rounded-lg flex items-center justify-center">
                <LayoutDashboard className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-base font-semibold text-gray-800 hidden sm:block">{businessName}</h1>
                <p className="text-xs text-gray-400 hidden sm:block">{roleDisplay}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative" ref={notificationRef}>
                <button
                  onClick={() => setShowNotifications(!showNotifications)}
                  className="relative p-2 rounded-lg hover:bg-gray-100 transition"
                  aria-label="Open notifications"
                >
                  <Bell className="w-5 h-5 text-gray-600" />
                  {notifications.length > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
                      {notifications.length > 9 ? '9+' : notifications.length}
                    </span>
                  )}
                </button>
                {showNotifications && (
                  <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-lg border border-gray-100 z-50 overflow-hidden">
                    <div className="p-3 border-b border-gray-100 font-semibold text-gray-700">Notifications</div>
                    <div className="max-h-96 overflow-y-auto">
                      {notifications.length === 0 ? (
                        <div className="p-4 text-center text-gray-400 text-sm">No notifications</div>
                      ) : (
                        notifications.map(notif => (
                          <div key={notif.id} className="p-3 border-b border-gray-50 hover:bg-gray-50">
                            {notif.title && (
                              <p className="text-sm font-semibold text-gray-800">{notif.title}</p>
                            )}
                            <p className="text-sm text-gray-600">{notif.message}</p>
                            <p className="text-xs text-gray-400 mt-1">{notif.time}</p>
                          </div>
                        ))
                      )}
                    </div>
                    <button
                      onClick={() => setNotifications([])}
                      className="w-full p-2 text-center text-xs text-blue-500 hover:bg-gray-50"
                    >
                      Clear all
                    </button>
                  </div>
                )}
              </div>

              <div className="relative" ref={profileRef}>
                <button
                  onClick={() => setShowProfileMenu(!showProfileMenu)}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-green-500 text-sm font-semibold text-white shadow-sm hover:shadow-md transition"
                  aria-label="Open profile menu"
                >
                  {profileInitials}
                </button>
                {showProfileMenu && (
                  <div className="absolute right-0 mt-2 w-72 overflow-hidden rounded-xl border border-gray-100 bg-white shadow-lg z-50">
                    <div className="p-4 border-b border-gray-100">
                      <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-green-500 text-sm font-semibold text-white">
                          {profileInitials}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-gray-800">{profileInfo?.full_name || 'User'}</p>
                          <p className="truncate text-xs text-gray-500">{profileInfo?.email || 'No email'}</p>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-2 p-4 text-sm">
                      {role !== 'customer' && (
                        <div>
                          <p className="text-xs text-gray-400">Business</p>
                          <p className="font-medium text-gray-800">{profileInfo?.business_name || businessName}</p>
                        </div>
                      )}
                      <div>
                        <p className="text-xs text-gray-400">Role</p>
                        <p className="font-medium text-gray-800">{profileRoleDisplay}</p>
                      </div>
                      {role === 'customer' && (
                        <div className="pt-2 border-t border-gray-100">
                          <div className="flex items-center justify-between">
                            <p className="text-xs text-gray-400">Personal info</p>
                            <button
                              type="button"
                              onClick={() => { setEditingProfile(true); setShowProfileMenu(false) }}
                              className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
                            >
                              <Pencil className="h-3 w-3" /> Edit
                            </button>
                          </div>
                          <p className="mt-1 font-medium text-gray-800">{profileInfo?.phone || 'No phone number added'}</p>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={async () => {
                        await supabase.auth.signOut()
                        router.push('/login')
                      }}
                      className="flex w-full items-center gap-2 border-t border-gray-100 px-4 py-3 text-sm font-medium text-red-500 hover:bg-red-50 transition"
                    >
                      <LogOut className="w-4 h-4" />
                      Logout
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

      </nav>

      <aside className={`fixed left-0 top-16 z-30 hidden h-[calc(100vh-4rem)] w-64 border-r lg:block ${isCustomerNav ? 'border-slate-950 bg-slate-950' : 'border-gray-200 bg-white'}`}>
        {isCustomerNav ? (
          <div className="h-full p-3">{renderCustomerNavCard()}</div>
        ) : (
          <div className="flex h-full flex-col px-4 py-5">
            <div className="mb-4 px-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Navigation</p>
            </div>
            <div className="space-y-1">
              {nav.map(item => renderNavLink(item))}
            </div>
          </div>
        )}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 top-16 z-30 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-gray-900/30"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation menu"
          />
          <aside className={`relative h-full w-72 max-w-[85vw] overflow-y-auto shadow-xl ${isCustomerNav ? 'border-r border-slate-950 bg-slate-950 p-3' : 'border-r border-gray-200 bg-white px-4 py-5'}`}>
            {isCustomerNav ? (
              renderCustomerNavCard(() => setMobileOpen(false))
            ) : (
              <>
                <div className="mb-4 px-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Navigation</p>
                </div>
                <div className="space-y-1">
                  {nav.map(item => renderNavLink(item, { onClick: () => setMobileOpen(false) }))}
                </div>
              </>
            )}
          </aside>
        </div>
      )}

      <main className="lg:pl-64">{children}</main>
      <Chatbot role={role} addNotification={addNotification} />

      {editingProfile && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <form
            onSubmit={async (event) => {
              event.preventDefault()
              if (!userId) return
              setSavingProfile(true)
              const { error } = await supabase
                .from('profiles')
                .update({ full_name: profileEditForm.full_name, phone: profileEditForm.phone, updated_at: new Date().toISOString() })
                .eq('id', userId)
              setSavingProfile(false)
              if (!error) {
                setProfileInfo(prev => prev ? { ...prev, full_name: profileEditForm.full_name, phone: profileEditForm.phone } : prev)
                setEditingProfile(false)
              }
            }}
            className="bg-white rounded-xl max-w-sm w-full p-6"
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Edit Personal Info</h3>
              <button type="button" onClick={() => setEditingProfile(false)} aria-label="Close"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Full name</label>
                <input
                  required
                  value={profileEditForm.full_name}
                  onChange={e => setProfileEditForm(prev => ({ ...prev, full_name: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Phone number</label>
                <input
                  value={profileEditForm.phone}
                  onChange={e => setProfileEditForm(prev => ({ ...prev, phone: e.target.value }))}
                  placeholder="e.g. 9123 4567"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
              </div>
              <button type="submit" disabled={savingProfile} className="w-full bg-gradient-to-r from-blue-500 to-green-500 text-white py-2 rounded-lg text-sm font-medium disabled:opacity-60">
                {savingProfile ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
