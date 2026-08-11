import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import apiClient from '../../api/client'
import HrStatusBadge from '../../components/HrStatusBadge'
import RecommendationBadge from '../../components/RecommendationBadge'
import type { Candidate, InterviewSession, Job } from '../../types'

export default function InterviewList() {
  const navigate = useNavigate()
  const [sessions, setSessions] = useState<InterviewSession[] | null>(null)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [positionFilter, setPositionFilter] = useState('all')

  useEffect(() => {
    Promise.all([
      apiClient.get<InterviewSession[]>('/interviews'),
      apiClient.get<Candidate[]>('/candidates'),
      apiClient.get<Job[]>('/jobs'),
    ])
      .then(([sessionsRes, candidatesRes, jobsRes]) => {
        setSessions(sessionsRes.data)
        setCandidates(candidatesRes.data)
        setJobs(jobsRes.data)
      })
      .catch(() => setError('Unable to load interviews.'))
  }, [])

  const candidateById = useMemo(() => new Map(candidates.map((c) => [c.id, c])), [candidates])
  const jobById = useMemo(() => new Map(jobs.map((j) => [j.id, j])), [jobs])

  const rows = useMemo(() => {
    if (!sessions) return []
    let result = sessions.map((session) => ({
      session,
      candidate: candidateById.get(session.candidate_id),
      job: jobById.get(session.job_id),
    }))

    if (search.trim()) {
      const q = search.trim().toLowerCase()
      result = result.filter((r) => r.candidate?.full_name.toLowerCase().includes(q))
    }
    if (statusFilter !== 'all') {
      result = result.filter((r) => r.session.status === statusFilter)
    }
    if (positionFilter !== 'all') {
      result = result.filter((r) => String(r.session.job_id) === positionFilter)
    }
    return result.sort((a, b) => new Date(b.session.created_at).getTime() - new Date(a.session.created_at).getTime())
  }, [sessions, candidateById, jobById, search, statusFilter, positionFilter])

  if (error) return <p className="text-sm text-red-600">{error}</p>
  if (!sessions) return <p className="text-sm text-gray-500">Loading interviews...</p>

  return (
    <div>
      <h2 className="mb-6 text-xl font-semibold text-gray-900">Interviews</h2>

      <div className="mb-4 flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Search by candidate name"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-64 rounded border border-gray-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded border border-gray-300 px-2 py-1.5 text-sm"
        >
          <option value="all">All statuses</option>
          <option value="in_progress">In progress</option>
          <option value="awaiting_review">Awaiting review</option>
          <option value="completed">Completed</option>
          <option value="terminated">Terminated</option>
        </select>
        <select
          value={positionFilter}
          onChange={(e) => setPositionFilter(e.target.value)}
          className="rounded border border-gray-300 px-2 py-1.5 text-sm"
        >
          <option value="all">All positions</option>
          {jobs.map((j) => (
            <option key={j.id} value={j.id}>
              {j.title}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3">Candidate</th>
              <th className="px-4 py-3">Position</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Score</th>
              <th className="px-4 py-3">Recommendation</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map(({ session, candidate, job }) => (
              <tr key={session.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-900">{candidate?.full_name ?? 'Unknown'}</td>
                <td className="px-4 py-3 text-gray-700">{job?.title ?? '—'}</td>
                <td className="px-4 py-3 text-gray-700">{new Date(session.created_at).toLocaleDateString()}</td>
                <td className="px-4 py-3"><HrStatusBadge status={session.status} /></td>
                <td className="px-4 py-3 text-gray-700">{session.overall_score ?? '—'}</td>
                <td className="px-4 py-3">
                  {session.recommendation ? <RecommendationBadge recommendation={session.recommendation} /> : '—'}
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => navigate(`/hr/interviews/${session.id}`)}
                    className="rounded border border-gray-300 px-2 py-1 text-xs font-medium text-gray-900 hover:bg-gray-50"
                  >
                    View
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-sm text-gray-500">
                  No interviews found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
