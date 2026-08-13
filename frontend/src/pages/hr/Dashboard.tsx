import { CheckCircle2, FileText, Star, Users, Video } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import apiClient from '../../api/client'
import DonutChart from '../../components/DonutChart'
import HrStatusBadge from '../../components/HrStatusBadge'
import RecommendationBadge from '../../components/RecommendationBadge'
import StatCard from '../../components/StatCard'
import type { Candidate, InterviewSession, Job } from '../../types'

const ACTIVE_STATUSES = new Set(['in_progress', 'awaiting_review'])
const RECENT_COUNT = 5

interface HrUser {
  full_name: string
}

// True (this-calendar-month) vs (previous-calendar-month), used to compute
// every trend delta below — not a rolling 30-day window.
function isInMonth(iso: string | null | undefined, monthsAgo: number): boolean {
  if (!iso) return false
  const d = new Date(iso)
  const now = new Date()
  const target = new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1)
  return d.getFullYear() === target.getFullYear() && d.getMonth() === target.getMonth()
}

// null (not a delta of 0) means "no prior-month baseline" — avoids showing
// a misleading/infinite percentage when last month's count was zero.
function pctDelta(thisMonth: number, lastMonth: number): number | null {
  if (lastMonth === 0) return null
  return ((thisMonth - lastMonth) / lastMonth) * 100
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [candidates, setCandidates] = useState<Candidate[] | null>(null)
  const [sessions, setSessions] = useState<InterviewSession[] | null>(null)
  const [jobs, setJobs] = useState<Job[]>([])
  const [hrUser, setHrUser] = useState<HrUser | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      apiClient.get<Candidate[]>('/candidates'),
      apiClient.get<InterviewSession[]>('/interviews'),
      apiClient.get<Job[]>('/jobs'),
      apiClient.get<HrUser>('/users/me'),
    ])
      .then(([candidatesRes, sessionsRes, jobsRes, meRes]) => {
        setCandidates(candidatesRes.data)
        setSessions(sessionsRes.data)
        setJobs(jobsRes.data)
        setHrUser(meRes.data)
      })
      .catch(() => setError('Kontrol paneli verileri yüklenemedi.'))
  }, [])

  const jobById = useMemo(() => new Map(jobs.map((j) => [j.id, j])), [jobs])
  const candidateById = useMemo(
    () => new Map((candidates ?? []).map((c) => [c.id, c])),
    [candidates],
  )

  if (error) return <p className="text-sm font-medium text-rose-400">{error}</p>
  if (!candidates || !sessions) return <p className="text-sm text-slate-500">Kontrol paneli yükleniyor...</p>

  const activeInterviews = sessions.filter((s) => ACTIVE_STATUSES.has(s.status)).length
  const completedInterviews = sessions.filter((s) => s.status === 'completed').length
  const reportsGenerated = sessions.filter((s) => s.report_created_at != null).length
  const scores = sessions.map((s) => s.overall_score).filter((s): s is number => s != null)
  const averageScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null

  const candidatesThisMonth = candidates.filter((c) => isInMonth(c.created_at, 0)).length
  const candidatesLastMonth = candidates.filter((c) => isInMonth(c.created_at, 1)).length
  const sessionsThisMonth = sessions.filter((s) => isInMonth(s.created_at, 0)).length
  const sessionsLastMonth = sessions.filter((s) => isInMonth(s.created_at, 1)).length
  const reportsThisMonth = sessions.filter((s) => isInMonth(s.report_created_at, 0)).length
  const reportsLastMonth = sessions.filter((s) => isInMonth(s.report_created_at, 1)).length

  function averageScoreIn(monthsAgo: number): number | null {
    const values = sessions!
      .filter((s) => isInMonth(s.report_created_at, monthsAgo) && s.overall_score != null)
      .map((s) => s.overall_score as number)
    return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null
  }
  const avgScoreThisMonth = averageScoreIn(0)
  const avgScoreLastMonth = averageScoreIn(1)

  const cards = [
    {
      label: 'Toplam Aday',
      value: candidates.length,
      icon: Users,
      iconClassName: 'bg-indigo-500/15 text-indigo-400',
      deltaPct: pctDelta(candidatesThisMonth, candidatesLastMonth),
    },
    {
      label: 'Aktif Mülakatlar',
      value: activeInterviews,
      icon: Video,
      iconClassName: 'bg-violet-500/15 text-violet-400',
      deltaPct: pctDelta(sessionsThisMonth, sessionsLastMonth),
    },
    {
      label: 'Tamamlanan Mülakatlar',
      value: completedInterviews,
      icon: CheckCircle2,
      iconClassName: 'bg-emerald-500/15 text-emerald-400',
      deltaPct: pctDelta(sessionsThisMonth, sessionsLastMonth),
    },
    {
      label: 'Oluşturulan Raporlar',
      value: reportsGenerated,
      icon: FileText,
      iconClassName: 'bg-sky-500/15 text-sky-400',
      deltaPct: pctDelta(reportsThisMonth, reportsLastMonth),
    },
    {
      label: 'Ortalama Puan',
      value: averageScore != null ? `${averageScore}/100` : '—',
      icon: Star,
      iconClassName: 'bg-amber-500/15 text-amber-400',
      deltaPct: avgScoreThisMonth != null && avgScoreLastMonth != null ? pctDelta(avgScoreThisMonth, avgScoreLastMonth) : null,
    },
  ]

  const reportStatusSegments = [
    { label: 'Tamamlandı', value: sessions.filter((s) => s.status === 'completed').length, colorClass: 'text-emerald-400' },
    { label: 'Devam Ediyor', value: sessions.filter((s) => ACTIVE_STATUSES.has(s.status)).length, colorClass: 'text-violet-400' },
    { label: 'Beklemede', value: sessions.filter((s) => s.status === 'pending').length, colorClass: 'text-slate-400' },
  ]

  const recentInterviews = sessions
    .slice()
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, RECENT_COUNT)

  const recentCandidates = candidates
    .slice()
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, RECENT_COUNT)

  return (
    <div>
      <h2 className="text-xl font-semibold text-slate-100">
        Günaydın{hrUser ? `, ${hrUser.full_name.split(' ')[0]}` : ''} 👋
      </h2>
      <p className="mt-1 text-sm text-slate-500">Bugün mülakatlarınızda neler oluyor, işte özet.</p>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {cards.map((card) => (
          <StatCard key={card.label} {...card} />
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 items-start gap-4 xl:grid-cols-[1fr_1fr_1.2fr]">
        <div className="rounded-xl border border-slate-800 bg-slate-900 shadow-sm xl:col-span-1">
          <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
            <h3 className="text-sm font-medium text-slate-100">Son Mülakatlar</h3>
            <Link to="/hr/interviews" className="text-xs font-medium text-indigo-400 hover:text-indigo-300">
              Tümünü gör →
            </Link>
          </div>
          {recentInterviews.length === 0 ? (
            <p className="px-5 py-6 text-sm text-slate-500">Henüz mülakat yok.</p>
          ) : (
            <ul className="divide-y divide-slate-800">
              {recentInterviews.map((s) => {
                const candidate = candidateById.get(s.candidate_id)
                const job = jobById.get(s.job_id)
                return (
                  <li
                    key={s.id}
                    className="cursor-pointer px-5 py-3 hover:bg-slate-800/60"
                    onClick={() => navigate(`/hr/interviews/${s.id}`)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium text-slate-100">{candidate?.full_name ?? '—'}</p>
                      <HrStatusBadge status={s.status} />
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-2 text-xs text-slate-500">
                      <span className="truncate">{job?.title ?? '—'}</span>
                      <span>{new Date(s.created_at).toLocaleDateString()}</span>
                    </div>
                    {(s.overall_score != null || s.recommendation) && (
                      <div className="mt-1.5 flex items-center gap-2">
                        {s.overall_score != null && <span className="text-xs text-slate-400">{s.overall_score}/100</span>}
                        {s.recommendation && <RecommendationBadge recommendation={s.recommendation} />}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900 shadow-sm xl:col-span-1">
          <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
            <h3 className="text-sm font-medium text-slate-100">Son Adaylar</h3>
            <Link to="/hr/candidates" className="text-xs font-medium text-indigo-400 hover:text-indigo-300">
              Tüm adayları gör →
            </Link>
          </div>
          {recentCandidates.length === 0 ? (
            <p className="px-5 py-6 text-sm text-slate-500">Henüz aday yok.</p>
          ) : (
            <ul className="divide-y divide-slate-800">
              {recentCandidates.map((c) => (
                <li key={c.id}>
                  <Link
                    to={`/hr/candidates/${c.id}`}
                    className="flex items-center justify-between gap-2 px-5 py-3 hover:bg-slate-800/60"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-100">{c.full_name}</p>
                      <p className="truncate text-xs text-slate-500">{jobById.get(c.job_id)?.title ?? '—'}</p>
                    </div>
                    <span className="flex-shrink-0 text-xs text-slate-500">
                      {new Date(c.created_at).toLocaleDateString()}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="self-start rounded-xl border border-slate-800 bg-slate-900 p-5 shadow-sm xl:col-span-1">
          <h3 className="mb-4 text-sm font-medium text-slate-100">Rapor Durumu</h3>
          <DonutChart segments={reportStatusSegments} centerLabel="Toplam" />
        </div>
      </div>
    </div>
  )
}
