import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { candidateApiClient } from '../../api/client'
import StatusBadge from '../../components/StatusBadge'
import { formatDate } from '../../utils/interviewStatus'
import type { InterviewSession } from '../../types'

export default function CompletedInterviews() {
  const { candidateId } = useParams()
  const [sessions, setSessions] = useState<InterviewSession[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    candidateApiClient
      .get<InterviewSession[]>('/interviews')
      .then((res) => {
        const completed = res.data
          .filter((s) => s.status === 'awaiting_review' || s.status === 'completed')
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        setSessions(completed)
      })
      .catch(() => setError('Mülakatlarınız yüklenemedi. Lütfen tekrar deneyin.'))
  }, [])

  if (error) return <p className="text-sm text-red-600">{error}</p>
  if (!sessions) return <p className="text-sm text-gray-500">Yükleniyor...</p>

  return (
    <div>
      <h2 className="mb-4 text-xl font-semibold text-gray-900">Mülakat Geçmişi</h2>
      {sessions.length === 0 ? (
        <p className="text-sm text-gray-600">Henüz tamamlanmış bir mülakatınız yok.</p>
      ) : (
        <div className="space-y-3">
          {sessions.map((s) => (
            <div key={s.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between">
                <p className="text-sm font-medium text-gray-900">{formatDate(s.created_at)}</p>
                <StatusBadge status={s.status} />
              </div>
              <div className="mt-2 flex gap-6 text-sm text-gray-600">
                <span>Süre: {s.duration_minutes ?? '—'} dk</span>
                <span>
                  Cevaplanan soru: {s.answered_count ?? 0} / {s.questions.length}
                </span>
              </div>
              <Link
                to={`/interview/${candidateId}/home/completed/${s.id}`}
                className="mt-3 inline-block text-sm font-medium text-indigo-600 hover:underline"
              >
                Detayları Görüntüle →
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
