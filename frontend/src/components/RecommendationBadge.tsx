const RECOMMENDATION_STYLES: Record<string, string> = {
  recommended: 'bg-green-100 text-green-800',
  maybe: 'bg-yellow-100 text-yellow-800',
  not_recommended: 'bg-red-100 text-red-800',
}

// Extracted from InterviewDetail.tsx so the Interviews list, Reports page,
// and CandidateDetail.tsx's summary can all show the same badge.
export default function RecommendationBadge({ recommendation }: { recommendation: string }) {
  const style = RECOMMENDATION_STYLES[recommendation] ?? 'bg-gray-100 text-gray-800'
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${style}`}>
      {recommendation.replaceAll('_', ' ')}
    </span>
  )
}
