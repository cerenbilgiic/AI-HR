import { useEffect, useState } from 'react'
import apiClient from '../../api/client'
import type { Candidate } from '../../types'

export default function CandidateList() {
  const [candidates, setCandidates] = useState<Candidate[]>([])

  useEffect(() => {
    apiClient.get<Candidate[]>('/candidates').then((res) => setCandidates(res.data))
  }, [])

  return (
    <div>
      <h2 className="mb-6 text-xl font-semibold text-gray-900">Candidates</h2>
      <ul className="divide-y divide-gray-200 rounded border border-gray-200 bg-white">
        {candidates.map((c) => (
          <li key={c.id} className="px-4 py-3">
            <p className="font-medium text-gray-900">{c.full_name}</p>
            <p className="text-sm text-gray-500">{c.email}</p>
          </li>
        ))}
        {candidates.length === 0 && <li className="px-4 py-3 text-sm text-gray-500">No candidates yet.</li>}
      </ul>
    </div>
  )
}
