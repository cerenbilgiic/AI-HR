import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import apiClient from '../../api/client'
import HrStatusBadge from '../../components/HrStatusBadge'
import RecommendationBadge from '../../components/RecommendationBadge'
import type { Candidate, InterviewSession, Job } from '../../types'

const ACTIVE_STATUSES = new Set(['in_progress', 'awaiting_review'])
const RECENT_COUNT = 5

export default function Dashboard() {
  const navigate = useNavigate()
  const [candidates, setCandidates] = useState<Candidate[] | null>(null)
  const [sessions, setSessions] = useState<InterviewSession[] | null>(null)
  const [jobs, setJobs] = useState<Job[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      apiClient.get<Candidate[]>('/candidates'),
      apiClient.get<InterviewSession[]>('/interviews'),
      apiClient.get<Job[]>('/jobs'),
    ])
      .then(([candidatesRes, sessionsRes, jobsRes]) => {
        setCandidates(candidatesRes.data)
        setSessions(sessionsRes.data)
        setJobs(jobsRes.data)
      })
      .catch(() => setError('Unable to load dashboard data.'))
  }, [])

  const jobById = useMemo(() => new Map(jobs.map((j) => [j.id, j])), [jobs])
  const candidateById = useMemo(
    () => new Map((candidates ?? []).map((c) => [c.id, c])),
    [candidates],
  )

  if (error) return <p className="text-sm text-red-600">{error}</p>
  if (!candidates || !sessions) return <p className="text-sm text-gray-500">Loading dashboard...</p>

  const activeInterviews = sessions.filter((s) => ACTIVE_STATUSES.has(s.status)).length
  const reportsGenerated = sessions.filter((s) => s.overall_score != null).length
  const completedInterviews = sessions.filter((s) => s.status === 'completed').length
  const scores = sessions.map((s) => s.overall_score).filter((s): s is number => s != null)
  const averageScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null

  const cards = [
    { label: 'Total candidates', value: candidates.length },
    { label: 'Active interviews', value: activeInterviews },
    { label: 'Completed interviews', value: completedInterviews },
    { label: 'Reports generated', value: reportsGenerated },
    { label: 'Average score', value: averageScore != null ? `${averageScore} / 100` : '—' },
  ]

  const recentInterviews = sessions
    .slice()
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, RECENT_COUNT)

  const recentCandidates = candidates
    .slice()
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, RECENT_COUNT)

  return (
    <div>
      <h2 className="mb-6 text-xl font-semibold text-gray-900">Dashboard</h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {cards.map((card) => (
          <div key={card.label} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-2xl font-semibold text-gray-900">{card.value}</p>
            <p className="mt-1 text-xs text-gray-500">{card.label}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h3 className="text-base font-medium text-gray-900">Recent Interviews</h3>
          <Link to="/hr/interviews" className="text-sm font-medium text-indigo-600 hover:text-indigo-700">
            View all →
          </Link>
        </div>
        {recentInterviews.length === 0 ? (
          <p className="px-6 py-6 text-sm text-gray-500">No interviews yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-6 py-2">Candidate</th>
                  <th className="px-6 py-2">Position</th>
                  <th className="px-6 py-2">Date</th>
                  <th className="px-6 py-2">Status</th>
                  <th className="px-6 py-2">Score</th>
                  <th className="px-6 py-2">Recommendation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recentInterviews.map((s) => {
                  const candidate = candidateById.get(s.candidate_id)
                  const job = jobById.get(s.job_id)
                  return (
                    <tr
                      key={s.id}
                      className="cursor-pointer hover:bg-gray-50"
                      onClick={() => navigate(`/hr/interviews/${s.id}`)}
                    >
                      <td className="px-6 py-2 text-gray-900">{candidate?.full_name ?? '—'}</td>
                      <td className="px-6 py-2 text-gray-700">{job?.title ?? '—'}</td>
                      <td className="px-6 py-2 text-gray-700">{new Date(s.created_at).toLocaleDateString()}</td>
                      <td className="px-6 py-2"><HrStatusBadge status={s.status} /></td>
                      <td className="px-6 py-2 text-gray-700">{s.overall_score ?? '—'}</td>
                      <td className="px-6 py-2">
                        {s.recommendation ? <RecommendationBadge recommendation={s.recommendation} /> : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mt-6 rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h3 className="text-base font-medium text-gray-900">Recent Candidates</h3>
          <Link to="/hr/candidates" className="text-sm font-medium text-indigo-600 hover:text-indigo-700">
            View all candidates →
          </Link>
        </div>
        {recentCandidates.length === 0 ? (
          <p className="px-6 py-6 text-sm text-gray-500">No candidates yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {recentCandidates.map((c) => (
              <li key={c.id}>
                <Link to={`/hr/candidates/${c.id}`} className="flex items-center justify-between px-6 py-3 hover:bg-gray-50">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{c.full_name}</p>
                    <p className="text-xs text-gray-500">{jobById.get(c.job_id)?.title ?? '—'}</p>
                  </div>
                  <span className="text-xs text-gray-500">{new Date(c.created_at).toLocaleDateString()}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
