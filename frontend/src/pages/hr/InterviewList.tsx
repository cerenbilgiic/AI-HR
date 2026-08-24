import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import apiClient from '../../api/client'
import HrStatusBadge from '../../components/HrStatusBadge'
import Pagination from '../../components/Pagination'
import RecommendationBadge, { effectiveRecommendation } from '../../components/RecommendationBadge'
import { useEvaluationsVersion } from '../../hooks/useEvaluationsVersion'
import type { Candidate, InterviewSession, Job } from '../../types'
import { evaluateSession, isEvaluating } from '../../utils/evaluationTracker'

const PAGE_SIZE = 15

export default function InterviewList() {
  const navigate = useNavigate()
  const [sessions, setSessions] = useState<InterviewSession[] | null>(null)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [positionFilter, setPositionFilter] = useState('all')
  const [evaluateError, setEvaluateError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  useEvaluationsVersion()

  function loadSessions() {
    return apiClient.get<InterviewSession[]>('/interviews').then((res) => setSessions(res.data))
  }

  useEffect(() => {
    Promise.all([
      apiClient.get<InterviewSession[]>('/interviews'),
      apiClient.get<Candidate[]>('/candidates'),
      apiClient.get<Job[]>('/jobs'),
    ])
      .then(([sessionsRes, candidatesRes, jobsRes]) => {
        setSessions(sessionsRes.data)
        setCandidates(candidatesRes.data)
        setJobs(jobsRes.data)
      })
      .catch(() => setError('Mülakatlar yüklenemedi.'))
  }, [])

  async function evaluate(sessionId: number) {
    setEvaluateError(null)
    try {
      // generate-report (not the older evaluate) is what actually produces
      // overall_score/competency_scores — see JobDetail.tsx's identical
      // evaluate() for why. Re-fetches in place (no navigation) so HR can
      // keep evaluating other rows in this same list. evaluateSession
      // tracks the in-progress state globally (not just local state), so
      // it survives navigating to another sidebar tab and back too.
      await evaluateSession(sessionId)
      await loadSessions()
    } catch {
      setEvaluateError('Bu mülakat değerlendirilemedi. Lütfen tekrar deneyin.')
    }
  }

  const candidateById = useMemo(() => new Map(candidates.map((c) => [c.id, c])), [candidates])
  const jobById = useMemo(() => new Map(jobs.map((j) => [j.id, j])), [jobs])

  const rows = useMemo(() => {
    if (!sessions) return []
    let result = sessions.map((session) => ({
      session,
      candidate: candidateById.get(session.candidate_id),
      job: jobById.get(session.job_id),
    }))

    if (search.trim()) {
      const q = search.trim().toLowerCase()
      result = result.filter((r) => r.candidate?.full_name.toLowerCase().includes(q))
    }
    if (statusFilter !== 'all') {
      result = result.filter((r) => r.session.status === statusFilter)
    }
    if (positionFilter !== 'all') {
      result = result.filter((r) => String(r.session.job_id) === positionFilter)
    }
    return result.sort((a, b) => new Date(b.session.created_at).getTime() - new Date(a.session.created_at).getTime())
  }, [sessions, candidateById, jobById, search, statusFilter, positionFilter])

  useEffect(() => {
    setPage(1)
  }, [search, statusFilter, positionFilter])

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  if (error) return <p className="text-sm font-medium text-rose-400">{error}</p>
  if (!sessions) return <p className="text-sm text-slate-500">Mülakatlar yükleniyor...</p>

  return (
    <div>
      <h2 className="mb-6 text-xl font-semibold text-slate-100">Mülakatlar</h2>

      <div className="mb-4 flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Aday adına göre ara"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-64 rounded border border-slate-700 bg-slate-800 text-slate-200 placeholder:text-slate-500 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded border border-slate-700 bg-slate-800 text-slate-200 placeholder:text-slate-500 px-2 py-1.5 text-sm"
        >
          <option value="all">Tüm durumlar</option>
          <option value="in_progress">Devam Ediyor</option>
          <option value="awaiting_review">Değerlendiriliyor</option>
          <option value="completed">Değerlendirildi</option>
          <option value="terminated">Sonlandırıldı</option>
        </select>
        <select
          value={positionFilter}
          onChange={(e) => setPositionFilter(e.target.value)}
          className="rounded border border-slate-700 bg-slate-800 text-slate-200 placeholder:text-slate-500 px-2 py-1.5 text-sm"
        >
          <option value="all">Tüm pozisyonlar</option>
          {jobs.map((j) => (
            <option key={j.id} value={j.id}>
              {j.title}
            </option>
          ))}
        </select>
      </div>

      {evaluateError && <p className="mb-3 text-sm font-medium text-rose-400">{evaluateError}</p>}

      <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900 shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-800 bg-slate-800/50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Aday</th>
              <th className="px-4 py-3">Pozisyon</th>
              <th className="px-4 py-3">Tarih</th>
              <th className="px-4 py-3">Durum</th>
              <th className="px-4 py-3">Puan</th>
              <th className="px-4 py-3">Tavsiye</th>
              <th className="px-4 py-3">İşlemler</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {pageRows.map(({ session, candidate, job }) => (
              <tr key={session.id} className="hover:bg-slate-800">
                <td className="px-4 py-3 text-slate-100">{candidate?.full_name ?? 'Bilinmiyor'}</td>
                <td className="px-4 py-3 text-slate-300">{job?.title ?? '—'}</td>
                <td className="px-4 py-3 text-slate-300">{new Date(session.created_at).toLocaleDateString()}</td>
                <td className="px-4 py-3"><HrStatusBadge status={session.status} /></td>
                <td className="px-4 py-3 text-slate-300">{session.overall_score ?? '—'}</td>
                <td className="px-4 py-3">
                  {effectiveRecommendation(session) ? (
                    <RecommendationBadge recommendation={effectiveRecommendation(session)!} />
                  ) : (
                    '—'
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    {session.status === 'awaiting_review' && (
                      <button
                        onClick={() => void evaluate(session.id)}
                        disabled={isEvaluating(session.id)}
                        className="rounded bg-indigo-600 px-2 py-1 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
                      >
                        {isEvaluating(session.id) ? 'Değerlendiriliyor…' : 'Değerlendir'}
                      </button>
                    )}
                    <button
                      onClick={() => navigate(`/hr/interviews/${session.id}`)}
                      className="rounded border border-slate-700 px-2 py-1 text-xs font-medium text-slate-100 hover:bg-slate-800"
                    >
                      Görüntüle
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-sm text-slate-500">
                  Mülakat bulunamadı.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Pagination page={page} totalPages={totalPages} onChange={setPage} />
    </div>
  )
}
