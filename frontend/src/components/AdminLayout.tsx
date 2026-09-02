import { History, LogOut, Menu, UserCog } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { adminApiClient } from '../api/client'

// Fully separate from components/Layout.tsx (the HR/candidate shell) — the
// admin panel is its own portal: own token (admin_access_token), own nav,
// own header. No shared route or component with /hr/* by design.

interface AdminUser {
  id: number
  full_name: string
  email: string
}

const ADMIN_SIDEBAR_ITEMS = [
  { to: '/admin/employees', label: 'Çalışanlar', icon: UserCog },
  { to: '/admin/audit-log', label: 'İşlem Geçmişi', icon: History },
]

const NAV_ITEM_CLASSES = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
    isActive ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
  }`

function initialsOf(fullName: string): string {
  return fullName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  const location = useLocation()
  const navigate = useNavigate()
  const [me, setMe] = useState<AdminUser | null>(null)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  useEffect(() => {
    adminApiClient
      .get<AdminUser>('/users/me')
      .then((res) => setMe(res.data))
      .catch(() => {
        // Non-fatal — the sidebar just falls back to no name/initials.
      })
  }, [])

  useEffect(() => {
    document.title = 'KOTON-HR · Yönetici'
  }, [])

  useEffect(() => {
    setMobileNavOpen(false)
  }, [location.pathname])

  function handleLogout() {
    localStorage.removeItem('admin_access_token')
    navigate('/admin/login')
  }

  function nav(onNavigate?: () => void) {
    return (
      <>
        {me && (
          <div className="mb-4 flex items-center gap-2 border-b border-slate-800 pb-4">
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-indigo-600 text-sm font-semibold text-white">
              {initialsOf(me.full_name)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-100">{me.full_name}</p>
              <p className="truncate text-xs text-slate-500">Sistem Yöneticisi</p>
            </div>
          </div>
        )}
        <nav className="space-y-1">
          {ADMIN_SIDEBAR_ITEMS.map((item) => (
            <NavLink key={item.to} to={item.to} onClick={onNavigate} className={NAV_ITEM_CLASSES}>
              <item.icon className="h-4 w-4 flex-shrink-0" />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-4 border-t border-slate-800 pt-4">
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-slate-100"
          >
            <LogOut className="h-4 w-4 flex-shrink-0" />
            Çıkış Yap
          </button>
        </div>
      </>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <header className="border-b border-slate-800 bg-slate-900 px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center gap-4">
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            className="rounded p-1 text-slate-300 hover:bg-slate-800 md:hidden"
            aria-label="Menüyü aç"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
            AI
          </span>
          <h1 className="text-lg font-semibold text-slate-100">KOTON-HR · Yönetici</h1>
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl gap-6 px-6 py-8">
        <aside className="hidden w-56 flex-shrink-0 md:block">{nav()}</aside>

        {mobileNavOpen && (
          <div className="fixed inset-0 z-50 md:hidden">
            <div className="absolute inset-0 bg-black/40" onClick={() => setMobileNavOpen(false)} />
            <div className="absolute left-0 top-0 h-full w-64 overflow-y-auto bg-slate-900 p-4 shadow-lg">
              {nav(() => setMobileNavOpen(false))}
            </div>
          </div>
        )}

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  )
}
