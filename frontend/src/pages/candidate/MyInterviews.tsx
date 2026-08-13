import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { candidateApiClient } from '../../api/client'
import StatusBadge from '../../components/StatusBadge'
import { candidateFacingStatus, latestSessionOf } from '../../utils/interviewStatus'
import type { CandidateDetail, InterviewSession, Job } from '../../types'

// Mirrors QUESTION_SECONDS in pages/candidate/Interview.tsx — used only to
// show a rough "estimated duration" before the candidate starts, not to
// drive any actual timing logic.
const SECONDS_PER_QUESTION = 90

export default function MyInterviews() {
  const { candidateId } = useParams()
  const navigate = useNavigate()
  const [job, setJob] = useState<Job | null>(null)
  const [sessions, setSessions] = useState<InterviewSession[] | null>(null)
  const [deadline, setDeadline] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    candidateApiClient
      .get<CandidateDetail>('/candidates/me')
      .then((res) => {
        setDeadline(res.data.interview_deadline)
        return Promise.all([
          candidateApiClient.get<Job>(`/jobs/${res.data.job_id}`),
          candidateApiClient.get<InterviewSession[]>('/interviews'),
        ])
      })
      .then(([jobRes, sessionsRes]) => {
        setJob(jobRes.data)
        setSessions(sessionsRes.data)
      })
      .catch(() => setError('Mülakatlarınız yüklenemedi. Lütfen tekrar deneyin.'))
  }, [])

  if (error) return <p className="text-sm font-medium text-rose-400">{error}</p>
  if (!job || !sessions) return <p className="text-sm text-slate-500">Yükleniyor...</p>

  const latestSession = latestSessionOf(sessions)
  const readyToStart = !latestSession || latestSession.status === 'in_progress'
  const estimatedMinutes = Math.round((job.questions.length * SECONDS_PER_QUESTION) / 60)
  // The deadline only blocks *starting* a fresh interview (matches the
  // backend's create_session check) — a session that's already in_progress
  // was started before the deadline passed, so it can still be finished.
  const deadlinePassed = !latestSession && !!deadline && new Date(deadline).getTime() < Date.now()

  return (
    <div>
      <h2 className="mb-4 text-xl font-semibold text-slate-100">Mülakatlarım</h2>
      {!readyToStart ? (
        <p className="text-sm text-slate-400">Şu anda planlanmış bir mülakatınız yok.</p>
      ) : deadlinePassed ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-sm">
          <p className="text-lg font-medium text-slate-100">{job.title}</p>
          <div className="mt-3">
            <StatusBadge status="pending" />
          </div>
          <p className="mt-4 text-sm text-rose-400">
            Mülakat süreniz doldu, artık bu başvuru için mülakata giremezsiniz.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-sm">
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-500">
            {latestSession ? 'Devam Eden Mülakat' : 'Başlatılmaya Hazır'}
          </p>
          <p className="text-lg font-medium text-slate-100">{job.title}</p>
          <p className="mt-1 text-sm text-slate-500">Tahmini süre: yaklaşık {estimatedMinutes} dakika</p>
          <div className="mt-3">
            <StatusBadge status={latestSession ? candidateFacingStatus(latestSession) : 'pending'} />
          </div>
          <button
            onClick={() => navigate(`/interview/${candidateId}/consent`)}
            className="mt-4 rounded bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-500"
          >
            {latestSession ? 'Mülakata Devam Et' : 'Mülakata Başla'}
          </button>
        </div>
      )}
    </div>
  )
}
