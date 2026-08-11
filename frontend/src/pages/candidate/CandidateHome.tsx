import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { candidateApiClient } from '../../api/client'
import StatusBadge from '../../components/StatusBadge'
import { daysRemainingText, latestSessionOf } from '../../utils/interviewStatus'
import type { CandidateDetail, InterviewSession, Job } from '../../types'

export default function CandidateHome() {
  const { candidateId } = useParams()
  const navigate = useNavigate()
  const [candidate, setCandidate] = useState<CandidateDetail | null>(null)
  const [job, setJob] = useState<Job | null>(null)
  const [sessions, setSessions] = useState<InterviewSession[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    candidateApiClient
      .get<CandidateDetail>('/candidates/me')
      .then((res) => {
        setCandidate(res.data)
        return Promise.all([
          candidateApiClient.get<Job>(`/jobs/${res.data.job_id}`),
          candidateApiClient.get<InterviewSession[]>('/interviews'),
        ])
      })
      .then(([jobRes, sessionsRes]) => {
        setJob(jobRes.data)
        setSessions(sessionsRes.data)
      })
      .catch(() => setError('Bilgileriniz yüklenemedi. Lütfen tekrar deneyin.'))
  }, [])

  if (error) return <p className="text-sm text-red-600">{error}</p>
  if (!candidate || !job || !sessions) return <p className="text-sm text-gray-500">Yükleniyor...</p>

  const latestSession = latestSessionOf(sessions)
  // The deadline is a "finish the interview by this date" countdown — once
  // the candidate has actually finished (awaiting_review/completed), it has
  // nothing left to say and is just confusing next to "already evaluated".
  const interviewNotFinished = !latestSession || latestSession.status === 'in_progress'

  const activeApplications = !latestSession || interviewNotFinished ? 1 : 0
  const completedCount = sessions.filter((s) => s.status === 'awaiting_review' || s.status === 'completed').length
  const underEvaluationCount = sessions.filter((s) => s.status === 'awaiting_review').length
  const upcomingCount = interviewNotFinished ? 1 : 0

  return (
    <div>
      <h2 className="mb-6 text-xl font-semibold text-gray-900">Merhaba, {candidate.full_name} 👋</h2>

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: 'Aktif Başvurular', value: activeApplications },
          { label: 'Yaklaşan Mülakatlar', value: upcomingCount },
          { label: 'Tamamlanan Mülakatlar', value: completedCount },
          { label: 'Değerlendirme Bekleyen', value: underEvaluationCount },
        ].map((card) => (
          <div key={card.label} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-2xl font-semibold text-gray-900">{card.value}</p>
            <p className="mt-1 text-xs text-gray-500">{card.label}</p>
          </div>
        ))}
      </div>

      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="mb-3 text-base font-medium text-gray-900">
          {latestSession ? 'Yaklaşan Mülakat' : 'Başvurunuz'}
        </h3>
        <p className="text-sm font-medium text-gray-900">{job.title}</p>
        {candidate.interview_deadline && interviewNotFinished && (
          <p className="mt-1 text-sm text-gray-600">{daysRemainingText(candidate.interview_deadline)}</p>
        )}
        <div className="mt-3">
          {latestSession ? <StatusBadge status={latestSession.status} /> : <StatusBadge status="pending" />}
        </div>
        {interviewNotFinished && (
          <button
            onClick={() => navigate(`/interview/${candidateId}/home/interviews`)}
            className="mt-4 rounded bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-700"
          >
            Mülakatı Görüntüle
          </button>
        )}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-medium text-gray-900">Son Başvurular</h3>
          <button
            onClick={() => navigate(`/interview/${candidateId}/home/applications`)}
            className="text-sm font-medium text-indigo-600 hover:underline"
          >
            Tüm Başvuruları Görüntüle
          </button>
        </div>
        <div className="flex items-center justify-between border-t border-gray-100 pt-3">
          <p className="text-sm text-gray-900">{job.title}</p>
          {latestSession ? <StatusBadge status={latestSession.status} /> : <StatusBadge status="pending" />}
        </div>
      </div>
    </div>
  )
}
