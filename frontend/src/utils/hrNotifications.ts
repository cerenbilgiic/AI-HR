import type { Candidate, InterviewSession } from '../types'

export interface NotificationItem {
  id: string
  title: string
  timestamp: string
}

// The "N candidates awaiting review" digest is meant to arrive once a day,
// at 09:00, not re-timestamp itself to "now" every time the page happens to
// load. Returns the most recent 09:00 that has already passed — today's if
// it's already past 9am, otherwise yesterday's (today's digest hasn't
// "arrived" yet). id is date-namespaced (see notificationsFrom below) so
// each day's digest can be read/unread independently — a static id would
// mean marking today's read also permanently hides every future day's.
function latestDailyDigestTime(): Date {
  const now = new Date()
  const nineAM = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0, 0, 0)
  if (now < nineAM) {
    nineAM.setDate(nineAM.getDate() - 1)
  }
  return nineAM
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
    const digestTime = latestDailyDigestTime()
    items.push({
      id: `waiting-aggregate-${digestTime.toISOString().slice(0, 10)}`,
      title: `${waiting} aday değerlendirme bekliyor.`,
      timestamp: digestTime.toISOString(),
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
