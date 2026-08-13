import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { candidateApiClient } from '../../api/client'
import { formatDate } from '../../utils/interviewStatus'
import type { InterviewSession } from '../../types'

export default function MyResults() {
  const { candidateId } = useParams()
  const [sessions, setSessions] = useState<InterviewSession[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    candidateApiClient
      .get<InterviewSession[]>('/interviews')
      .then((res) => {
        const evaluated = res.data
          // Only sessions HR has actually decided on — status "completed"
          // alone just means the AI finished, not that a human reviewed it.
          .filter((s) => s.status === 'completed' && s.hr_decision != null)
          .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
        setSessions(evaluated)
      })
      .catch(() => setError('Sonuçlarınız yüklenemedi. Lütfen tekrar deneyin.'))
  }, [])

  if (error) return <p className="text-sm font-medium text-rose-400">{error}</p>
  if (!sessions) return <p className="text-sm text-slate-500">Yükleniyor...</p>

  return (
    <div>
      <h2 className="mb-4 text-xl font-semibold text-slate-100">Sonuçlarım</h2>
      {sessions.length === 0 ? (
        <p className="text-sm text-slate-400">Henüz değerlendirilmiş bir mülakatınız yok.</p>
      ) : (
        <div className="space-y-3">
          {sessions.map((s) => (
            <Link
              key={s.id}
              to={`/interview/${candidateId}/home/results/${s.id}`}
              className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900 p-4 shadow-sm hover:border-slate-600"
            >
              <span className="text-sm text-slate-100">{formatDate(s.updated_at)}</span>
              <span className="rounded-full bg-indigo-500/15 px-2.5 py-0.5 text-xs font-medium text-indigo-400">
                Sonucu Görüntüle
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
