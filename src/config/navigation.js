import { ClipboardList, FileText, LayoutDashboard, Settings, UserCog, Users } from 'lucide-react'

export const navMap = {
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
  ],
}
