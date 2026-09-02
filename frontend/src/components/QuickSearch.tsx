import { Briefcase, Search, Users } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import apiClient from '../api/client'
import type { Candidate, Job } from '../types'

const MAX_RESULTS_PER_GROUP = 5

// Header search used to be an always-open "Aday ara..." input that only
// ever searched candidates (submitting navigated to /hr/candidates?q=...).
// Replaced with an icon button that opens this general-purpose panel —
// same idea, but covers more than one entity type and doesn't take up
// permanent header space. Candidates/jobs are fetched once, lazily, on
// first open (small seeded datasets — a few dozen rows — so one GET each
// is cheap and avoids a dedicated backend search endpoint).
export default function QuickSearch() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [candidates, setCandidates] = useState<Candidate[] | null>(null)
  const [jobs, setJobs] = useState<Job[] | null>(null)
  const [loading, setLoading] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  function openSearch() {
    setOpen(true)
    if (candidates === null && jobs === null) {
      setLoading(true)
      Promise.all([apiClient.get<Candidate[]>('/candidates'), apiClient.get<Job[]>('/jobs')])
        .then(([candidatesRes, jobsRes]) => {
          setCandidates(candidatesRes.data)
          setJobs(jobsRes.data)
        })
        .catch(() => {
          // Non-fatal — the panel just shows "sonuç bulunamadı" either way.
          setCandidates([])
          setJobs([])
        })
        .finally(() => setLoading(false))
    }
  }

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => inputRef.current?.focus())
    } else {
      setQuery('')
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    function handlePointerDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  const q = query.trim().toLowerCase()
  const matchedCandidates = q
    ? (candidates ?? [])
        .filter((c) => c.full_name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q))
        .slice(0, MAX_RESULTS_PER_GROUP)
    : []
  const matchedJobs = q ? (jobs ?? []).filter((j) => j.title.toLowerCase().includes(q)).slice(0, MAX_RESULTS_PER_GROUP) : []
  const hasResults = matchedCandidates.length > 0 || matchedJobs.length > 0

  function goTo(path: string) {
    navigate(path)
    setOpen(false)
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openSearch())}
        className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
        aria-label="Ara"
      >
        <Search className="h-5 w-5" />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-40 mt-2 w-80 rounded-xl border border-slate-800 bg-slate-900 p-3 shadow-lg shadow-black/30">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Aday veya iş ilanı ara..."
              className="w-full rounded-lg border border-slate-700 bg-slate-800 py-1.5 pl-8 pr-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div className="mt-2 max-h-80 overflow-y-auto">
            {loading && <p className="px-2 py-3 text-center text-xs text-slate-500">Yükleniyor…</p>}
            {!loading && q && !hasResults && (
              <p className="px-2 py-3 text-center text-xs text-slate-500">Sonuç bulunamadı.</p>
            )}
            {!loading && !q && (
              <p className="px-2 py-3 text-center text-xs text-slate-500">Aday adı, e-posta veya iş ilanı yazın.</p>
            )}

            {matchedCandidates.length > 0 && (
              <div className="mb-2">
                <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Adaylar</p>
                {matchedCandidates.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => goTo(`/hr/candidates/${c.id}`)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-slate-200 hover:bg-slate-800"
                  >
                    <Users className="h-3.5 w-3.5 flex-shrink-0 text-slate-500" />
                    <span className="truncate">{c.full_name}</span>
                  </button>
                ))}
              </div>
            )}

            {matchedJobs.length > 0 && (
              <div>
                <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">İş İlanları</p>
                {matchedJobs.map((j) => (
                  <button
                    key={j.id}
                    type="button"
                    onClick={() => goTo(`/hr/jobs/${j.id}`)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-slate-200 hover:bg-slate-800"
                  >
                    <Briefcase className="h-3.5 w-3.5 flex-shrink-0 text-slate-500" />
                    <span className="truncate">{j.title}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
