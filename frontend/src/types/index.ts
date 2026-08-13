export interface JobSkill {
  id: number
  name: string
  required_level: string | null
}

export interface JobQuestionItem {
  id: number
  text: string
  order: number
}

export interface Job {
  id: number
  title: string
  description: string
  department: string | null
  location: string | null
  created_by_id: number
  created_by_name: string | null
  skills: JobSkill[]
  questions: JobQuestionItem[]
}

export interface JobTransferRequest {
  id: number
  job_id: number
  job_title: string
  from_user_id: number
  from_user_name: string | null
  to_user_id: number
  to_user_name: string | null
  requested_by_id: number
  requested_by_name: string | null
  status: string
  created_at: string
  responded_at: string | null
}

export interface Candidate {
  id: number
  full_name: string
  email: string
  phone: string | null
  job_id: number
  created_at: string
  login_email: string | null
  invited_at: string | null
  first_login_at: string | null
}

export interface CandidateCV {
  id: number
  candidate_id: number
  file_path: string
  parsed_text: string | null
  analysis: { strengths?: string[]; weaknesses?: string[]; summary?: string } | null
}

export interface CandidateSkillItem {
  id: number
  candidate_id: number
  name: string
}

export interface CandidateDetail extends Candidate {
  cvs: CandidateCV[]
  skills: CandidateSkillItem[]
  interview_deadline: string | null
}

export interface AnswerEvaluation {
  competency: string | null
  score: number | null
  feedback: string | null
}

export interface CandidateAnswer {
  id: number
  transcript: string | null
  created_at: string
  evaluation: AnswerEvaluation | null
  recording_start_offset_seconds: number | null
}

export interface InterviewQuestion {
  id: number
  text: string
  order: number
  is_follow_up: boolean
  category: string | null
  difficulty: string | null
  answer: CandidateAnswer | null
}

export interface InterviewSession {
  id: number
  candidate_id: number
  job_id: number
  status: string
  created_at: string
  updated_at: string
  recording_path: string | null
  overall_score: number | null
  recommendation: string | null
  hr_decision: string | null
  report_created_at: string | null
  duration_minutes: number | null
  answered_count: number | null
  questions: InterviewQuestion[]
  risk_score: number | null
  violation_counts: Record<string, number> | null
}

export interface InvitationOut {
  candidate_id: number
  login_email: string
  password: string
}

export interface ImportRowError {
  row: number
  message: string
}

export interface ImportRowDuplicate {
  row: number
  email: string
}

export interface CandidateImportSummary {
  created: number
  errors: ImportRowError[]
  duplicates: ImportRowDuplicate[]
}

export interface AIEvaluation {
  competency: string | null
  score: number | null
  is_sufficient: boolean
  follow_up_needed: boolean
  feedback: string | null
  next_question: InterviewQuestion | null
}

export interface AITranscription {
  transcript: string
  object_key: string
}

export interface AIScores {
  technical_competency: number | null
  communication_skills: number | null
  problem_solving: number | null
  job_role_compatibility: number | null
  response_quality: number | null
  confidence: number | null
  overall_score: number | null
}

export interface CompetencyScores {
  communication: number
  technical_competency: number
  problem_solving: number
  teamwork: number
  customer_service: number
  role_fit: number
}

export interface ReportEvidenceItem {
  competency: string
  evidence: string
}

export interface InterviewReport {
  id: number
  session_id: number
  summary: string | null
  recommendation: string | null
  hr_decision: string | null
  scores: AIScores | null
  overall_score: number | null
  competency_scores: CompetencyScores | null
  strengths: string[] | null
  development_areas: string[] | null
  evidence: ReportEvidenceItem[] | null
}

export interface AuditLogEntry {
  id: number
  created_at: string
  actor_type: string
  actor_name: string | null
  candidate_name: string | null
  action: string
  detail: Record<string, unknown> | null
}
