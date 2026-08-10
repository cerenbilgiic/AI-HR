import type { ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'

const HR_NAV_ITEMS = [
  { to: '/hr/dashboard', label: 'Dashboard' },
  { to: '/hr/jobs', label: 'Jobs' },
  { to: '/hr/candidates', label: 'Candidates' },
]

export default function Layout({ children }: { children: ReactNode }) {
  const location = useLocation()
  const showHrNav = location.pathname.startsWith('/hr') && location.pathname !== '/hr/login'

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50/60 via-gray-50 to-gray-50">
      <header className="border-b border-gray-200 bg-white/80 px-6 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
            AI
          </span>
          <h1 className="text-lg font-semibold text-gray-900">AI-HR</h1>
        </div>
        {showHrNav && (
          <nav className="mx-auto mt-3 flex max-w-5xl gap-1">
            {HR_NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `rounded px-3 py-1.5 text-sm font-medium ${
                    isActive ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        )}
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  )
}
