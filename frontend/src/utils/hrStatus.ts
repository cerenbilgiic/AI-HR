// Single source of truth for HR-facing status wording/color — replaces the
// slightly-inconsistent inline STATUS_LABELS maps previously duplicated
// across Dashboard.tsx, CandidateList.tsx, JobDetail.tsx, InterviewDetail.tsx.
// English, unlike the candidate-facing utils/interviewStatus.ts (Turkish) —
// all existing HR copy is English.
export type SessionStatus = 'pending' | 'in_progress' | 'awaiting_review' | 'completed' | 'terminated'

export const STATUS_LABELS: Record<SessionStatus, string> = {
  pending: 'Not started',
  in_progress: 'In progress',
  awaiting_review: 'Awaiting review',
  completed: 'Completed',
  terminated: 'Terminated',
}

export const STATUS_BADGE_CLASSES: Record<SessionStatus, string> = {
  pending: 'bg-gray-100 text-gray-700',
  in_progress: 'bg-blue-100 text-blue-700',
  awaiting_review: 'bg-amber-100 text-amber-700',
  completed: 'bg-green-100 text-green-700',
  terminated: 'bg-red-100 text-red-700',
}

export function statusLabel(status: string | undefined): string {
  if (!status) return STATUS_LABELS.pending
  return STATUS_LABELS[status as SessionStatus] ?? status
}

export function statusBadgeClasses(status: string | undefined): string {
  if (!status) return STATUS_BADGE_CLASSES.pending
  return STATUS_BADGE_CLASSES[status as SessionStatus] ?? 'bg-gray-100 text-gray-700'
}
