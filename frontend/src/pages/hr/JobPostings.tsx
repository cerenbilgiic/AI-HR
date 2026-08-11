import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import apiClient from '../../api/client'
import type { Candidate, InterviewSession, Job } from '../../types'

export default function JobPostings() {
  const [jobs, setJobs] = useState<Job[] | null>(null)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [sessions, setSessions] = useState<InterviewSession[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      apiClient.get<Job[]>('/jobs'),
      apiClient.get<Candidate[]>('/candidates'),
      apiClient.get<InterviewSession[]>('/interviews'),
    ])
      .then(([jobsRes, candidatesRes, sessionsRes]) => {
        setJobs(jobsRes.data)
        setCandidates(candidatesRes.data)
        setSessions(sessionsRes.data)
      })
      .catch(() => setError('Unable to load job postings.'))
  }, [])

  const statsByJob = useMemo(() => {
    const stats = new Map<number, { applications: number; interviewed: number; avgScore: number | null }>()
    for (const job of jobs ?? []) {
      const jobCandidates = candidates.filter((c) => c.job_id === job.id)
      const jobSessions = sessions.filter((s) => s.job_id === job.id)
      const interviewed = jobSessions.filter((s) => s.status !== 'pending').length
      const scores = jobSessions.map((s) => s.overall_score).filter((s): s is number => s != null)
      const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null
      stats.set(job.id, { applications: jobCandidates.length, interviewed, avgScore })
    }
    return stats
  }, [jobs, candidates, sessions])

  if (error) return <p className="text-sm text-red-600">{error}</p>
  if (!jobs) return <p className="text-sm text-gray-500">Loading job postings...</p>

  return (
    <div>
      <h2 className="mb-6 text-xl font-semibold text-gray-900">Job Positions</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {jobs.map((job) => {
          const stats = statsByJob.get(job.id)
          return (
            <Link
              key={job.id}
              to={`/hr/jobs/${job.id}`}
              className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm hover:border-indigo-200"
            >
              <p className="font-medium text-gray-900">{job.title}</p>
              <p className="text-sm text-gray-500">{job.department}</p>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
                <div>
                  <p className="font-semibold text-gray-900">{stats?.applications ?? 0}</p>
                  <p className="text-xs text-gray-500">Applications</p>
                </div>
                <div>
                  <p className="font-semibold text-gray-900">{stats?.interviewed ?? 0}</p>
                  <p className="text-xs text-gray-500">Interviews</p>
                </div>
                <div>
                  <p className="font-semibold text-gray-900">{stats?.avgScore ?? '—'}</p>
                  <p className="text-xs text-gray-500">Avg Score</p>
                </div>
              </div>
            </Link>
          )
        })}
        {jobs.length === 0 && <p className="text-sm text-gray-500">No job postings yet.</p>}
      </div>
    </div>
  )
}
