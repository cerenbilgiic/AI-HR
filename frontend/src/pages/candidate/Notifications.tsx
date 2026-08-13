import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { candidateApiClient } from '../../api/client'
import { candidateFacingStatus } from '../../utils/interviewStatus'
import type { InterviewSession } from '../../types'

interface NotificationItem {
  id: number
  title: string
  timestamp: string
}

// There's no backend notifications table (confirmed with the user) — these
// are derived from the candidate's own real interview session data, one
// notification per session reflecting its current status. Read/unread state
// is tracked client-side only (localStorage), not persisted server-side.
// Uses candidateFacingStatus so "Mülakatınız değerlendirildi." only fires
// once HR has actually recorded a decision — the AI finishing its own
// evaluation isn't something the candidate is told about.
function notificationsFrom(sessions: InterviewSession[]): NotificationItem[] {
  const items: NotificationItem[] = []
  for (const s of sessions) {
    const status = candidateFacingStatus(s)
    if (status === 'in_progress') {
      items.push({ id: s.id, title: 'Mülakatınız başlatıldı.', timestamp: s.created_at })
    } else if (status === 'awaiting_review') {
      items.push({
        id: s.id,
        title: 'Mülakatınız tamamlandı, değerlendirme bekleniyor.',
        timestamp: s.updated_at,
      })
    } else if (status === 'completed') {
      items.push({ id: s.id, title: 'Mülakatınız değerlendirildi.', timestamp: s.updated_at })
    } else if (status === 'terminated') {
      items.push({ id: s.id, title: 'Mülakatınız sonlandırıldı.', timestamp: s.updated_at })
    }
  }
  return items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
}

function readKey(candidateId: string | undefined): string {
  return `notifications_read_${candidateId ?? 'unknown'}`
}

function readIds(candidateId: string | undefined): Set<number> {
  try {
    const raw = localStorage.getItem(readKey(candidateId))
    return new Set(raw ? (JSON.parse(raw) as number[]) : [])
  } catch {
    return new Set()
  }
}

export default function Notifications() {
  const { candidateId } = useParams()
  const [items, setItems] = useState<NotificationItem[] | null>(null)
  const [alreadyRead] = useState(() => readIds(candidateId))
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    candidateApiClient
      .get<InterviewSession[]>('/interviews')
      .then((res) => {
        const derived = notificationsFrom(res.data)
        setItems(derived)
        localStorage.setItem(readKey(candidateId), JSON.stringify(derived.map((n) => n.id)))
      })
      .catch(() => setError('Bildirimleriniz yüklenemedi. Lütfen tekrar deneyin.'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (error) return <p className="text-sm font-medium text-rose-400">{error}</p>
  if (!items) return <p className="text-sm text-slate-500">Yükleniyor...</p>

  return (
    <div>
      <h2 className="mb-4 text-xl font-semibold text-slate-100">Bildirimler</h2>
      {items.length === 0 ? (
        <p className="text-sm text-slate-400">Henüz bir bildiriminiz yok.</p>
      ) : (
        <div className="space-y-2">
          {items.map((n) => {
            const isUnread = !alreadyRead.has(n.id)
            return (
              <div
                key={n.id}
                className={`flex items-start gap-3 rounded-xl border p-4 shadow-sm ${
                  isUnread ? 'border-indigo-500/30 bg-indigo-500/5' : 'border-slate-800 bg-slate-900'
                }`}
              >
                <span
                  className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${
                    isUnread ? 'bg-indigo-400' : 'bg-slate-600'
                  }`}
                />
                <div>
                  <p className="text-sm font-medium text-slate-100">{n.title}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {new Date(n.timestamp).toLocaleString('tr-TR')}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
