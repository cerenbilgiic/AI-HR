import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import apiClient, { candidateApiClient } from '../api/client'
import type { Candidate } from '../types'

interface HrUser {
  id: number
  email: string
  full_name: string
  role: string
}

const HR_ROLE_LABELS: Record<string, string> = {
  hr: 'HR Manager',
  admin: 'Administrator',
}

const HR_SIDEBAR_ITEMS = [
  { to: '/hr/dashboard', label: 'Dashboard', icon: '📊' },
  { to: '/hr/candidates', label: 'Candidates', icon: '👥' },
  { to: '/hr/interviews', label: 'Interviews', icon: '🎥' },
  { to: '/hr/jobs', label: 'Job Positions', icon: '💼' },
  { to: '/hr/reports', label: 'Reports', icon: '📈' },
  { to: '/hr/notifications', label: 'Notifications', icon: '🔔' },
  { to: '/hr/profile', label: 'My Profile', icon: '👤' },
  { to: '/hr/settings', label: 'Settings', icon: '⚙️' },
]

const CANDIDATE_SIDEBAR_ITEMS = [
  { suffix: '/home', label: 'Dashboard', icon: '🏠' },
  { suffix: '/home/applications', label: 'Başvurularım', icon: '📋' },
  { suffix: '/home/interviews', label: 'Mülakatlarım', icon: '🎥' },
  { suffix: '/home/completed', label: 'Mülakat Geçmişi', icon: '📜' },
  { suffix: '/home/results', label: 'Sonuçlarım', icon: '✅' },
  { suffix: '/home/profile', label: 'Profilim', icon: '👤' },
  { suffix: '/home/notifications', label: 'Bildirimler', icon: '🔔' },
  { suffix: '/home/settings', label: 'Ayarlar', icon: '⚙️' },
]

function initialsOf(fullName: string): string {
  return fullName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}

export default function Layout({ children }: { children: ReactNode }) {
  const location = useLocation()
  const navigate = useNavigate()

  // HR (dark sidebar, English) and candidate (light sidebar, Turkish) get
  // deliberately distinct visual treatments — "visually separate dashboards"
  // — both driven by the same conditional-on-pathname approach.
  const showHrSidebar = location.pathname.startsWith('/hr') && location.pathname !== '/hr/login'
  const candidateDashboardMatch = location.pathname.match(/^\/interview\/([^/]+)\/home/)
  const candidateId = candidateDashboardMatch?.[1]

  const [candidate, setCandidate] = useState<Candidate | null>(null)
  const [hrUser, setHrUser] = useState<HrUser | null>(null)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  useEffect(() => {
    if (!candidateId) return
    candidateApiClient
      .get<Candidate>('/candidates/me')
      .then((res) => setCandidate(res.data))
      .catch(() => {
        // Non-fatal — the sidebar just falls back to no name/initials.
      })
  }, [candidateId])

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

  function handleCandidateLogout() {
    localStorage.removeItem('candidate_access_token')
    navigate('/interview/login')
  }

  function handleHrLogout() {
    localStorage.removeItem('access_token')
    navigate('/hr/login')
  }

  function candidateNav(onNavigate?: () => void) {
    return (
      <>
        {candidate && (
          <div className="mb-4 flex items-center gap-2 border-b border-gray-100 pb-4">
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-indigo-600 text-sm font-semibold text-white">
              {initialsOf(candidate.full_name)}
            </span>
            <span className="truncate text-sm font-medium text-gray-900">{candidate.full_name}</span>
          </div>
        )}
        <nav className="space-y-1">
          {CANDIDATE_SIDEBAR_ITEMS.map((item) => (
            <NavLink
              key={item.suffix}
              to={`/interview/${candidateId}${item.suffix}`}
              end={item.suffix === '/home'}
              onClick={onNavigate}
              className={({ isActive }) =>
                `block rounded px-3 py-2 text-sm font-medium ${
                  isActive ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-100'
                }`
              }
            >
              <span className="mr-2">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-4 border-t border-gray-100 pt-4">
          <button
            type="button"
            onClick={handleCandidateLogout}
            className="block w-full rounded px-3 py-2 text-left text-sm font-medium text-red-600 hover:bg-red-50"
          >
            <span className="mr-2">🚪</span>
            Çıkış Yap
          </button>
        </div>
      </>
    )
  }

  function hrNav(onNavigate?: () => void) {
    return (
      <>
        {hrUser && (
          <div className="mb-4 flex items-center gap-2 border-b border-slate-700 pb-4">
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-indigo-500 text-sm font-semibold text-white">
              {initialsOf(hrUser.full_name)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-white">{hrUser.full_name}</p>
              <p className="truncate text-xs text-slate-400">{HR_ROLE_LABELS[hrUser.role] ?? hrUser.role}</p>
            </div>
          </div>
        )}
        <nav className="space-y-1">
          {HR_SIDEBAR_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              className={({ isActive }) =>
                `block rounded px-3 py-2 text-sm font-medium ${
                  isActive ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-slate-800'
                }`
              }
            >
              <span className="mr-2">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-4 border-t border-slate-700 pt-4">
          <button
            type="button"
            onClick={handleHrLogout}
            className="block w-full rounded px-3 py-2 text-left text-sm font-medium text-red-400 hover:bg-slate-800"
          >
            <span className="mr-2">🚪</span>
            Logout
          </button>
        </div>
      </>
    )
  }

  const sidebarActive = Boolean(candidateId) || showHrSidebar

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50/60 via-gray-50 to-gray-50">
      <header className="border-b border-gray-200 bg-white/80 px-6 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-2">
          {sidebarActive && (
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="mr-1 rounded p-1 text-gray-600 hover:bg-gray-100 md:hidden"
              aria-label={candidateId ? 'Menüyü aç' : 'Open menu'}
            >
              ☰
            </button>
          )}
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
            AI
          </span>
          <h1 className="text-lg font-semibold text-gray-900">AI-HR</h1>
        </div>
      </header>
      {candidateId ? (
        <div className="mx-auto flex max-w-5xl gap-6 px-6 py-8">
          <aside className="hidden w-56 flex-shrink-0 md:block">{candidateNav()}</aside>

          {mobileNavOpen && (
            <div className="fixed inset-0 z-50 md:hidden">
              <div className="absolute inset-0 bg-black/40" onClick={() => setMobileNavOpen(false)} />
              <div className="absolute left-0 top-0 h-full w-64 overflow-y-auto bg-white p-4 shadow-lg">
                {candidateNav(() => setMobileNavOpen(false))}
              </div>
            </div>
          )}

          <main className="min-w-0 flex-1">{children}</main>
        </div>
      ) : showHrSidebar ? (
        <div className="mx-auto flex max-w-6xl gap-6 px-6 py-8">
          <aside className="hidden w-60 flex-shrink-0 rounded-xl bg-slate-900 p-4 md:block">{hrNav()}</aside>

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
