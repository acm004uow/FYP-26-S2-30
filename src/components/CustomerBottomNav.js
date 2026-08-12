import Link from 'next/link'
import { useRouter } from 'next/router'

const items = [
  { name: 'My Bookings', path: '/customer' },
  { name: 'New Booking', path: '/customer-book' },
  { name: 'Marketplace', path: '/marketplace' },
]

// Sits inline in the header (see Layout.js) rather than floating fixed-bottom — that used to
// overlap page content (e.g. the bookings detail panel) on shorter viewports.
export default function CustomerBottomNav() {
  const router = useRouter()

  return (
    <nav className="flex items-center gap-1 rounded-full bg-[#003152] p-1 shadow-sm" aria-label="Customer navigation">
      {items.map(item => {
        const isActive = router.pathname === item.path
        return (
          <Link
            key={item.path}
            href={item.path}
            className={`rounded-full px-2.5 sm:px-4 py-1.5 text-xs sm:text-sm font-semibold whitespace-nowrap transition ${
              isActive ? 'bg-white text-slate-900' : 'text-slate-300 hover:text-white'
            }`}
          >
            {item.name}
          </Link>
        )
      })}
    </nav>
  )
}
