export interface JobSkill {
  id: number
  name: string
  required_level: string | null
}

export interface Job {
  id: number
  title: string
  description: string
  department: string | null
  location: string | null
  skills: JobSkill[]
}

export interface Candidate {
  id: number
  full_name: string
  email: string
  phone: string | null
  job_id: number
}

export interface InterviewQuestion {
  id: number
  text: string
  order: number
  is_follow_up: boolean
}

export interface InterviewSession {
  id: number
  candidate_id: number
  job_id: number
  status: string
  questions: InterviewQuestion[]
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

export interface InterviewReport {
  id: number
  session_id: number
  summary: string | null
  recommendation: string | null
  scores: AIScores | null
}
