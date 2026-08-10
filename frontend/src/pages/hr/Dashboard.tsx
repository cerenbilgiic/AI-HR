import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import apiClient from '../../api/client'
import type { Candidate, InterviewSession } from '../../types'

const ACTIVE_STATUSES = new Set(['in_progress', 'awaiting_review'])

export default function Dashboard() {
  const [candidates, setCandidates] = useState<Candidate[] | null>(null)
  const [sessions, setSessions] = useState<InterviewSession[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([apiClient.get<Candidate[]>('/candidates'), apiClient.get<InterviewSession[]>('/interviews')])
      .then(([candidatesRes, sessionsRes]) => {
        setCandidates(candidatesRes.data)
        setSessions(sessionsRes.data)
      })
      .catch(() => setError('Unable to load dashboard data.'))
  }, [])

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
      <div className="mt-6">
        <Link to="/hr/candidates" className="text-sm font-medium text-indigo-600 hover:text-indigo-700">
          View all candidates →
        </Link>
      </div>
    </div>
  )
}
