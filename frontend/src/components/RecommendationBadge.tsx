export const RECOMMENDATION_LABELS: Record<string, string> = {
  recommended: 'Olumlu',
  maybe: 'Belirsiz',
  not_recommended: 'Olumsuz',
}

const RECOMMENDATION_CLASSES: Record<string, string> = {
  recommended: 'bg-emerald-500/15 text-emerald-400',
  maybe: 'bg-amber-500/15 text-amber-400',
  not_recommended: 'bg-rose-500/15 text-rose-400',
}

// Extracted from InterviewDetail.tsx so the Interviews list, Reports page,
// and CandidateDetail.tsx's summary can all show the same badge.
export default function RecommendationBadge({ recommendation }: { recommendation: string }) {
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
        RECOMMENDATION_CLASSES[recommendation] ?? 'bg-slate-500/15 text-slate-400'
      }`}
    >
      {RECOMMENDATION_LABELS[recommendation] ?? recommendation.replaceAll('_', ' ')}
    </span>
  )
}
