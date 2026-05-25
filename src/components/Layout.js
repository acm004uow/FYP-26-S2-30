import { useRouter } from 'next/router'
import Link from 'next/link'
import { useState, useEffect, useRef } from 'react'
import { Bell, LayoutDashboard, LogOut, Menu, X } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import Chatbot from './Chatbot'
import { navMap } from '../config/navigation'

const roleDisplayMap = {
  manager: 'Manager',
  department: 'Department Staff',
  staffMember: 'Staff Member',
  admin: 'System Admin',
}

const profileRoleDisplayMap = {
  manager: 'Manager',
  department_staff: 'Department Staff',
  department: 'Department Staff',
  staff_member: 'Staff Member',
  staffMember: 'Staff Member',
  system_admin: 'System Admin',
  admin: 'System Admin',
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
    async function loadSessionData() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

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

      const resolvedProfile = profile || {
        full_name: user.user_metadata?.full_name || user.email,
        email: user.email,
        role,
        business_name: user.user_metadata?.business_name || '',
        status: 'active',
      }

      if (resolvedProfile.status !== 'active') {
        await supabase.auth.signOut()
        router.push('/login')
        return
      }

      setProfileInfo(resolvedProfile)
      if (resolvedProfile.business_name) setBusinessName(resolvedProfile.business_name)
      setNotifications((notificationRows || []).map(item => ({
        id: item.id,
        message: item.message,
        time: new Date(item.created_at).toLocaleString(),
      })))
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
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [role])

  const roleDisplay = roleDisplayMap[role]
  const profileRoleDisplay = profileRoleDisplayMap[profileInfo?.role || role] || roleDisplay
  const profileInitials = (profileInfo?.full_name || profileInfo?.email || 'User')
    .split(/[ @.]/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join('') || 'U'

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

            <div className="hidden lg:flex items-center gap-1">
              {nav.map(item => (
                <Link key={item.path} href={item.path}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg transition text-sm font-medium ${router.pathname === item.path ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-50'}`}>
                  <item.icon className="w-4 h-4" />
                  {item.name}
                </Link>
              ))}
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

        {mobileOpen && (
          <div className="lg:hidden border-t border-gray-200 bg-white px-4 py-3 space-y-1">
            {nav.map(item => (
              <Link key={item.path} href={item.path}
                onClick={() => setMobileOpen(false)}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
                <item.icon className="w-5 h-5" />
                {item.name}
              </Link>
            ))}
          </div>
        )}
      </nav>

      <main>{children}</main>
      <Chatbot role={role} addNotification={addNotification} />
    </div>
  )
}
