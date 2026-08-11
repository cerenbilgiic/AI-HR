import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import apiClient from '../../api/client'
import HrStatusBadge from '../../components/HrStatusBadge'
import RecommendationBadge from '../../components/RecommendationBadge'
import type { Candidate, InterviewSession, Job } from '../../types'

type SortKey = 'date' | 'score'

function latestSessionFor(candidateId: number, sessions: InterviewSession[]): InterviewSession | undefined {
  return sessions
    .filter((s) => s.candidate_id === candidateId)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
}

export default function CandidateList() {
  const navigate = useNavigate()
  const [candidates, setCandidates] = useState<Candidate[] | null>(null)
  const [sessions, setSessions] = useState<InterviewSession[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [positionFilter, setPositionFilter] = useState('all')
  const [recommendationFilter, setRecommendationFilter] = useState('all')
  const [minScore, setMinScore] = useState('')
  const [sortKey, setSortKey] = useState<SortKey | null>(null)
  const [sortDesc, setSortDesc] = useState(true)

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
      .catch(() => setError('Unable to load candidate information.'))
  }, [])

  const jobById = useMemo(() => new Map(jobs.map((j) => [j.id, j])), [jobs])

  const rows = useMemo(() => {
    if (!candidates) return []
    let result = candidates.map((c) => ({
      candidate: c,
      job: jobById.get(c.job_id),
      session: latestSessionFor(c.id, sessions),
    }))

    if (search.trim()) {
      const q = search.trim().toLowerCase()
      result = result.filter(
        (r) => r.candidate.full_name.toLowerCase().includes(q) || r.candidate.email.toLowerCase().includes(q),
      )
    }
    if (statusFilter !== 'all') {
      result = result.filter((r) => (r.session?.status ?? 'not_started') === statusFilter)
    }
    if (positionFilter !== 'all') {
      result = result.filter((r) => String(r.candidate.job_id) === positionFilter)
    }
    if (recommendationFilter !== 'all') {
      result = result.filter((r) => r.session?.recommendation === recommendationFilter)
    }
    if (minScore.trim()) {
      const min = Number(minScore)
      result = result.filter((r) => r.session?.overall_score != null && r.session.overall_score >= min)
    }
    if (sortKey) {
      result = [...result].sort((a, b) => {
        const av = sortKey === 'score' ? (a.session?.overall_score ?? -1) : new Date(a.session?.created_at ?? 0).getTime()
        const bv = sortKey === 'score' ? (b.session?.overall_score ?? -1) : new Date(b.session?.created_at ?? 0).getTime()
        return sortDesc ? bv - av : av - bv
      })
    }
    return result
  }, [
    candidates,
    sessions,
    jobById,
    search,
    statusFilter,
    positionFilter,
    recommendationFilter,
    minScore,
    sortKey,
    sortDesc,
  ])

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDesc((d) => !d)
    } else {
      setSortKey(key)
      setSortDesc(true)
    }
  }

  if (error) return <p className="text-sm text-red-600">{error}</p>
  if (!candidates) return <p className="text-sm text-gray-500">Loading candidate information...</p>

  return (
    <div>
      <h2 className="mb-6 text-xl font-semibold text-gray-900">Candidates</h2>

      <div className="mb-4 flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Search by name or email"
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
          <option value="not_started">Not started</option>
          <option value="in_progress">In progress</option>
          <option value="awaiting_review">Awaiting review</option>
          <option value="completed">Completed</option>
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
        <select
          value={recommendationFilter}
          onChange={(e) => setRecommendationFilter(e.target.value)}
          className="rounded border border-gray-300 px-2 py-1.5 text-sm"
        >
          <option value="all">All recommendations</option>
          <option value="recommended">Recommended</option>
          <option value="maybe">Maybe</option>
          <option value="not_recommended">Not recommended</option>
        </select>
        <input
          type="number"
          min={0}
          max={100}
          placeholder="Min score"
          value={minScore}
          onChange={(e) => setMinScore(e.target.value)}
          className="w-28 rounded border border-gray-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3">Candidate</th>
              <th className="px-4 py-3">Position</th>
              <th className="px-4 py-3">Status</th>
              <th className="cursor-pointer px-4 py-3" onClick={() => toggleSort('score')}>
                Score {sortKey === 'score' ? (sortDesc ? '↓' : '↑') : ''}
              </th>
              <th className="px-4 py-3">Recommendation</th>
              <th className="cursor-pointer px-4 py-3" onClick={() => toggleSort('date')}>
                Interview Date {sortKey === 'date' ? (sortDesc ? '↓' : '↑') : ''}
              </th>
              <th className="px-4 py-3">Report</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map(({ candidate, job, session }) => (
              <tr
                key={candidate.id}
                onClick={() => navigate(`/hr/candidates/${candidate.id}`)}
                className="cursor-pointer hover:bg-gray-50"
              >
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-900">{candidate.full_name}</p>
                  <p className="text-xs text-gray-500">{candidate.email}</p>
                </td>
                <td className="px-4 py-3 text-gray-700">{job?.title ?? '—'}</td>
                <td className="px-4 py-3"><HrStatusBadge status={session?.status} /></td>
                <td className="px-4 py-3 text-gray-700">
                  {session?.overall_score != null ? `${session.overall_score} / 100` : '—'}
                </td>
                <td className="px-4 py-3">
                  {session?.recommendation ? <RecommendationBadge recommendation={session.recommendation} /> : '—'}
                </td>
                <td className="px-4 py-3 text-gray-700">
                  {session ? new Date(session.created_at).toLocaleDateString() : '—'}
                </td>
                <td className="px-4 py-3 text-gray-700">
                  {session?.overall_score != null ? 'Generated' : 'Not generated'}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-sm text-gray-500">
                  No candidates match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
