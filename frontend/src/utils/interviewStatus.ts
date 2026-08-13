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

// Translucent color pills for the dark theme — matches utils/hrStatus.ts's
// palette so a given status reads the same color on both the HR and
// candidate sides.
const BADGE_CLASSES: Record<SessionStatus, string> = {
  pending: 'bg-slate-500/15 text-slate-400',
  in_progress: 'bg-violet-500/15 text-violet-400',
  awaiting_review: 'bg-amber-500/15 text-amber-400',
  completed: 'bg-emerald-500/15 text-emerald-400',
  terminated: 'bg-rose-500/15 text-rose-400',
}

export function statusLabel(status: string): string {
  return STATUS_LABELS[status as SessionStatus] ?? status
}

export function statusBadgeClasses(status?: string): string {
  return BADGE_CLASSES[status as SessionStatus] ?? BADGE_CLASSES.pending
}

// The AI finishing its evaluation flips session.status to "completed"
// immediately — before HR has reviewed anything. Candidate-facing pages
// must not say "Değerlendirildi" (or unlock the result) until HR has
// actually recorded a decision (InterviewReport.hr_decision, surfaced here
// as session.hr_decision) — until then this keeps showing the existing
// "Değerlendiriliyor" presentation.
export function candidateFacingStatus(session: { status: string; hr_decision?: string | null }): string {
  return session.status === 'completed' && !session.hr_decision ? 'awaiting_review' : session.status
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
