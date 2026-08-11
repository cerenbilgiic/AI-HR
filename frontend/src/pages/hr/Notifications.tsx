import { useEffect, useState } from 'react'
import apiClient from '../../api/client'
import type { Candidate, InterviewSession } from '../../types'

interface NotificationItem {
  id: string
  title: string
  timestamp: string
}

interface HrUser {
  id: number
}

// No backend notifications table (same approach used on the candidate
// side) — derived from real /interviews + /candidates data.
function notificationsFrom(sessions: InterviewSession[], candidates: Candidate[]): NotificationItem[] {
  const candidateById = new Map(candidates.map((c) => [c.id, c]))
  const items: NotificationItem[] = []

  for (const s of sessions) {
    const name = candidateById.get(s.candidate_id)?.full_name ?? 'A candidate'
    if (s.status === 'awaiting_review') {
      items.push({ id: `completed-${s.id}`, title: `${name} completed an interview.`, timestamp: s.updated_at })
    } else if (s.status === 'completed') {
      items.push({ id: `report-${s.id}`, title: `AI report generated for ${name}.`, timestamp: s.updated_at })
    }
  }

  const waiting = sessions.filter((s) => s.status === 'awaiting_review').length
  if (waiting > 0) {
    items.push({
      id: 'waiting-aggregate',
      title: `${waiting} candidate${waiting === 1 ? ' is' : 's are'} waiting for evaluation.`,
      timestamp: new Date().toISOString(),
    })
  }

  return items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
}

function readKey(userId: number | undefined): string {
  return `hr_notifications_read_${userId ?? 'unknown'}`
}

function readIds(userId: number | undefined): Set<string> {
  try {
    const raw = localStorage.getItem(readKey(userId))
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    return new Set()
  }
}

export default function Notifications() {
  const [items, setItems] = useState<NotificationItem[] | null>(null)
  const [alreadyRead, setAlreadyRead] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      apiClient.get<InterviewSession[]>('/interviews'),
      apiClient.get<Candidate[]>('/candidates'),
      apiClient.get<HrUser>('/users/me'),
    ])
      .then(([sessionsRes, candidatesRes, meRes]) => {
        const derived = notificationsFrom(sessionsRes.data, candidatesRes.data)
        setAlreadyRead(readIds(meRes.data.id))
        setItems(derived)
        localStorage.setItem(readKey(meRes.data.id), JSON.stringify(derived.map((n) => n.id)))
      })
      .catch(() => setError('Unable to load notifications.'))
  }, [])

  if (error) return <p className="text-sm text-red-600">{error}</p>
  if (!items) return <p className="text-sm text-gray-500">Loading notifications...</p>

  return (
    <div>
      <h2 className="mb-6 text-xl font-semibold text-gray-900">Notifications</h2>
      {items.length === 0 ? (
        <p className="text-sm text-gray-600">No notifications yet.</p>
      ) : (
        <div className="space-y-2">
          {items.map((n) => {
            const isUnread = !alreadyRead.has(n.id)
            return (
              <div
                key={n.id}
                className={`flex items-start gap-3 rounded-xl border p-4 shadow-sm ${
                  isUnread ? 'border-indigo-200 bg-indigo-50/50' : 'border-gray-200 bg-white'
                }`}
              >
                <span className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${isUnread ? 'bg-indigo-500' : 'bg-gray-300'}`} />
                <div>
                  <p className="text-sm font-medium text-gray-900">{n.title}</p>
                  <p className="mt-0.5 text-xs text-gray-500">{new Date(n.timestamp).toLocaleString()}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
