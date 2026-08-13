import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import apiClient from '../../api/client'
import RecommendationBadge from '../../components/RecommendationBadge'
import type { Candidate, InterviewSession, Job } from '../../types'

const MAX_COMPARE = 4

export default function Reports() {
  const navigate = useNavigate()
  const [sessions, setSessions] = useState<InterviewSession[] | null>(null)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [error, setError] = useState<string | null>(null)

  const [positionFilter, setPositionFilter] = useState('all')
  const [recommendationFilter, setRecommendationFilter] = useState('all')
  const [minScore, setMinScore] = useState('')

  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

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
      .catch(() => setError('Raporlar yüklenemedi.'))
  }, [])

  const candidateById = useMemo(() => new Map(candidates.map((c) => [c.id, c])), [candidates])
  const jobById = useMemo(() => new Map(jobs.map((j) => [j.id, j])), [jobs])

  const rows = useMemo(() => {
    if (!sessions) return []
    let result = sessions
      .filter((s) => s.overall_score != null)
      .map((session) => ({
        session,
        candidate: candidateById.get(session.candidate_id),
        job: jobById.get(session.job_id),
      }))

    if (positionFilter !== 'all') {
      result = result.filter((r) => String(r.session.job_id) === positionFilter)
    }
    if (recommendationFilter !== 'all') {
      result = result.filter((r) => r.session.recommendation === recommendationFilter)
    }
    if (minScore.trim()) {
      const min = Number(minScore)
      result = result.filter((r) => (r.session.overall_score ?? 0) >= min)
    }
    return result.sort((a, b) => new Date(b.session.updated_at).getTime() - new Date(a.session.updated_at).getTime())
  }, [sessions, candidateById, jobById, positionFilter, recommendationFilter, minScore])

  function toggleSelected(sessionId: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(sessionId)) next.delete(sessionId)
      else next.add(sessionId)
      return next
    })
  }

  function handleCompare() {
    navigate(`/hr/reports/compare?sessions=${Array.from(selected).join(',')}`)
  }

  async function handleExportZip() {
    setExporting(true)
    setExportError(null)
    try {
      const res = await apiClient.post('/reports/export', Array.from(selected), { responseType: 'blob' })
      const blobUrl = URL.createObjectURL(res.data)
      const link = document.createElement('a')
      link.href = blobUrl
      link.download = 'interview_reports.zip'
      link.click()
      URL.revokeObjectURL(blobUrl)
    } catch {
      setExportError('Raporlar indirilemedi. Lütfen tekrar deneyin.')
    } finally {
      setExporting(false)
    }
  }

  if (error) return <p className="text-sm font-medium text-rose-400">{error}</p>
  if (!sessions) return <p className="text-sm text-slate-500">Raporlar yükleniyor...</p>

  return (
    <div>
      <h2 className="mb-6 text-xl font-semibold text-slate-100">Raporlar</h2>

      <div className="mb-4 flex flex-wrap gap-3">
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
        <select
          value={recommendationFilter}
          onChange={(e) => setRecommendationFilter(e.target.value)}
          className="rounded border border-slate-700 bg-slate-800 text-slate-200 placeholder:text-slate-500 px-2 py-1.5 text-sm"
        >
          <option value="all">Tüm tavsiyeler</option>
          <option value="recommended">Olumlu</option>
          <option value="maybe">Belirsiz</option>
          <option value="not_recommended">Olumsuz</option>
        </select>
        <input
          type="number"
          min={0}
          max={100}
          placeholder="Min. puan"
          value={minScore}
          onChange={(e) => setMinScore(e.target.value)}
          className="w-28 rounded border border-slate-700 bg-slate-800 text-slate-200 placeholder:text-slate-500 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>

      {selected.size > 0 && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-indigo-500/10 px-4 py-2 text-sm">
          <span className="text-indigo-300">{selected.size} seçildi</span>
          <div className="flex items-center gap-2">
            {selected.size < 2 || selected.size > MAX_COMPARE ? (
              <span className="text-xs text-slate-500">Karşılaştırmak için 2-{MAX_COMPARE} rapor seçin</span>
            ) : (
              <button
                onClick={handleCompare}
                className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
              >
                Karşılaştır
              </button>
            )}
            <button
              onClick={() => void handleExportZip()}
              disabled={exporting}
              className="rounded border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-50"
            >
              {exporting ? 'Hazırlanıyor…' : 'ZIP İndir'}
            </button>
          </div>
        </div>
      )}
      {exportError && <p className="mb-3 text-sm font-medium text-rose-400">{exportError}</p>}

      <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900 shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-800 bg-slate-800/50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">
                <input
                  type="checkbox"
                  className="accent-indigo-500"
                  checked={selected.size > 0 && rows.every((r) => selected.has(r.session.id))}
                  onChange={(e) =>
                    setSelected(e.target.checked ? new Set(rows.map((r) => r.session.id)) : new Set())
                  }
                />
              </th>
              <th className="px-4 py-3">Aday</th>
              <th className="px-4 py-3">Pozisyon</th>
              <th className="px-4 py-3">Genel Puan</th>
              <th className="px-4 py-3">Tavsiye</th>
              <th className="px-4 py-3">Rapor Tarihi</th>
              <th className="px-4 py-3">İşlemler</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {rows.map(({ session, candidate, job }) => (
              <tr key={session.id} className="hover:bg-slate-800">
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    className="accent-indigo-500"
                    checked={selected.has(session.id)}
                    onChange={() => toggleSelected(session.id)}
                  />
                </td>
                <td className="px-4 py-3 text-slate-100">{candidate?.full_name ?? 'Bilinmiyor'}</td>
                <td className="px-4 py-3 text-slate-300">{job?.title ?? '—'}</td>
                <td className="px-4 py-3 text-slate-300">{session.overall_score} / 100</td>
                <td className="px-4 py-3">
                  {session.recommendation ? <RecommendationBadge recommendation={session.recommendation} /> : '—'}
                </td>
                <td className="px-4 py-3 text-slate-300">{new Date(session.updated_at).toLocaleDateString()}</td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => navigate(`/hr/interviews/${session.id}`)}
                    className="rounded border border-slate-700 px-2 py-1 text-xs font-medium text-slate-100 hover:bg-slate-800"
                  >
                    Raporu Görüntüle
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-sm text-slate-500">
                  Rapor bulunamadı.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
