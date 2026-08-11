import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { candidateApiClient } from '../../api/client'
import { formatDate } from '../../utils/interviewStatus'
import type { InterviewSession } from '../../types'

// Candidate-facing outcome is deliberately binary — "maybe" reads the same
// as a rejection to a candidate, only an explicit "recommended" is shown as
// positive (same rule as InterviewResultDetail.tsx).
function verdictOf(session: InterviewSession): { label: string; classes: string } {
  return session.recommendation === 'recommended'
    ? { label: 'Olumlu', classes: 'bg-green-100 text-green-700' }
    : { label: 'Olumsuz', classes: 'bg-red-100 text-red-700' }
}

export default function MyResults() {
  const { candidateId } = useParams()
  const [sessions, setSessions] = useState<InterviewSession[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    candidateApiClient
      .get<InterviewSession[]>('/interviews')
      .then((res) => {
        const evaluated = res.data
          .filter((s) => s.status === 'completed')
          .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
        setSessions(evaluated)
      })
      .catch(() => setError('Sonuçlarınız yüklenemedi. Lütfen tekrar deneyin.'))
  }, [])

  if (error) return <p className="text-sm text-red-600">{error}</p>
  if (!sessions) return <p className="text-sm text-gray-500">Yükleniyor...</p>

  return (
    <div>
      <h2 className="mb-4 text-xl font-semibold text-gray-900">Sonuçlarım</h2>
      {sessions.length === 0 ? (
        <p className="text-sm text-gray-600">Henüz değerlendirilmiş bir mülakatınız yok.</p>
      ) : (
        <div className="space-y-3">
          {sessions.map((s) => {
            const verdict = verdictOf(s)
            return (
              <Link
                key={s.id}
                to={`/interview/${candidateId}/home/results/${s.id}`}
                className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4 shadow-sm hover:border-indigo-200"
              >
                <span className="text-sm text-gray-900">{formatDate(s.updated_at)}</span>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${verdict.classes}`}>
                  {verdict.label}
                </span>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
