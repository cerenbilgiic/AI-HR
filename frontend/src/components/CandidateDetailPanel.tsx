import { FileText } from 'lucide-react'
import { useEffect, useState } from 'react'
import apiClient from '../api/client'
import type { CandidateDetail as CandidateDetailType, InterviewSession, Job } from '../types'
import HrStatusBadge from './HrStatusBadge'
import RecommendationBadge from './RecommendationBadge'

// The recording-url/file-url endpoints return an already-/api/v1-prefixed
// path (see LocalFileStorage.presigned_url) but apiClient's baseURL already
// includes /api/v1 — strip the duplicate prefix before requesting through
// apiClient. Same helper as InterviewDetailPanel's video fetch.
function toApiPath(urlFromBackend: string): string {
  return urlFromBackend.startsWith('/api/v1') ? urlFromBackend.slice('/api/v1'.length) : urlFromBackend
}

function initialsOf(fullName: string): string {
  return fullName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}

// The middle column of CandidateWorkspace.tsx — also usable standalone.
// Reports the candidate's sessions up so the parent can drive the third
// (interview detail) panel; auto-selects the latest session once loaded so
// that panel isn't empty by default.
export default function CandidateDetailPanel({
  candidateId,
  selectedSessionId,
  onSelectSession,
}: {
  candidateId: string
  selectedSessionId: number | null
  onSelectSession: (sessionId: number) => void
}) {
  const [candidate, setCandidate] = useState<CandidateDetailType | null>(null)
  const [job, setJob] = useState<Job | null>(null)
  const [sessions, setSessions] = useState<InterviewSession[]>([])
  const [error, setError] = useState<string | null>(null)
  const [cvLoading, setCvLoading] = useState(false)
  const [cvError, setCvError] = useState<string | null>(null)
  const [resetting, setResetting] = useState(false)
  const [resetError, setResetError] = useState<string | null>(null)

  useEffect(() => {
    setCandidate(null)
    setError(null)
    apiClient
      .get<CandidateDetailType>(`/candidates/${candidateId}`)
      .then((res) => {
        setCandidate(res.data)
        return Promise.all([
          apiClient.get<Job>(`/jobs/${res.data.job_id}`),
          apiClient.get<InterviewSession[]>('/interviews', { params: { candidate_id: candidateId } }),
        ])
      })
      .then((results) => {
        if (!results) return
        const [jobRes, sessionsRes] = results
        setJob(jobRes.data)
        const sorted = sessionsRes.data
          .slice()
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        setSessions(sorted)
        if (sorted.length > 0) onSelectSession(sorted[0].id)
      })
      .catch(() => setError('Aday bilgileri yüklenemedi.'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidateId])

  async function handleResetDeadline() {
    if (!candidate || resetting) return
    setResetting(true)
    setResetError(null)
    try {
      const { data } = await apiClient.post<CandidateDetailType>(
        `/candidates/${candidate.id}/reset-interview-deadline`,
      )
      setCandidate(data)
    } catch {
      setResetError('Yeni süre tanımlanamadı. Lütfen tekrar deneyin.')
    } finally {
      setResetting(false)
    }
  }

  async function handleViewCv() {
    if (!candidate || !latestCv) return
    setCvLoading(true)
    setCvError(null)
    try {
      const { data } = await apiClient.get<{ url: string }>(
        `/candidates/${candidate.id}/cvs/${latestCv.id}/file-url`,
      )
      const fileRes = await apiClient.get(toApiPath(data.url), { responseType: 'blob' })
      const blobUrl = URL.createObjectURL(fileRes.data)
      window.open(blobUrl, '_blank')
    } catch {
      setCvError('CV dosyası açılamadı.')
    } finally {
      setCvLoading(false)
    }
  }

  if (error) return <p className="text-sm font-medium text-rose-400">{error}</p>
  if (!candidate) return <p className="text-sm text-slate-500">Aday bilgileri yükleniyor...</p>

  const latestCv = candidate.cvs[candidate.cvs.length - 1]
  const latestSession = sessions[0]
  // Only the "never started, window closed" case gets a reset offer — a
  // session already in progress/terminated/completed means the deadline
  // isn't what's blocking them (matches interview_service.create_session's
  // deadline check, which only runs before any session exists).
  const deadlinePassed =
    !latestSession && !!candidate.interview_deadline && new Date(candidate.interview_deadline).getTime() < Date.now()

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-indigo-600 text-sm font-semibold text-white">
            {initialsOf(candidate.full_name)}
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold text-slate-100">{candidate.full_name}</h2>
            <p className="truncate text-sm text-slate-500">{job?.title ?? 'Bilinmeyen pozisyon'}</p>
          </div>
        </div>
        <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
          <div>
            <dt className="text-xs uppercase text-slate-500">Durum</dt>
            <dd className="mt-1"><HrStatusBadge status={latestSession?.status} /></dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-slate-500">Puan</dt>
            <dd className="mt-1 text-slate-200">
              {latestSession?.overall_score != null ? `${latestSession.overall_score}/100` : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-slate-500">Tavsiye</dt>
            <dd className="mt-1">
              {latestSession?.recommendation ? (
                <RecommendationBadge recommendation={latestSession.recommendation} />
              ) : (
                <span className="text-slate-500">—</span>
              )}
            </dd>
          </div>
        </dl>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 shadow-sm">
        <h3 className="mb-3 text-sm font-medium text-slate-100">Aday Bilgileri</h3>
        <p className="text-sm text-slate-400">{candidate.email}</p>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-xs uppercase text-slate-500">Telefon</dt>
            <dd className="text-slate-300">{candidate.phone ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-slate-500">Başvuru Tarihi</dt>
            <dd className="text-slate-300">{new Date(candidate.created_at).toLocaleDateString()}</dd>
          </div>
          {candidate.interview_deadline && (
            <div>
              <dt className="text-xs uppercase text-slate-500">Mülakat Süresi</dt>
              <dd className={deadlinePassed ? 'text-rose-400' : 'text-slate-300'}>
                {new Date(candidate.interview_deadline).toLocaleDateString()}
                {deadlinePassed && ' (doldu)'}
              </dd>
            </div>
          )}
          <div className="col-span-2">
            <dt className="text-xs uppercase text-slate-500">Belirtilen Beceriler</dt>
            <dd className="text-slate-300">
              {candidate.skills.length > 0 ? candidate.skills.map((s) => s.name).join(', ') : '—'}
            </dd>
          </div>
        </dl>
        {deadlinePassed && (
          <div className="mt-3 border-t border-slate-800 pt-3">
            <button
              onClick={() => void handleResetDeadline()}
              disabled={resetting}
              className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
            >
              {resetting ? 'Tanımlanıyor…' : 'Yeni Mülakat Süresi Tanı'}
            </button>
            {resetError && <p className="mt-2 text-xs font-medium text-rose-400">{resetError}</p>}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 shadow-sm">
        <h3 className="mb-3 text-sm font-medium text-slate-100">CV</h3>
        {latestCv ? (
          <div>
            <button
              onClick={() => void handleViewCv()}
              disabled={cvLoading}
              className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-sm font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-50"
            >
              <FileText className="h-4 w-4" />
              {cvLoading ? 'Açılıyor…' : "CV'yi Görüntüle"}
            </button>
            {cvError && <p className="mt-2 text-sm font-medium text-rose-400">{cvError}</p>}
            {latestCv.analysis?.summary && (
              <p className="mt-3 text-sm text-slate-400">
                <span className="font-medium text-slate-200">AI CV özeti: </span>
                {latestCv.analysis.summary}
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-slate-500">CV yüklenmemiş.</p>
        )}
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 shadow-sm">
        <h3 className="mb-3 text-sm font-medium text-slate-100">Mülakat Oturumları</h3>
        {sessions.length === 0 && <p className="text-sm text-slate-500">Henüz mülakat oturumu yok.</p>}
        <ul className="divide-y divide-slate-800">
          {sessions.map((session) => (
            <li key={session.id}>
              <button
                type="button"
                onClick={() => onSelectSession(session.id)}
                className={`flex w-full items-center justify-between rounded-lg px-2 py-3 text-left ${
                  selectedSessionId === session.id ? 'bg-indigo-500/10' : 'hover:bg-slate-800'
                }`}
              >
                <div>
                  <HrStatusBadge status={session.status} />
                  <p className="mt-1 text-xs text-slate-500">{new Date(session.created_at).toLocaleString()}</p>
                </div>
                <span className="text-xs font-medium text-indigo-400">Görüntüle →</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
