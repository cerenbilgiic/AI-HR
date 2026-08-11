import type { InterviewSession } from '../types'

export type SessionStatus = 'pending' | 'in_progress' | 'awaiting_review' | 'completed' | 'terminated'

// Single source of truth for status -> label/color — every candidate-facing
// page derives its wording from InterviewSession.status (there's no separate
// "application status" concept in the data model).
export const STATUS_LABELS: Record<SessionStatus, string> = {
  pending: 'Başlamadı',
  in_progress: 'Devam Ediyor',
  awaiting_review: 'Değerlendiriliyor',
  completed: 'Değerlendirildi',
  terminated: 'Sonlandırıldı',
}

export const STATUS_BADGE_CLASSES: Record<SessionStatus, string> = {
  pending: 'bg-gray-100 text-gray-700',
  in_progress: 'bg-blue-100 text-blue-700',
  awaiting_review: 'bg-amber-100 text-amber-700',
  completed: 'bg-green-100 text-green-700',
  terminated: 'bg-red-100 text-red-700',
}

export function statusLabel(status: string): string {
  return STATUS_LABELS[status as SessionStatus] ?? status
}

export function statusBadgeClasses(status: string): string {
  return STATUS_BADGE_CLASSES[status as SessionStatus] ?? 'bg-gray-100 text-gray-700'
}

// "Applied" is the only application-level state that exists before any
// interview session does — everything after that is just the latest
// session's status.
export function applicationStatusLabel(latestSession: InterviewSession | null): string {
  return latestSession ? statusLabel(latestSession.status) : 'Başvuruldu'
}

export function latestSessionOf(sessions: InterviewSession[]): InterviewSession | null {
  if (sessions.length === 0) return null
  return sessions
    .slice()
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
}

export function daysRemainingText(deadline: string): string {
  const diffMs = new Date(deadline).getTime() - Date.now()
  const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
  if (days < 0) return 'Süre doldu'
  if (days === 0) return 'Son gün bugün'
  return `Son gün için ${days} gün kaldı`
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })
}
