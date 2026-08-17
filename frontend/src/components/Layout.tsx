import {
  Bell,
  Briefcase,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Search,
  Settings as SettingsIcon,
  User,
  UserCog,
  Users,
  Video,
} from 'lucide-react'
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import apiClient from '../api/client'
import { useUnreadNotificationCount } from '../hooks/useUnreadNotificationCount'
import { ROLE_LABELS } from '../utils/roles'

interface HrUser {
  id: number
  email: string
  full_name: string
  role: string
}

const HR_SIDEBAR_ITEMS = [
  { to: '/hr/dashboard', label: 'Kontrol Paneli', icon: LayoutDashboard },
  { to: '/hr/candidates', label: 'Adaylar', icon: Users },
  { to: '/hr/interviews', label: 'Mülakatlar', icon: Video },
  { to: '/hr/jobs', label: 'İş İlanları', icon: Briefcase },
  { to: '/hr/reports', label: 'Raporlar', icon: FileText },
  // hr_manager-only now — admin manages employees (and audit log) from its
  // own separate /admin/* panel, see components/AdminLayout.tsx. Still
  // backend-enforced too (get_current_manager), this is just UX politeness.
  { to: '/hr/employees', label: 'Çalışanlar', icon: UserCog, roles: ['hr_manager'] },
  { to: '/hr/notifications', label: 'Bildirimler', icon: Bell },
  { to: '/hr/profile', label: 'Profilim', icon: User },
  { to: '/hr/settings', label: 'Ayarlar', icon: SettingsIcon },
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

// The HR/candidate portal shell. The candidate side has no dashboard or
// sidebar anymore — a candidate only ever visits consent/avatar/interview
// pages reached via a one-time emailed link (see pages/candidate/EnterInterview.tsx),
// so those render through the plain centered branch below, same as any
// other chrome-less page. The admin portal is a fully separate shell
// (components/AdminLayout.tsx) and never renders this component at all.
export default function Layout({ children }: { children: ReactNode }) {
  const location = useLocation()
  const navigate = useNavigate()

  const showHrSidebar = location.pathname.startsWith('/hr') && location.pathname !== '/hr/login'
  // The candidate workspace is a 3-panel master-detail-detail layout that
  // needs real horizontal room — every other HR page (tables, forms) reads
  // better narrower, so only this one gets the wider container.
  const isWorkspaceRoute =
    location.pathname === '/hr/candidates' || /^\/hr\/candidates\/\d+$/.test(location.pathname)

  const [hrUser, setHrUser] = useState<HrUser | null>(null)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const unreadCount = useUnreadNotificationCount(showHrSidebar)

  useEffect(() => {
    if (!showHrSidebar) return
    apiClient
      .get<HrUser>('/users/me')
      .then((res) => setHrUser(res.data))
      .catch(() => {
        // Non-fatal — the sidebar just falls back to no name/initials.
      })
  }, [showHrSidebar])

  useEffect(() => {
    setMobileNavOpen(false)
  }, [location.pathname])

  // Distinct browser-tab titles per portal — so the İK and aday login pages
  // are tellable apart when open in separate tabs. The admin portal never
  // renders this component at all (see App.tsx's AppShell / AdminLayout),
  // so there's no /admin case to handle here.
  useEffect(() => {
    if (location.pathname.startsWith('/hr')) {
      document.title = 'AI-HR · İK Paneli'
    } else if (location.pathname.startsWith('/interview')) {
      document.title = 'AI-HR · Aday Paneli'
    } else {
      document.title = 'AI-HR'
    }
  }, [location.pathname])

  function handleHrLogout() {
    localStorage.removeItem('access_token')
    navigate('/hr/login')
  }

  function handleSearchSubmit(e: FormEvent) {
    e.preventDefault()
    navigate(`/hr/candidates${searchQuery.trim() ? `?q=${encodeURIComponent(searchQuery.trim())}` : ''}`)
  }

  function hrNav(onNavigate?: () => void) {
    return (
      <>
        {hrUser && (
          <div className="mb-4 flex items-center gap-2 border-b border-slate-800 pb-4">
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-indigo-600 text-sm font-semibold text-white">
              {initialsOf(hrUser.full_name)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-100">{hrUser.full_name}</p>
              <p className="truncate text-xs text-slate-500">{ROLE_LABELS[hrUser.role] ?? hrUser.role}</p>
            </div>
          </div>
        )}
        <nav className="space-y-1">
          {HR_SIDEBAR_ITEMS.filter((item) => !item.roles || item.roles.includes(hrUser?.role ?? '')).map((item) => (
            <NavLink key={item.to} to={item.to} onClick={onNavigate} className={NAV_ITEM_CLASSES}>
              <item.icon className="h-4 w-4 flex-shrink-0" />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-4 border-t border-slate-800 pt-4">
          <button
            type="button"
            onClick={handleHrLogout}
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
        <div className={`mx-auto flex items-center gap-4 ${showHrSidebar ? 'max-w-6xl' : 'max-w-5xl'}`}>
          {showHrSidebar && (
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="rounded p-1 text-slate-300 hover:bg-slate-800 md:hidden"
              aria-label="Menüyü aç"
            >
              <Menu className="h-5 w-5" />
            </button>
          )}
          <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
            AI
          </span>
          <h1 className="text-lg font-semibold text-slate-100">AI-HR</h1>

          {showHrSidebar && (
            <div className="ml-auto flex items-center gap-3">
              <form onSubmit={handleSearchSubmit} className="relative hidden sm:block">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Aday ara..."
                  className="w-52 rounded-lg border border-slate-700 bg-slate-800 py-1.5 pl-8 pr-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </form>
              <button
                type="button"
                onClick={() => navigate('/hr/notifications')}
                className="relative rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
                aria-label="Bildirimler"
              >
                <Bell className="h-5 w-5" />
                {unreadCount > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>
            </div>
          )}
        </div>
      </header>
      {showHrSidebar ? (
        <div className={`mx-auto flex gap-6 px-6 py-8 ${isWorkspaceRoute ? 'max-w-[1680px]' : 'max-w-6xl'}`}>
          <aside className="hidden w-56 flex-shrink-0 md:block">{hrNav()}</aside>

          {mobileNavOpen && (
            <div className="fixed inset-0 z-50 md:hidden">
              <div className="absolute inset-0 bg-black/40" onClick={() => setMobileNavOpen(false)} />
              <div className="absolute left-0 top-0 h-full w-64 overflow-y-auto bg-slate-900 p-4 shadow-lg">
                {hrNav(() => setMobileNavOpen(false))}
              </div>
            </div>
          )}

          <main className="min-w-0 flex-1">{children}</main>
        </div>
      ) : (
        <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
      )}
    </div>
  )
}
