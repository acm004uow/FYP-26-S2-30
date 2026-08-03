// Shared color tokens for the Attendance / Time off pages that are reused across roles
// (src/components/AttendancePage.js, src/components/TimeOffPage.js). staffMember ("casual staff")
// keeps its original emerald identity; manager keeps the blue "accent" palette used throughout
// its other content pages; departmentStaff uses its own dark-teal identity (matching the
// #003333/#005252 buttons on its Task page, e.g. src/actors/department/tasks/index.js).
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

const departmentTheme = {
  icon: 'bg-[#E6F2F2] text-[#005252]',
  solid: 'bg-[#003333] hover:bg-[#005252]',
  border: 'border-[#BFE0E0]',
  ring: 'focus:ring-[#005252]',
  link: 'border-[#BFE0E0] text-[#005252] hover:bg-[#E6F2F2]',
  headerRow: 'bg-[#E6F2F2] text-[#003333]',
  badgeSoft: 'bg-[#E6F2F2] text-[#005252]',
  badgeStrong: 'bg-[#CCE8E8] text-[#004242]',
  dot: 'bg-[#005252]',
  ringToday: 'ring-[#8FC7C7]',
  text600: 'text-[#005252]',
  activeTab: 'border-[#003333] bg-[#E6F2F2] text-[#003333]',
  notif: 'border-[#BFE0E0] bg-[#E6F2F2] text-[#003333]',
  statBorder: 'border-l-[#003333]',
  statIcon: 'bg-[#E6F2F2] text-[#005252]',
  chip: 'bg-[#E6F2F2] text-[#004242] hover:bg-[#CCE8E8]',
  checkbox: 'text-[#005252] focus:ring-[#005252]',
  page: 'border-[#003333] bg-[#E6F2F2] text-[#003333]',
  totalBar: 'bg-[#E6F2F2]/60 text-[#003333]',
  totalIcon: 'bg-[#E6F2F2] text-[#005252]',
}

export const roleTheme = {
  staffMember: emerald,
  manager: accent,
  departmentStaff: departmentTheme,
}
