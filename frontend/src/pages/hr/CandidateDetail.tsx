import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import apiClient from '../../api/client'
import type { CandidateDetail as CandidateDetailType, InterviewSession, Job } from '../../types'

const STATUS_LABELS: Record<string, string> = {
  in_progress: 'In progress',
  awaiting_review: 'Awaiting review',
  completed: 'Completed',
  pending: 'Pending',
}

export default function CandidateDetail() {
  const { candidateId } = useParams()
  const [candidate, setCandidate] = useState<CandidateDetailType | null>(null)
  const [job, setJob] = useState<Job | null>(null)
  const [sessions, setSessions] = useState<InterviewSession[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
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
        setSessions(sessionsRes.data)
      })
      .catch(() => setError('Unable to load candidate information.'))
  }, [candidateId])

  if (error) return <p className="text-sm text-red-600">{error}</p>
  if (!candidate) return <p className="text-sm text-gray-500">Loading candidate information...</p>

  const latestCv = candidate.cvs[candidate.cvs.length - 1]

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-gray-900">{candidate.full_name}</h2>
        <p className="text-sm text-gray-500">{candidate.email}</p>
        <dl className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs uppercase text-gray-500">Position</dt>
            <dd className="text-gray-900">{job?.title ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-gray-500">Phone</dt>
            <dd className="text-gray-900">{candidate.phone ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-gray-500">Declared skills</dt>
            <dd className="text-gray-900">
              {candidate.skills.length > 0 ? candidate.skills.map((s) => s.name).join(', ') : '—'}
            </dd>
          </div>
        </dl>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="mb-3 text-base font-medium text-gray-900">CV</h3>
        {latestCv ? (
          <div>
            <p className="whitespace-pre-line text-sm text-gray-700">
              {latestCv.parsed_text ? latestCv.parsed_text.slice(0, 600) : 'No parsed CV text available.'}
              {latestCv.parsed_text && latestCv.parsed_text.length > 600 ? '…' : ''}
            </p>
            {latestCv.analysis?.summary && (
              <p className="mt-3 text-sm text-gray-600">
                <span className="font-medium text-gray-900">AI CV summary: </span>
                {latestCv.analysis.summary}
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-500">No CV uploaded.</p>
        )}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="mb-3 text-base font-medium text-gray-900">Interview sessions</h3>
        {sessions.length === 0 && <p className="text-sm text-gray-500">No interview sessions yet.</p>}
        <ul className="divide-y divide-gray-100">
          {sessions.map((session) => (
            <li key={session.id} className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm font-medium text-gray-900">
                  {STATUS_LABELS[session.status] ?? session.status}
                </p>
                <p className="text-xs text-gray-500">{new Date(session.created_at).toLocaleString()}</p>
              </div>
              <Link
                to={`/hr/interviews/${session.id}`}
                className="rounded bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800"
              >
                View interview
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
