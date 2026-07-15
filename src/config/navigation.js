import { Activity, Briefcase, Calendar, CalendarClock, CalendarOff, CheckCircle2, ClipboardList, DollarSign, FileText, Globe, LayoutDashboard, Megaphone, Settings, ShieldAlert, Sparkles, Tags, TrendingUp, UserCheck, UserCog, Users } from 'lucide-react'

export const navMap = {
  manager: [
    { name: 'Dashboard', path: '/manager', icon: LayoutDashboard },
    { name: 'User Accounts', path: '/manager-user-accounts', icon: UserCog },
    { name: 'Bookings', path: '/manager-bookings', icon: ClipboardList },
    { name: 'Schedule', path: '/manager-schedule', icon: Calendar },
    { name: 'Availability', path: '/manager-availability', icon: Activity },
    { name: 'Time Off', path: '/manager-time-off', icon: CalendarOff },
    { name: 'Tracking', path: '/manager-tracking', icon: UserCheck },
    { name: 'Reports', path: '/manager-reports', icon: FileText },
    { name: 'Completed Tasks', path: '/manager-completed-tasks', icon: CheckCircle2 },
    { name: 'AI Agent', path: '/manager-ai-agent', icon: Sparkles },
  ],
  staffMember: [
    { name: 'My Tasks', path: '/staffMember', icon: ClipboardList },
    { name: 'Next Week', path: '/staff-next-week', icon: Calendar },
    { name: 'Time Off', path: '/staff-time-off', icon: CalendarOff },
    { name: 'Attendance', path: '/staff-attendance', icon: UserCheck },
  ],
  departmentStaff: [
    { name: 'Dashboard', path: '/department', icon: Briefcase },
  ],
  customer: [
    { name: 'My Bookings', path: '/customer', icon: ClipboardList },
    { name: 'New Booking', path: '/customer-book', icon: ClipboardList },
  ],
  admin: [
    { name: 'User Accounts', path: '/admin', icon: UserCog },
    { name: 'Tasks', path: '/admin?section=tasks', icon: ClipboardList },
    { name: 'Categories', path: '/admin?section=categories', icon: Tags },
    { name: 'Attendance', path: '/admin?section=attendance', icon: UserCheck },
    { name: 'Marketing', path: '/admin?section=marketing', icon: Megaphone },
    { name: 'Security Logs', path: '/admin?section=security', icon: ShieldAlert },
    { name: 'Audit Logs', path: '/admin?section=audit', icon: FileText },
    { name: 'Global Parameters', path: '/admin?section=parameters', icon: Settings },
    { name: 'Scheduling', path: '/admin?section=closures', icon: CalendarOff },
    { name: 'Reports', path: '/admin?section=reports', icon: TrendingUp },
    { name: 'Pay Rates', path: '/admin?section=payrates', icon: DollarSign },
    { name: 'Time Off', path: '/admin?section=timeoff', icon: CalendarClock },
    { name: 'Departments', path: '/admin?section=departments', icon: Briefcase },
  ],
  userAdmin: [
    { name: 'Overview', path: '/user-admin', icon: Globe },
  ],
}
