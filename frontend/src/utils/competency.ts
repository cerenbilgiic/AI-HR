// Shared between InterviewDetailPanel.tsx (single-session view) and
// CandidateComparison.tsx (side-by-side view) — one source of truth for the
// fixed competency-score keys so both stay in sync.
export const COMPETENCY_LABELS: Record<string, string> = {
  communication: 'İletişim',
  technical_competency: 'Teknik Beceriler',
  problem_solving: 'Problem Çözme',
  teamwork: 'Takım Çalışması',
  customer_service: 'Müşteri Hizmetleri',
  role_fit: 'Pozisyona Uygunluk',
}
