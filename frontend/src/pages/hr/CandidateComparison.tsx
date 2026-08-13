import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import apiClient from '../../api/client'
import HrStatusBadge from '../../components/HrStatusBadge'
import RecommendationBadge from '../../components/RecommendationBadge'
import { COMPETENCY_LABELS } from '../../utils/competency'
import type { Candidate, CompetencyScores, InterviewReport, InterviewSession, Job } from '../../types'

interface Column {
  session: InterviewSession
  candidate: Candidate
  job: Job | null
  report: InterviewReport | null
}

async function loadColumn(sessionId: number): Promise<Column | null> {
  try {
    const { data: session } = await apiClient.get<InterviewSession>(`/interviews/${sessionId}`)
    const [{ data: candidate }, jobRes, reportRes] = await Promise.all([
      apiClient.get<Candidate>(`/candidates/${session.candidate_id}`),
      apiClient.get<Job>(`/jobs/${session.job_id}`).catch(() => null),
      apiClient.get<InterviewReport>(`/reports/session/${sessionId}`).catch(() => null),
    ])
    return { session, candidate, job: jobRes?.data ?? null, report: reportRes?.data ?? null }
  } catch {
    return null
  }
}

export default function CandidateComparison() {
  const [searchParams] = useSearchParams()
  const [columns, setColumns] = useState<Column[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const sessionIds = (searchParams.get('sessions') ?? '')
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => !Number.isNaN(n))

  useEffect(() => {
    if (sessionIds.length === 0) {
      setError('Karşılaştırılacak mülakat seçilmedi.')
      return
    }
    Promise.all(sessionIds.map(loadColumn)).then((results) => {
      const loaded = results.filter((c): c is Column => c !== null)
      if (loaded.length === 0) {
        setError('Seçilen mülakatlar yüklenemedi.')
      } else {
        setColumns(loaded)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  if (error) return <p className="text-sm font-medium text-rose-400">{error}</p>
  if (!columns) return <p className="text-sm text-slate-500">Karşılaştırma yükleniyor...</p>

  const gridStyle = { gridTemplateColumns: `160px repeat(${columns.length}, minmax(0, 1fr))` }

  return (
    <div>
      <p className="mb-4 text-xs text-slate-500">
        <Link to="/hr/reports" className="hover:text-slate-300">
          Raporlar
        </Link>{' '}
        <span className="mx-1">›</span> Karşılaştırma
      </p>
      <h2 className="mb-6 text-xl font-semibold text-slate-100">Aday Karşılaştırması</h2>

      <div className="overflow-x-auto">
        <div className="min-w-[640px]">
          {/* Header row */}
          <div className="grid gap-4" style={gridStyle}>
            <div />
            {columns.map(({ session, candidate, job }) => (
              <div key={session.id} className="rounded-xl border border-slate-800 bg-slate-900 p-4 shadow-sm">
                <p className="truncate text-base font-semibold text-slate-100">{candidate.full_name}</p>
                <p className="truncate text-xs text-slate-500">{job?.title ?? '—'}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <HrStatusBadge status={session.status} />
                  {session.recommendation && <RecommendationBadge recommendation={session.recommendation} />}
                </div>
                <p className="mt-2 text-2xl font-semibold text-slate-100">
                  {session.overall_score != null ? `${session.overall_score}/100` : '—'}
                </p>
                {session.hr_decision && (
                  <p className="mt-1 text-xs text-slate-500">
                    İK Kararı: <RecommendationBadge recommendation={session.hr_decision} />
                  </p>
                )}
              </div>
            ))}
          </div>

          {/* Competency comparison table — one row per competency so scores
              read across columns, which is the point of a comparison view
              (vs. each candidate's own stacked ScoreBar group). */}
          <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900 shadow-sm">
            <div className="border-b border-slate-800 px-4 py-3 text-sm font-medium text-slate-100">
              Yetkinlik Puanları
            </div>
            {Object.entries(COMPETENCY_LABELS).map(([key, label]) => (
              <div key={key} className="grid items-center gap-4 border-b border-slate-800 px-4 py-2 last:border-0" style={gridStyle}>
                <span className="text-sm text-slate-400">{label}</span>
                {columns.map(({ session, report }) => {
                  const value = report?.competency_scores?.[key as keyof CompetencyScores] ?? null
                  return (
                    <span key={session.id} className="text-sm font-medium text-slate-100">
                      {value ?? '—'}
                    </span>
                  )
                })}
              </div>
            ))}
          </div>

          {/* Per-candidate narrative, side by side */}
          <div className="mt-4 grid gap-4" style={gridStyle}>
            <div />
            {columns.map(({ session, report }) => (
              <div key={session.id} className="space-y-3 rounded-xl border border-slate-800 bg-slate-900 p-4 shadow-sm">
                {report?.strengths && report.strengths.length > 0 && (
                  <div>
                    <h4 className="mb-1 text-xs font-medium uppercase text-slate-500">Güçlü Yönler</h4>
                    <ul className="list-inside list-disc text-sm text-slate-300">
                      {report.strengths.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {report?.development_areas && report.development_areas.length > 0 && (
                  <div>
                    <h4 className="mb-1 text-xs font-medium uppercase text-slate-500">Gelişim Alanları</h4>
                    <ul className="list-inside list-disc text-sm text-slate-300">
                      {report.development_areas.map((d, i) => (
                        <li key={i}>{d}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {report?.summary && (
                  <div>
                    <h4 className="mb-1 text-xs font-medium uppercase text-slate-500">Özet</h4>
                    <p className="text-sm text-slate-300">{report.summary}</p>
                  </div>
                )}
                {!report && <p className="text-sm text-slate-500">Rapor bulunamadı.</p>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
