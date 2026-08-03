// Shared color tokens for the Attendance / Time off pages that are reused across roles
// (src/components/AttendancePage.js, src/components/TimeOffPage.js). staffMember ("casual staff")
// keeps its original emerald identity; manager and departmentStaff share the same blue "accent"
// palette already used throughout their other content pages (only their sidebar/header chrome
// differs, per src/components/Layout.js).
const emerald = {
  icon: 'bg-emerald-50 text-emerald-600',
  solid: 'bg-emerald-700 hover:bg-emerald-800',
  border: 'border-emerald-200',
  ring: 'focus:ring-emerald-500',
  link: 'border-emerald-200 text-emerald-700 hover:bg-emerald-50',
  headerRow: 'bg-emerald-50 text-emerald-800',
  badgeSoft: 'bg-emerald-50 text-emerald-600',
  badgeStrong: 'bg-emerald-100 text-emerald-700',
  dot: 'bg-emerald-500',
  ringToday: 'ring-emerald-300',
  text600: 'text-emerald-600',
  activeTab: 'border-emerald-600 bg-emerald-50 text-emerald-700',
  notif: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  statBorder: 'border-l-emerald-500',
  statIcon: 'bg-emerald-100 text-emerald-600',
  chip: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
  checkbox: 'text-emerald-600 focus:ring-emerald-500',
  page: 'border-emerald-500 bg-emerald-50 text-emerald-700',
  totalBar: 'bg-emerald-50/60 text-emerald-800',
  totalIcon: 'bg-emerald-100 text-emerald-600',
}

const accent = {
  icon: 'bg-accent-100 text-accent-600',
  solid: 'bg-accent hover:bg-accent-600',
  border: 'border-accent-200',
  ring: 'focus:ring-accent-500',
  link: 'border-accent-200 text-accent-700 hover:bg-accent-100',
  headerRow: 'bg-accent-100 text-accent-800',
  badgeSoft: 'bg-accent-100 text-accent-600',
  badgeStrong: 'bg-accent-100 text-accent-700',
  dot: 'bg-accent',
  ringToday: 'ring-accent-300',
  text600: 'text-accent-600',
  activeTab: 'border-accent bg-accent-100 text-accent-700',
  notif: 'border-accent-200 bg-accent-100 text-accent-800',
  statBorder: 'border-l-accent',
  statIcon: 'bg-accent-100 text-accent-600',
  chip: 'bg-accent-100 text-accent-700 hover:bg-accent-200',
  checkbox: 'text-accent-600 focus:ring-accent-500',
  page: 'border-accent bg-accent-100 text-accent-700',
  totalBar: 'bg-accent-100/60 text-accent-800',
  totalIcon: 'bg-accent-100 text-accent-600',
}

export const roleTheme = {
  staffMember: emerald,
  manager: accent,
  departmentStaff: accent,
}
