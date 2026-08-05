import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import apiClient from '../../api/client'
import type { Job } from '../../types'

export default function JobPostings() {
  const [jobs, setJobs] = useState<Job[]>([])

  useEffect(() => {
    apiClient.get<Job[]>('/jobs').then((res) => setJobs(res.data))
  }, [])

  return (
    <div>
      <h2 className="mb-6 text-xl font-semibold text-gray-900">Job Postings</h2>
      <ul className="divide-y divide-gray-200 rounded border border-gray-200 bg-white">
        {jobs.map((job) => (
          <li key={job.id} className="px-4 py-3">
            <Link to={`/hr/jobs/${job.id}`} className="font-medium text-gray-900 hover:underline">
              {job.title}
            </Link>
            <p className="text-sm text-gray-500">{job.department}</p>
          </li>
        ))}
        {jobs.length === 0 && <li className="px-4 py-3 text-sm text-gray-500">No job postings yet.</li>}
      </ul>
    </div>
  )
}
