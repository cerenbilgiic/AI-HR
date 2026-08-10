import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import apiClient from '../../api/client'
import type { Candidate, InterviewSession, Job } from '../../types'

const STATUS_LABELS: Record<string, string> = {
  in_progress: 'Interview in progress',
  awaiting_review: 'Awaiting HR review',
  completed: 'Evaluated',
  pending: 'Not started',
}

export default function JobDetail() {
  const { jobId } = useParams()
  const navigate = useNavigate()
  const [job, setJob] = useState<Job | null>(null)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [sessions, setSessions] = useState<InterviewSession[]>([])
  const [evaluatingId, setEvaluatingId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  function loadSessions() {
    apiClient.get<InterviewSession[]>('/interviews', { params: { job_id: jobId } }).then((res) => setSessions(res.data))
  }

  useEffect(() => {
    apiClient.get<Job>(`/jobs/${jobId}`).then((res) => setJob(res.data))
    apiClient.get<Candidate[]>('/candidates', { params: { job_id: jobId } }).then((res) => setCandidates(res.data))
    loadSessions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId])

  async function evaluate(sessionId: number) {
    setEvaluatingId(sessionId)
    setError(null)
    try {
      await apiClient.post(`/interviews/${sessionId}/evaluate`)
      navigate(`/hr/interviews/${sessionId}`)
    } catch {
      setError('Could not evaluate this interview. Please try again.')
    } finally {
      setEvaluatingId(null)
    }
  }

  if (!job) return <p className="text-sm text-gray-500">Loading...</p>

  return (
    <div>
      <h2 className="mb-2 text-xl font-semibold text-gray-900">{job.title}</h2>
      <p className="mb-6 text-sm text-gray-600">{job.description}</p>

      <h3 className="mb-3 text-base font-medium text-gray-900">Candidates</h3>
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      <ul className="divide-y divide-gray-200 rounded border border-gray-200 bg-white">
        {candidates.map((c) => {
          const session = sessions.find((s) => s.candidate_id === c.id)
          return (
            <li key={c.id} className="flex items-center justify-between px-4 py-3 text-sm text-gray-900">
              <div>
                <p>{c.full_name} — {c.email}</p>
                {session && (
                  <p className="mt-0.5 text-xs text-gray-500">{STATUS_LABELS[session.status] ?? session.status}</p>
                )}
              </div>
              {session?.status === 'awaiting_review' && (
                <button
                  onClick={() => void evaluate(session.id)}
                  disabled={evaluatingId === session.id}
                  className="rounded bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-40"
                >
                  {evaluatingId === session.id ? 'Evaluating…' : 'Evaluate'}
                </button>
              )}
              {session?.status === 'completed' && (
                <button
                  onClick={() => navigate(`/hr/interviews/${session.id}`)}
                  className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-900 hover:bg-gray-50"
                >
                  View report
                </button>
              )}
            </li>
          )
        })}
        {candidates.length === 0 && (
          <li className="px-4 py-3 text-sm text-gray-500">No candidates yet.</li>
        )}
      </ul>
    </div>
  )
}
