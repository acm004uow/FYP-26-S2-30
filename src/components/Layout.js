import { useRouter } from 'next/router'
import Link from 'next/link'
import { useState, useEffect, useRef } from 'react'
import { LayoutDashboard, ClipboardList, Users, LogOut, Menu, X, MessageCircle, Send, Bot, User, X as XIcon, FileText, Settings, Bell, UserCog } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'

// Chatbot (same as before – keep fully functional)
function getBotResponse(userInput, role) {
  const input = userInput.toLowerCase()
  if (role === 'manager') {
    if (input.includes('report')) return "Open Reports to generate the latest task and staff metrics from Supabase."
    if (input.includes('allocation')) return "Open Task Requests to review the latest pending allocations."
    return "I can help with reports, task requests, or staff overview."
  }
  if (role === 'department') {
    if (input.includes('task')) return "Open My Tasks to view your latest submitted requests."
    if (input.includes('available')) return "Staff availability is managed from the live staff profiles."
    return "Create a new task request or check your submitted tasks."
  }
  if (role === 'staffMember') {
    if (input.includes('task')) return "Open My Tasks to view your current assignments."
    if (input.includes('availability')) return "Use Toggle Status to update your live availability."
    return "I can help with tasks, availability, or performance grade."
  }
  if (role === 'admin') {
    return "Manage users, view security logs, audit logs, or configure parameters."
  }
  return "How can I help?"
}

function Chatbot({ role, addNotification }) {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState([{
    role: 'bot',
    content: `Hello! I'm your AI assistant for ${role === 'staffMember' ? 'Staff Member' : role}.`,
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }])
  const [input, setInput] = useState('')

  const handleSend = () => {
    if (!input.trim()) return
    const userMsg = { role: 'user', content: input, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setTimeout(() => {
      const reply = getBotResponse(input, role)
      setMessages(prev => [...prev, { role: 'bot', content: reply, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }])
      if (addNotification) addNotification(`Chatbot: ${reply.substring(0, 50)}...`)
    }, 500)
  }

  return (
    <>
      {!isOpen && (
        <button onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 w-14 h-14 bg-gradient-to-br from-blue-500 to-green-500 text-white rounded-full shadow-lg hover:shadow-xl transition flex items-center justify-center z-50">
          <MessageCircle className="w-6 h-6" />
        </button>
      )}
      {isOpen && (
        <div className="fixed bottom-6 right-6 w-96 max-w-[calc(100vw-3rem)] bg-white rounded-2xl shadow-2xl flex flex-col z-50" style={{ height: '500px' }}>
          <div className="bg-gradient-to-r from-blue-500 to-green-500 text-white p-4 rounded-t-2xl flex justify-between items-center">
            <div className="flex items-center gap-2"><Bot className="w-5 h-5" /><h3 className="font-medium">AI Assistant</h3></div>
            <button onClick={() => setIsOpen(false)} className="hover:bg-white/20 p-1 rounded-lg"><XIcon className="w-5 h-5" /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'bot' && <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-green-500 rounded-full flex items-center justify-center"><Bot className="w-4 h-4 text-white" /></div>}
                <div className={`px-4 py-2 rounded-2xl max-w-xs text-sm whitespace-pre-line ${msg.role === 'user' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-800'}`}>{msg.content}</div>
                {msg.role === 'user' && <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center"><User className="w-4 h-4 text-gray-600" /></div>}
              </div>
            ))}
          </div>
          <div className="p-4 border-t">
            <div className="flex gap-2">
              <input value={input} onChange={e => setInput(e.target.value)} onKeyPress={e => e.key === 'Enter' && handleSend()} placeholder="Type..." className="flex-1 px-4 py-2 border rounded-lg text-sm" />
              <button onClick={handleSend} className="bg-gradient-to-r from-blue-500 to-green-500 text-white p-2 rounded-lg"><Send className="w-5 h-5" /></button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// Navigation for each role
const navMap = {
  manager: [
    { name: 'Dashboard', path: '/manager', icon: LayoutDashboard },
    { name: 'Staff Profiles', path: '/staff', icon: Users },
    { name: 'User Accounts', path: '/manager-user-accounts', icon: UserCog },
    { name: 'Task Requests', path: '/manager-task-requests', icon: ClipboardList },
    { name: 'Reports', path: '/manager-reports', icon: FileText },
  ],
  department: [
    { name: 'My Tasks', path: '/department', icon: ClipboardList },
    { name: 'New Request', path: '/tasks/create?role=dept', icon: ClipboardList },
  ],
  staffMember: [
    { name: 'My Tasks', path: '/staffMember', icon: ClipboardList },
  ],
  admin: [
    { name: 'Admin Panel', path: '/admin', icon: Settings },
  ]
}

export default function Layout({ children, role = 'manager' }) {
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [showNotifications, setShowNotifications] = useState(false)
  const notificationRef = useRef(null)
  const nav = navMap[role] || navMap.manager

  const addNotification = (message) => {
    const newNotif = { id: Date.now(), message, time: new Date().toLocaleTimeString() }
    setNotifications(prev => [newNotif, ...prev].slice(0, 10))
    // Auto-hide dropdown after 3 seconds? No, keep until user closes.
  }

  useEffect(() => {
    async function loadNotifications() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase
        .from('notifications')
        .select('id,message,created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10)
      setNotifications((data || []).map(item => ({
        id: item.id,
        message: item.message,
        time: new Date(item.created_at).toLocaleString(),
      })))
    }

    loadNotifications()
    const handleClickOutside = (e) => {
      if (notificationRef.current && !notificationRef.current.contains(e.target)) {
        setShowNotifications(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const roleDisplay = { manager: 'Manager', department: 'Department Staff', staffMember: 'Staff Member', admin: 'System Admin' }[role]

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
                <h1 className="text-base font-semibold text-gray-800 hidden sm:block">Smart Task Allocation</h1>
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
              {/* Notification Bell */}
              <div className="relative" ref={notificationRef}>
                <button
                  onClick={() => setShowNotifications(!showNotifications)}
                  className="relative p-2 rounded-lg hover:bg-gray-100 transition"
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
              <button onClick={async () => {
                await supabase.auth.signOut()
                router.push('/login')
              }}
                className="flex items-center gap-2 px-4 py-2 text-red-500 hover:bg-red-50 rounded-lg transition text-sm font-medium">
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Logout</span>
              </button>
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
