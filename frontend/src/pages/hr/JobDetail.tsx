import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import apiClient from '../../api/client'
import type { Candidate, Job } from '../../types'

export default function JobDetail() {
  const { jobId } = useParams()
  const [job, setJob] = useState<Job | null>(null)
  const [candidates, setCandidates] = useState<Candidate[]>([])

  useEffect(() => {
    apiClient.get<Job>(`/jobs/${jobId}`).then((res) => setJob(res.data))
    apiClient.get<Candidate[]>('/candidates', { params: { job_id: jobId } }).then((res) => setCandidates(res.data))
  }, [jobId])

  if (!job) return <p className="text-sm text-gray-500">Loading...</p>

  return (
    <div>
      <h2 className="mb-2 text-xl font-semibold text-gray-900">{job.title}</h2>
      <p className="mb-6 text-sm text-gray-600">{job.description}</p>

      <h3 className="mb-3 text-base font-medium text-gray-900">Candidates</h3>
      <ul className="divide-y divide-gray-200 rounded border border-gray-200 bg-white">
        {candidates.map((c) => (
          <li key={c.id} className="px-4 py-3 text-sm text-gray-900">
            {c.full_name} — {c.email}
          </li>
        ))}
        {candidates.length === 0 && (
          <li className="px-4 py-3 text-sm text-gray-500">No candidates yet.</li>
        )}
      </ul>
    </div>
  )
}
