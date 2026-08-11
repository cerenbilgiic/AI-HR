import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { candidateApiClient } from '../../api/client'
import StatusBadge from '../../components/StatusBadge'
import { latestSessionOf } from '../../utils/interviewStatus'
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
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    candidateApiClient
      .get<CandidateDetail>('/candidates/me')
      .then((res) =>
        Promise.all([
          candidateApiClient.get<Job>(`/jobs/${res.data.job_id}`),
          candidateApiClient.get<InterviewSession[]>('/interviews'),
        ]),
      )
      .then(([jobRes, sessionsRes]) => {
        setJob(jobRes.data)
        setSessions(sessionsRes.data)
      })
      .catch(() => setError('Mülakatlarınız yüklenemedi. Lütfen tekrar deneyin.'))
  }, [])

  if (error) return <p className="text-sm text-red-600">{error}</p>
  if (!job || !sessions) return <p className="text-sm text-gray-500">Yükleniyor...</p>

  const latestSession = latestSessionOf(sessions)
  const readyToStart = !latestSession || latestSession.status === 'in_progress'
  const estimatedMinutes = Math.round((job.questions.length * SECONDS_PER_QUESTION) / 60)

  return (
    <div>
      <h2 className="mb-4 text-xl font-semibold text-gray-900">Mülakatlarım</h2>
      {!readyToStart ? (
        <p className="text-sm text-gray-600">Şu anda planlanmış bir mülakatınız yok.</p>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-indigo-600">
            {latestSession ? 'Devam Eden Mülakat' : 'Başlatılmaya Hazır'}
          </p>
          <p className="text-lg font-medium text-gray-900">{job.title}</p>
          <p className="mt-1 text-sm text-gray-500">Tahmini süre: yaklaşık {estimatedMinutes} dakika</p>
          <div className="mt-3">
            <StatusBadge status={latestSession ? latestSession.status : 'pending'} />
          </div>
          <button
            onClick={() => navigate(`/interview/${candidateId}/consent`)}
            className="mt-4 rounded bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-700"
          >
            {latestSession ? 'Mülakata Devam Et' : 'Mülakata Başla'}
          </button>
        </div>
      )}
    </div>
  )
}
