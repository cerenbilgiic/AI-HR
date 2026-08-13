import type { Candidate, InterviewSession } from '../types'

export interface NotificationItem {
  id: string
  title: string
  timestamp: string
}

// No backend notifications table (same approach used on the candidate
// side) — derived from real /interviews + /candidates data. Shared between
// pages/hr/Notifications.tsx (full list, marks as read on visit) and
// Layout.tsx's header bell (unread count only, never marks as read).
export function notificationsFrom(sessions: InterviewSession[], candidates: Candidate[]): NotificationItem[] {
  const candidateById = new Map(candidates.map((c) => [c.id, c]))
  const items: NotificationItem[] = []

  for (const s of sessions) {
    const name = candidateById.get(s.candidate_id)?.full_name ?? 'Bir aday'
    if (s.status === 'awaiting_review') {
      items.push({ id: `completed-${s.id}`, title: `${name} mülakatını tamamladı.`, timestamp: s.updated_at })
    } else if (s.status === 'completed') {
      items.push({ id: `report-${s.id}`, title: `${name} için AI raporu oluşturuldu.`, timestamp: s.updated_at })
    }
  }

  const waiting = sessions.filter((s) => s.status === 'awaiting_review').length
  if (waiting > 0) {
    items.push({
      id: 'waiting-aggregate',
      title: `${waiting} aday değerlendirme bekliyor.`,
      timestamp: new Date().toISOString(),
    })
  }

  return items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
}

export function readKey(userId: number | undefined): string {
  return `hr_notifications_read_${userId ?? 'unknown'}`
}

export function readIds(userId: number | undefined): Set<string> {
  try {
    const raw = localStorage.getItem(readKey(userId))
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    return new Set()
  }
}

export function markAllRead(userId: number | undefined, items: NotificationItem[]): void {
  localStorage.setItem(readKey(userId), JSON.stringify(items.map((n) => n.id)))
}
