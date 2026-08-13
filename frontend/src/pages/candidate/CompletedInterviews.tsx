import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { candidateApiClient } from '../../api/client'
import StatusBadge from '../../components/StatusBadge'
import { candidateFacingStatus, formatDate } from '../../utils/interviewStatus'
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

  if (error) return <p className="text-sm font-medium text-rose-400">{error}</p>
  if (!sessions) return <p className="text-sm text-slate-500">Yükleniyor...</p>

  return (
    <div>
      <h2 className="mb-4 text-xl font-semibold text-slate-100">Mülakat Geçmişi</h2>
      {sessions.length === 0 ? (
        <p className="text-sm text-slate-400">Henüz tamamlanmış bir mülakatınız yok.</p>
      ) : (
        <div className="space-y-3">
          {sessions.map((s) => (
            <div key={s.id} className="rounded-xl border border-slate-800 bg-slate-900 p-4 shadow-sm">
              <div className="flex items-start justify-between">
                <p className="text-sm font-medium text-slate-100">{formatDate(s.created_at)}</p>
                <StatusBadge status={candidateFacingStatus(s)} />
              </div>
              <div className="mt-2 flex gap-6 text-sm text-slate-400">
                <span>Süre: {s.duration_minutes ?? '—'} dk</span>
                <span>
                  Cevaplanan soru: {s.answered_count ?? 0} / {s.questions.length}
                </span>
              </div>
              <Link
                to={`/interview/${candidateId}/home/completed/${s.id}`}
                className="mt-3 inline-block text-sm font-medium text-indigo-400 hover:text-indigo-300"
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
