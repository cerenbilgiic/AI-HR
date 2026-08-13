import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { candidateApiClient } from '../../api/client'
import StatusBadge from '../../components/StatusBadge'
import { candidateFacingStatus, daysRemainingText, latestSessionOf } from '../../utils/interviewStatus'
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

  if (error) return <p className="text-sm font-medium text-rose-400">{error}</p>
  if (!candidate || !job || !sessions) return <p className="text-sm text-slate-500">Yükleniyor...</p>

  const latestSession = latestSessionOf(sessions)
  // The deadline is a "finish the interview by this date" countdown — once
  // the candidate has actually finished (awaiting_review/completed), it has
  // nothing left to say and is just confusing next to "already evaluated".
  const interviewNotFinished = !latestSession || latestSession.status === 'in_progress'

  const activeApplications = !latestSession || interviewNotFinished ? 1 : 0
  const completedCount = sessions.filter((s) => s.status === 'awaiting_review' || s.status === 'completed').length
  // Includes AI-done-but-HR-undecided sessions too — from the candidate's
  // perspective nothing has actually been evaluated for them yet.
  const underEvaluationCount = sessions.filter((s) => candidateFacingStatus(s) === 'awaiting_review').length
  const upcomingCount = interviewNotFinished ? 1 : 0

  return (
    <div>
      <h2 className="mb-6 text-xl font-semibold text-slate-100">Merhaba, {candidate.full_name} 👋</h2>

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: 'Aktif Başvurular', value: activeApplications },
          { label: 'Yaklaşan Mülakatlar', value: upcomingCount },
          { label: 'Tamamlanan Mülakatlar', value: completedCount },
          { label: 'Değerlendirme Bekleyen', value: underEvaluationCount },
        ].map((card) => (
          <div key={card.label} className="rounded-xl border border-slate-800 bg-slate-900 p-4 shadow-sm">
            <p className="text-2xl font-semibold text-slate-100">{card.value}</p>
            <p className="mt-1 text-xs text-slate-500">{card.label}</p>
          </div>
        ))}
      </div>

      <div className="mb-6 rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-sm">
        <h3 className="mb-3 text-base font-medium text-slate-100">
          {latestSession ? 'Yaklaşan Mülakat' : 'Başvurunuz'}
        </h3>
        <p className="text-sm font-medium text-slate-100">{job.title}</p>
        {candidate.interview_deadline && interviewNotFinished && (
          <p className="mt-1 text-sm text-slate-400">{daysRemainingText(candidate.interview_deadline)}</p>
        )}
        <div className="mt-3">
          {latestSession ? <StatusBadge status={candidateFacingStatus(latestSession)} /> : <StatusBadge status="pending" />}
        </div>
        {interviewNotFinished && (
          <button
            onClick={() => navigate(`/interview/${candidateId}/home/interviews`)}
            className="mt-4 rounded bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-500"
          >
            Mülakatı Görüntüle
          </button>
        )}
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-medium text-slate-100">Son Başvurular</h3>
          <button
            onClick={() => navigate(`/interview/${candidateId}/home/applications`)}
            className="text-sm font-medium text-indigo-400 hover:text-indigo-300"
          >
            Tüm Başvuruları Görüntüle
          </button>
        </div>
        <div className="flex items-center justify-between border-t border-slate-800 pt-3">
          <p className="text-sm text-slate-100">{job.title}</p>
          {latestSession ? <StatusBadge status={candidateFacingStatus(latestSession)} /> : <StatusBadge status="pending" />}
        </div>
      </div>
    </div>
  )
}
