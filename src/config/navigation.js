import { Activity, Calendar, CheckCircle2, ClipboardList, FileText, Globe, LayoutDashboard, Megaphone, Settings, ShieldAlert, Sparkles, UserCheck, UserCog, Users } from 'lucide-react'

export const navMap = {
  manager: [
    { name: 'Dashboard', path: '/manager', icon: LayoutDashboard },
    { name: 'User Accounts', path: '/manager-user-accounts', icon: UserCog },
    { name: 'Bookings', path: '/manager-bookings', icon: ClipboardList },
    { name: 'Availability', path: '/manager-availability', icon: Activity },
    { name: 'Tracking', path: '/manager-tracking', icon: UserCheck },
    { name: 'Reports', path: '/manager-reports', icon: FileText },
    { name: 'Completed Tasks', path: '/manager-completed-tasks', icon: CheckCircle2 },
    { name: 'AI Agent', path: '/manager-ai-agent', icon: Sparkles },
  ],
  staffMember: [
    { name: 'My Tasks', path: '/staffMember', icon: ClipboardList },
    { name: 'Next Week', path: '/staff-next-week', icon: Calendar },
    { name: 'Attendance', path: '/staff-attendance', icon: UserCheck },
  ],
  customer: [
    { name: 'My Bookings', path: '/customer', icon: ClipboardList },
    { name: 'New Booking', path: '/customer-book', icon: ClipboardList },
  ],
  admin: [
    { name: 'User Accounts', path: '/admin', icon: UserCog },
    { name: 'Tasks', path: '/admin?section=tasks', icon: ClipboardList },
    { name: 'Attendance', path: '/admin?section=attendance', icon: UserCheck },
    { name: 'Marketing', path: '/admin?section=marketing', icon: Megaphone },
    { name: 'Security Logs', path: '/admin?section=security', icon: ShieldAlert },
    { name: 'Audit Logs', path: '/admin?section=audit', icon: FileText },
    { name: 'Global Parameters', path: '/admin?section=parameters', icon: Settings },
  ],
  userAdmin: [
    { name: 'Overview', path: '/user-admin', icon: Globe },
  ],
}
