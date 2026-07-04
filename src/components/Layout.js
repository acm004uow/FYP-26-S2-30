import { useRouter } from 'next/router'
import Link from 'next/link'
import { useState, useEffect, useRef } from 'react'
import { Bell, LayoutDashboard, LogOut, Menu, X } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import Chatbot from './Chatbot'
import { navMap } from '../config/navigation'

const roleDisplayMap = {
  manager: 'Manager',
  staffMember: 'Staff Member',
  admin: 'System Admin',
  customer: 'Customer',
  userAdmin: 'User Admin',
}

const profileRoleDisplayMap = {
  manager: 'Manager',
  department_staff: 'Department Staff',
  staff_member: 'Staff Member',
  staffMember: 'Staff Member',
  system_admin: 'System Admin',
  admin: 'System Admin',
  customer: 'Customer',
  user_admin: 'User Admin',
  userAdmin: 'User Admin',
}

export default function Layout({ children, role = 'manager' }) {
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [showNotifications, setShowNotifications] = useState(false)
  const [showProfileMenu, setShowProfileMenu] = useState(false)
  const [businessName, setBusinessName] = useState('Smart Task Allocation')
  const [profileInfo, setProfileInfo] = useState(null)
  const notificationRef = useRef(null)
  const profileRef = useRef(null)
  const nav = navMap[role] || navMap.manager

  const addNotification = (message) => {
    const newNotif = { id: Date.now(), message, time: new Date().toLocaleTimeString() }
    setNotifications(prev => [newNotif, ...prev].slice(0, 10))
  }

  useEffect(() => {
    let notificationChannel = null
    let cancelled = false

    async function loadSessionData() {
      const { data: { user } } = await supabase.auth.getUser()
      if (cancelled) return
      if (!user) {
        router.push('/login')
        return
      }

      const [{ data: profile }, { data: notificationRows }] = await Promise.all([
        supabase
          .from('profiles')
          .select('full_name,email,role,business_name,status')
          .eq('id', user.id)
          .single(),
        supabase
          .from('notifications')
          .select('id,message,created_at')
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
      }
      const expectedRole = expectedRoleMap[role] || role
      if (resolvedProfile.role && resolvedProfile.role !== expectedRole) {
        router.push('/login')
        return
      }

      setProfileInfo({ ...resolvedProfile, business_name: resolvedBusinessName })
      if (resolvedBusinessName) setBusinessName(resolvedBusinessName)
      setNotifications((notificationRows || []).map(item => ({
        id: item.id,
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
              message: row.message,
              time: new Date(row.created_at).toLocaleString(),
            }, ...prev].slice(0, 10))
          }
        )
        .subscribe()

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

  const renderNavLink = (item, options = {}) => {
    const [itemPath, itemQuery] = item.path.split('?')
    const isActive = itemQuery
      ? router.pathname === itemPath && router.asPath.includes(itemQuery)
      : router.pathname === itemPath && !(itemPath === '/admin' && router.asPath.includes('section='))
    return (
      <Link key={item.path} href={item.path}
        onClick={options.onClick}
        className={`flex w-full items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition ${isActive ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-50'}`}>
        <item.icon className="h-5 w-5 shrink-0" />
        <span>{item.name}</span>
      </Link>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
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
                    <span className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full"></span>
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
                            <p className="text-sm text-gray-800">{notif.message}</p>
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
                      <div>
                        <p className="text-xs text-gray-400">Business</p>
                        <p className="font-medium text-gray-800">{profileInfo?.business_name || businessName}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400">Role</p>
                        <p className="font-medium text-gray-800">{profileRoleDisplay}</p>
                      </div>
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

      <aside className="fixed left-0 top-16 z-30 hidden h-[calc(100vh-4rem)] w-64 border-r border-gray-200 bg-white lg:block">
        <div className="flex h-full flex-col px-4 py-5">
          <div className="mb-4 px-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Navigation</p>
          </div>
          <div className="space-y-1">
            {nav.map(item => renderNavLink(item))}
          </div>
        </div>
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 top-16 z-30 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-gray-900/30"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation menu"
          />
          <aside className="relative h-full w-72 max-w-[85vw] border-r border-gray-200 bg-white px-4 py-5 shadow-xl">
            <div className="mb-4 px-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Navigation</p>
            </div>
            <div className="space-y-1">
              {nav.map(item => renderNavLink(item, { onClick: () => setMobileOpen(false) }))}
            </div>
          </aside>
        </div>
      )}

      <main className="lg:pl-64">{children}</main>
      <Chatbot role={role} addNotification={addNotification} />
    </div>
  )
}
