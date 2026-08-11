import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { candidateApiClient } from '../../api/client'
import StatusBadge from '../../components/StatusBadge'
import { formatDate, latestSessionOf } from '../../utils/interviewStatus'
import type { CandidateDetail, InterviewSession, Job } from '../../types'

export default function MyApplications() {
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
      .catch(() => setError('Başvurularınız yüklenemedi. Lütfen tekrar deneyin.'))
  }, [])

  if (error) return <p className="text-sm text-red-600">{error}</p>
  if (!candidate || !job || !sessions) return <p className="text-sm text-gray-500">Yükleniyor...</p>

  const latestSession = latestSessionOf(sessions)

  // One candidate = one job application in this system today — the list is
  // shaped to hold more than one, but there's honestly only ever one row
  // right now.
  const nextAction = !latestSession
    ? { label: 'Mülakata Başla', to: `/interview/${candidateId}/home/interviews` }
    : latestSession.status === 'in_progress'
      ? { label: 'Mülakata Devam Et', to: `/interview/${candidateId}/home/interviews` }
      : latestSession.status === 'completed'
        ? { label: 'Detayları Görüntüle', to: `/interview/${candidateId}/home/completed/${latestSession.id}` }
        : null

  return (
    <div>
      <h2 className="mb-4 text-xl font-semibold text-gray-900">Başvurularım</h2>
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <p className="text-sm font-medium text-gray-900">{job.title}</p>
        {job.department && <p className="text-xs text-gray-500">{job.department}</p>}
        <p className="mt-2 text-xs text-gray-500">Başvuru tarihi: {formatDate(candidate.created_at)}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StatusBadge status={latestSession ? latestSession.status : 'pending'} />
        </div>
        {nextAction && (
          <button
            onClick={() => navigate(nextAction.to)}
            className="mt-4 rounded bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-700"
          >
            {nextAction.label}
          </button>
        )}
      </div>
    </div>
  )
}
