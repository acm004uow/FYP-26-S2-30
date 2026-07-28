import Link from 'next/link'
import { useRouter } from 'next/router'

const items = [
  { name: 'My Bookings', path: '/customer' },
  { name: 'New Booking', path: '/customer-book' },
  { name: 'Marketplace', path: '/marketplace' },
]

export default function CustomerBottomNav() {
  const router = useRouter()

  return (
    <nav className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4" aria-label="Customer navigation">
      <div className="flex items-center gap-1 rounded-full bg-slate-900/95 p-1.5 shadow-xl shadow-slate-900/30 backdrop-blur">
        {items.map(item => {
          const isActive = router.pathname === item.path
          return (
            <Link
              key={item.path}
              href={item.path}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                isActive ? 'bg-white text-slate-900' : 'text-slate-300 hover:text-white'
              }`}
            >
              {item.name}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
