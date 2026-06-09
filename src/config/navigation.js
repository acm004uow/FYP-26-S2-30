import { Activity, ClipboardList, FileText, LayoutDashboard, Settings, ShieldAlert, Tags, UserCog, Users } from 'lucide-react'

export const navMap = {
  manager: [
    { name: 'Dashboard', path: '/manager', icon: LayoutDashboard },
    { name: 'Staff Profiles', path: '/staff', icon: Users },
    { name: 'User Accounts', path: '/manager-user-accounts', icon: UserCog },
    { name: 'Categories', path: '/manager-categories', icon: Tags },
    { name: 'Task Requests', path: '/manager-task-requests', icon: ClipboardList },
    { name: 'Availability', path: '/manager-availability', icon: Activity },
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
    { name: 'User Accounts', path: '/admin', icon: UserCog },
    { name: 'Security Logs', path: '/admin?section=security', icon: ShieldAlert },
    { name: 'Audit Logs', path: '/admin?section=audit', icon: FileText },
    { name: 'Global Parameters', path: '/admin?section=parameters', icon: Settings },
  ],
}
