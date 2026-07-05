import { Activity, ClipboardList, FileText, Globe, LayoutDashboard, Settings, ShieldAlert, Sparkles, UserCog, Users } from 'lucide-react'

export const navMap = {
  manager: [
    { name: 'Dashboard', path: '/manager', icon: LayoutDashboard },
    { name: 'User Accounts', path: '/manager-user-accounts', icon: UserCog },
    { name: 'Bookings', path: '/manager-bookings', icon: ClipboardList },
    { name: 'Availability', path: '/manager-availability', icon: Activity },
    { name: 'Reports', path: '/manager-reports', icon: FileText },
    { name: 'AI Agent', path: '/manager-ai-agent', icon: Sparkles },
  ],
  staffMember: [
    { name: 'My Tasks', path: '/staffMember', icon: ClipboardList },
  ],
  customer: [
    { name: 'My Bookings', path: '/customer', icon: ClipboardList },
    { name: 'New Booking', path: '/customer-book', icon: ClipboardList },
  ],
  admin: [
    { name: 'User Accounts', path: '/admin', icon: UserCog },
    { name: 'Security Logs', path: '/admin?section=security', icon: ShieldAlert },
    { name: 'Audit Logs', path: '/admin?section=audit', icon: FileText },
    { name: 'Global Parameters', path: '/admin?section=parameters', icon: Settings },
  ],
  userAdmin: [
    { name: 'Overview', path: '/user-admin', icon: Globe },
  ],
}
