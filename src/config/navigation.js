import { Activity, Briefcase, Building2, Calendar, CalendarClock, CalendarOff, CheckCircle2, ClipboardList, ClipboardPlus, Clock, DollarSign, FileText, Globe, History, LayoutDashboard, ListChecks, Megaphone, Settings, Sparkles, Tags, TrendingUp, UserCheck, UserCog, Users } from 'lucide-react'

export const navMap = {
  manager: [
    { name: 'Dashboard', path: '/manager', icon: LayoutDashboard },
    { name: 'Crew', path: '/manager-user-accounts', icon: UserCog },
    { name: 'Staff', path: '/manager-staff', icon: Users },
    { name: 'Bookings', path: '/manager-bookings', icon: ClipboardList },
    { name: 'New Task', path: '/manager-new-task', icon: ClipboardPlus },
    { name: 'Schedule', path: '/manager-schedule', icon: Calendar },
    { name: 'Time Off', path: '/manager-time-off', icon: CalendarOff },
    { name: 'My Attendance', path: '/manager-my-attendance', icon: Clock },
    { name: 'Tracking', path: '/manager-tracking', icon: UserCheck },
    { name: 'Reports', path: '/manager-reports', icon: FileText },
    { name: 'Completed Tasks', path: '/manager-completed-tasks', icon: CheckCircle2 },
    { name: 'Scheduler', path: '/manager-ai-agent', icon: Sparkles },
  ],
  staffMember: [
    { name: 'My Tasks', path: '/staffMember', icon: ClipboardList },
    { name: 'Next Week', path: '/staff-next-week', icon: Calendar },
    { name: 'Time Off', path: '/staff-time-off', icon: CalendarOff },
    { name: 'Attendance', path: '/staff-attendance', icon: UserCheck },
  ],
  departmentStaff: [
    { name: 'Task', path: '/department', icon: ListChecks },
    { name: 'Staff', path: '/department-staff', icon: Users },
    { name: 'History', path: '/department-history', icon: History },
    { name: 'Attendance', path: '/department-attendance', icon: UserCheck },
    { name: 'Time Off', path: '/department-time-off', icon: CalendarOff },
  ],
  customer: [
    { name: 'My Bookings', path: '/customer', icon: ClipboardList },
    { name: 'New Booking', path: '/customer-book', icon: ClipboardList },
  ],
  admin: [
    { name: 'Employees', path: '/admin', icon: UserCog },
    { name: 'Departments', path: '/admin?section=departments', icon: Briefcase },
    { name: 'Staff', path: '/admin?section=staff', icon: Users },
    { name: 'Attendance', path: '/admin?section=attendance', icon: UserCheck },
    { name: 'New Task', path: '/admin?section=tasks', icon: ClipboardList },
    { name: 'Categories', path: '/admin?section=categories', icon: Tags },
    { name: 'Reports', path: '/admin?section=reports', icon: TrendingUp },
    { name: 'Pay Rates', path: '/admin?section=payrates', icon: DollarSign },
    { name: 'Time Off', path: '/admin?section=timeoff', icon: CalendarClock },
    { name: 'Closures', path: '/admin?section=closures', icon: CalendarOff },
    { name: 'Marketing', path: '/admin?section=marketing', icon: Megaphone },
    { name: 'Global Parameters', path: '/admin?section=parameters', icon: Settings },
  ],
  userAdmin: [
    { name: 'Overview', path: '/user-admin', icon: Globe },
    { name: 'Companies', path: '/user-admin-companies', icon: Building2 },
    { name: 'Users', path: '/user-admin-users', icon: Users },
  ],
}
