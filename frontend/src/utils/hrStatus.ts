// Single source of truth for HR-facing status wording/color — replaces the
// slightly-inconsistent inline STATUS_LABELS maps previously duplicated
// across Dashboard.tsx, CandidateList.tsx, JobDetail.tsx, InterviewDetail.tsx.
// English, unlike the candidate-facing utils/interviewStatus.ts (Turkish) —
// all existing HR copy is English.
export type SessionStatus = 'pending' | 'in_progress' | 'awaiting_review' | 'completed' | 'terminated'

// 'not_invited'/'invited'/'logged_in' are pre-session pipeline states
// (Candidate.invited_at/first_login_at) — not real InterviewSession
// statuses, but folded into the same badge/label so the Candidates table
// only needs one Status column. See pipelineStatus() below.
export type PipelineStatus = 'not_invited' | 'invited' | 'logged_in' | SessionStatus

export const STATUS_LABELS: Record<PipelineStatus, string> = {
  not_invited: 'Beklemede',
  invited: 'Davet Gönderildi',
  logged_in: 'Giriş Yaptı',
  pending: 'Başlamadı',
  in_progress: 'Mülakatta',
  awaiting_review: 'Tamamlandı',
  completed: 'Değerlendirildi',
  terminated: 'Sonlandırıldı',
}

// Translucent color pills for the dark HR theme — bg-{color}-500/15 keeps
// them legible on a dark card without needing a separate dark-mode variant.
const BADGE_CLASSES: Record<PipelineStatus, string> = {
  not_invited: 'bg-slate-500/15 text-slate-400',
  invited: 'bg-sky-500/15 text-sky-400',
  logged_in: 'bg-sky-500/15 text-sky-400',
  pending: 'bg-slate-500/15 text-slate-400',
  in_progress: 'bg-violet-500/15 text-violet-400',
  awaiting_review: 'bg-amber-500/15 text-amber-400',
  completed: 'bg-emerald-500/15 text-emerald-400',
  terminated: 'bg-rose-500/15 text-rose-400',
}

export function statusLabel(status: string | undefined): string {
  if (!status) return STATUS_LABELS.pending
  return STATUS_LABELS[status as SessionStatus] ?? status
}

export function statusBadgeClasses(status?: string): string {
  if (!status) return BADGE_CLASSES.pending
  return BADGE_CLASSES[status as PipelineStatus] ?? BADGE_CLASSES.pending
}

// Combines the candidate's pre-session invite state with their latest
// session's status (if any) into one pipeline status — see the spec's
// Beklemede → Davet Gönderildi → Giriş Yaptı/Mülakatta → Tamamlandı →
// Değerlendirildi flow. Once a session exists, its own status (already
// covering Mülakatta/Tamamlandı/Değerlendirildi/Sonlandırıldı) takes over.
export function pipelineStatus(
  candidate: { invited_at: string | null; first_login_at: string | null },
  latestSession: { status: string } | undefined,
): PipelineStatus {
  if (latestSession) return latestSession.status as SessionStatus
  if (candidate.first_login_at) return 'logged_in'
  if (candidate.invited_at) return 'invited'
  return 'not_invited'
}
