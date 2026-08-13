import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import apiClient from '../../api/client'
import type { Candidate, InterviewSession, Job, JobTransferRequest } from '../../types'

const TRANSFER_STATUS_LABELS: Record<string, string> = {
  pending: 'Bekliyor',
  approved: 'Onaylandı',
  rejected: 'Reddedildi',
}

export default function JobPostings() {
  const [jobs, setJobs] = useState<Job[] | null>(null)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [sessions, setSessions] = useState<InterviewSession[]>([])
  const [error, setError] = useState<string | null>(null)

  const [incoming, setIncoming] = useState<JobTransferRequest[]>([])
  const [outgoing, setOutgoing] = useState<JobTransferRequest[]>([])
  const [respondingId, setRespondingId] = useState<number | null>(null)

  function loadTransferRequests() {
    apiClient.get<JobTransferRequest[]>('/jobs/transfer-requests/incoming').then((res) => setIncoming(res.data))
    apiClient.get<JobTransferRequest[]>('/jobs/transfer-requests/outgoing').then((res) => setOutgoing(res.data))
  }

  useEffect(() => {
    Promise.all([
      apiClient.get<Job[]>('/jobs', { params: { scope: 'mine' } }),
      apiClient.get<Candidate[]>('/candidates'),
      apiClient.get<InterviewSession[]>('/interviews'),
    ])
      .then(([jobsRes, candidatesRes, sessionsRes]) => {
        setJobs(jobsRes.data)
        setCandidates(candidatesRes.data)
        setSessions(sessionsRes.data)
      })
      .catch(() => setError('İş ilanları yüklenemedi.'))
    loadTransferRequests()
  }, [])

  async function respond(requestId: number, approve: boolean) {
    setRespondingId(requestId)
    try {
      await apiClient.post(`/jobs/transfer-requests/${requestId}/respond`, { approve })
      loadTransferRequests()
      apiClient.get<Job[]>('/jobs', { params: { scope: 'mine' } }).then((res) => setJobs(res.data))
    } finally {
      setRespondingId(null)
    }
  }

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

  if (error) return <p className="text-sm font-medium text-rose-400">{error}</p>
  if (!jobs) return <p className="text-sm text-slate-500">İş ilanları yükleniyor...</p>

  return (
    <div>
      <h2 className="mb-6 text-xl font-semibold text-slate-100">İş İlanları</h2>

      {incoming.length > 0 && (
        <div className="mb-6">
          <h3 className="mb-2 text-sm font-medium text-slate-100">Devir Talepleriniz</h3>
          <ul className="divide-y divide-slate-800 rounded border border-slate-800 bg-slate-900">
            {incoming.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm text-slate-100">
                <span>
                  <span className="font-medium">{r.job_title}</span>
                  <span className="text-slate-500"> — {r.from_user_name ?? 'bilinmeyen'} kullanıcısından</span>
                </span>
                <span className="flex gap-2">
                  <button
                    onClick={() => void respond(r.id, true)}
                    disabled={respondingId === r.id}
                    className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
                  >
                    Onayla
                  </button>
                  <button
                    onClick={() => void respond(r.id, false)}
                    disabled={respondingId === r.id}
                    className="rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-800 disabled:opacity-40"
                  >
                    Reddet
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {outgoing.length > 0 && (
        <div className="mb-6">
          <h3 className="mb-2 text-sm font-medium text-slate-100">Gönderdiğim Talepler</h3>
          <ul className="divide-y divide-slate-800 rounded border border-slate-800 bg-slate-900">
            {outgoing.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm text-slate-100">
                <span>
                  <span className="font-medium">{r.job_title}</span>
                  <span className="text-slate-500"> — {r.to_user_name ?? 'bilinmeyen'} kullanıcısına</span>
                </span>
                <span className="text-xs text-slate-500">{TRANSFER_STATUS_LABELS[r.status] ?? r.status}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {jobs.map((job) => {
          const stats = statsByJob.get(job.id)
          return (
            <Link
              key={job.id}
              to={`/hr/jobs/${job.id}`}
              className="rounded-xl border border-slate-800 bg-slate-900 p-4 shadow-sm hover:border-slate-600"
            >
              <p className="font-medium text-slate-100">{job.title}</p>
              <p className="text-sm text-slate-500">{job.department}</p>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
                <div>
                  <p className="font-semibold text-slate-100">{stats?.applications ?? 0}</p>
                  <p className="text-xs text-slate-500">Başvuru</p>
                </div>
                <div>
                  <p className="font-semibold text-slate-100">{stats?.interviewed ?? 0}</p>
                  <p className="text-xs text-slate-500">Mülakat</p>
                </div>
                <div>
                  <p className="font-semibold text-slate-100">{stats?.avgScore ?? '—'}</p>
                  <p className="text-xs text-slate-500">Ort. Puan</p>
                </div>
              </div>
            </Link>
          )
        })}
        {jobs.length === 0 && <p className="text-sm text-slate-500">Henüz iş ilanı yok.</p>}
      </div>
    </div>
  )
}
