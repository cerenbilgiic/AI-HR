import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import apiClient from '../../api/client'
import type { Candidate, InterviewReport, InterviewSession, Job } from '../../types'

const STATUS_LABELS: Record<string, string> = {
  in_progress: 'In progress',
  awaiting_review: 'Awaiting review',
  completed: 'Completed',
  pending: 'Pending',
}

const RECOMMENDATION_STYLES: Record<string, string> = {
  recommended: 'bg-green-100 text-green-800',
  maybe: 'bg-yellow-100 text-yellow-800',
  not_recommended: 'bg-red-100 text-red-800',
}

const COMPETENCY_LABELS: Record<string, string> = {
  communication: 'Communication',
  technical_competency: 'Technical Skills',
  problem_solving: 'Problem Solving',
  teamwork: 'Teamwork',
  customer_service: 'Customer Service',
  role_fit: 'Role Fit',
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm">
        <span className="text-gray-700">{label}</span>
        <span className="font-medium text-gray-900">{value}</span>
      </div>
      <div className="h-2 w-full rounded-full bg-gray-100">
        <div className="h-2 rounded-full bg-indigo-600" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
    </div>
  )
}

function RecommendationBadge({ recommendation }: { recommendation: string }) {
  const style = RECOMMENDATION_STYLES[recommendation] ?? 'bg-gray-100 text-gray-800'
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${style}`}>
      {recommendation.replaceAll('_', ' ')}
    </span>
  )
}

// The recording-url endpoint returns an already-/api/v1-prefixed path (see
// LocalFileStorage.presigned_url) but apiClient's baseURL already includes
// /api/v1 — strip the duplicate prefix before requesting through apiClient.
function toApiPath(urlFromBackend: string): string {
  return urlFromBackend.startsWith('/api/v1') ? urlFromBackend.slice('/api/v1'.length) : urlFromBackend
}

export default function InterviewDetail() {
  const { sessionId } = useParams()
  const [session, setSession] = useState<InterviewSession | null>(null)
  const [candidate, setCandidate] = useState<Candidate | null>(null)
  const [job, setJob] = useState<Job | null>(null)
  const [report, setReport] = useState<InterviewReport | null>(null)
  const [reportChecked, setReportChecked] = useState(false)
  const [videoObjectUrl, setVideoObjectUrl] = useState<string | null>(null)
  const [videoError, setVideoError] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    apiClient
      .get<InterviewSession>(`/interviews/${sessionId}`)
      .then((res) => {
        setSession(res.data)
        return Promise.all([
          apiClient.get<Candidate>(`/candidates/${res.data.candidate_id}`),
          apiClient.get<Job>(`/jobs/${res.data.job_id}`),
        ])
      })
      .then(([candidateRes, jobRes]) => {
        setCandidate(candidateRes.data)
        setJob(jobRes.data)
      })
      .catch(() => setError('Unable to load interview information.'))
  }, [sessionId])

  useEffect(() => {
    apiClient
      .get<InterviewReport>(`/reports/session/${sessionId}`)
      .then((res) => setReport(res.data))
      .catch(() => setReport(null))
      .finally(() => setReportChecked(true))
  }, [sessionId])

  useEffect(() => {
    if (!session?.recording_path) return
    let cancelled = false
    let createdUrl: string | null = null
    apiClient
      .get<{ url: string }>(`/interviews/${sessionId}/recording-url`)
      // <video src> can't send an Authorization header, so the media
      // endpoint (which requires one) has to be fetched as a blob instead
      // of linked to directly.
      .then((res) => apiClient.get(toApiPath(res.data.url), { responseType: 'blob' }))
      .then((res) => {
        if (cancelled) return
        createdUrl = URL.createObjectURL(res.data)
        setVideoObjectUrl(createdUrl)
      })
      .catch(() => setVideoError(true))
    return () => {
      cancelled = true
      if (createdUrl) URL.revokeObjectURL(createdUrl)
    }
  }, [sessionId, session?.recording_path])

  if (error) return <p className="text-sm text-red-600">{error}</p>
  if (!session || !candidate) return <p className="text-sm text-gray-500">Loading interview information...</p>

  const answeredCount = session.questions.filter((q) => q.answer?.transcript).length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-gray-900">{candidate.full_name}</h2>
        <p className="text-sm text-gray-500">{job?.title ?? 'Unknown position'}</p>
        <dl className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs uppercase text-gray-500">Status</dt>
            <dd className="text-gray-900">{STATUS_LABELS[session.status] ?? session.status}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-gray-500">Started</dt>
            <dd className="text-gray-900">{new Date(session.created_at).toLocaleString()}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-gray-500">Last updated</dt>
            <dd className="text-gray-900">{new Date(session.updated_at).toLocaleString()}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-gray-500">Questions answered</dt>
            <dd className="text-gray-900">
              {answeredCount} / {session.questions.length}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-gray-500">Overall AI score</dt>
            <dd className="text-gray-900">{session.overall_score != null ? `${session.overall_score} / 100` : '—'}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-gray-500">Recommendation</dt>
            <dd>{session.recommendation ? <RecommendationBadge recommendation={session.recommendation} /> : '—'}</dd>
          </div>
        </dl>
      </div>

      {/* Q&A history */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-base font-medium text-gray-900">Questions &amp; Answers</h3>
        <div className="space-y-5">
          {session.questions
            .slice()
            .sort((a, b) => a.order - b.order)
            .map((q, i) => (
              <div key={q.id} className="border-b border-gray-100 pb-4 last:border-0 last:pb-0">
                <p className="text-xs uppercase tracking-wide text-gray-500">Question {i + 1}</p>
                <p className="mt-1 font-medium text-gray-900">{q.text}</p>
                <p className="mt-2 text-sm text-gray-700">
                  <span className="font-medium text-gray-900">Answer: </span>
                  {q.answer?.transcript || 'No answer provided.'}
                </p>
                {q.answer?.evaluation ? (
                  <div className="mt-2 rounded bg-gray-50 p-2 text-xs text-gray-600">
                    <p>
                      <span className="font-medium text-gray-900">AI Score: </span>
                      {q.answer.evaluation.score ?? '—'} &nbsp;
                      <span className="font-medium text-gray-900">Competency: </span>
                      {q.answer.evaluation.competency ?? '—'}
                    </p>
                    {q.answer.evaluation.feedback && (
                      <p className="mt-1">
                        <span className="font-medium text-gray-900">Feedback: </span>
                        {q.answer.evaluation.feedback}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-gray-400">Not evaluated individually.</p>
                )}
              </div>
            ))}
        </div>
      </div>

      {/* Transcript */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-base font-medium text-gray-900">Interview Transcript</h3>
        {answeredCount === 0 ? (
          <p className="text-sm text-gray-500">No transcript available.</p>
        ) : (
          <div className="space-y-3 text-sm">
            {session.questions
              .slice()
              .sort((a, b) => a.order - b.order)
              .map((q) => (
                <div key={q.id}>
                  <p>
                    <span className="font-semibold text-indigo-700">AI: </span>
                    {q.text}
                  </p>
                  <p>
                    <span className="font-semibold text-gray-900">Candidate: </span>
                    {q.answer?.transcript || '(no response)'}
                  </p>
                </div>
              ))}
          </div>
        )}
      </div>

      {/* Video */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-base font-medium text-gray-900">Video Recording</h3>
        {session.recording_path ? (
          videoObjectUrl ? (
            <video controls className="w-full max-w-xl rounded bg-black" src={videoObjectUrl} />
          ) : videoError ? (
            <p className="text-sm text-red-600">Could not load the video recording.</p>
          ) : (
            <p className="text-sm text-gray-500">Loading video...</p>
          )
        ) : (
          <p className="text-sm text-gray-500">No video recording available for this interview.</p>
        )}
      </div>

      {/* AI Score section */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-base font-medium text-gray-900">AI Score</h3>
        {!reportChecked ? (
          <p className="text-sm text-gray-500">Loading scores...</p>
        ) : report?.competency_scores ? (
          <>
            <p className="mb-4 text-3xl font-semibold text-gray-900">
              {report.overall_score} <span className="text-base font-normal text-gray-500">/ 100</span>
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {Object.entries(report.competency_scores).map(([key, value]) => (
                <ScoreBar key={key} label={COMPETENCY_LABELS[key] ?? key} value={value} />
              ))}
            </div>
          </>
        ) : (
          <p className="text-sm text-gray-500">AI interview report has not been generated yet.</p>
        )}
      </div>

      {/* Final report */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-base font-medium text-gray-900">Final AI Report</h3>
        {!reportChecked ? (
          <p className="text-sm text-gray-500">Loading report...</p>
        ) : report ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              {report.overall_score != null && (
                <span className="text-2xl font-semibold text-gray-900">{report.overall_score}/100</span>
              )}
              {report.recommendation && <RecommendationBadge recommendation={report.recommendation} />}
            </div>
            {report.strengths && report.strengths.length > 0 && (
              <div>
                <h4 className="mb-1 text-sm font-medium text-gray-900">Strengths</h4>
                <ul className="list-inside list-disc text-sm text-gray-700">
                  {report.strengths.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
            )}
            {report.development_areas && report.development_areas.length > 0 && (
              <div>
                <h4 className="mb-1 text-sm font-medium text-gray-900">Development Areas</h4>
                <ul className="list-inside list-disc text-sm text-gray-700">
                  {report.development_areas.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              </div>
            )}
            {report.summary && (
              <div>
                <h4 className="mb-1 text-sm font-medium text-gray-900">Summary</h4>
                <p className="text-sm text-gray-700">{report.summary}</p>
              </div>
            )}
            {report.evidence && report.evidence.length > 0 && (
              <div>
                <h4 className="mb-1 text-sm font-medium text-gray-900">Evidence</h4>
                <ul className="space-y-1 text-sm text-gray-700">
                  {report.evidence.map((e, i) => (
                    <li key={i}>
                      <span className="font-medium text-gray-900 capitalize">
                        {(COMPETENCY_LABELS[e.competency] ?? e.competency).toString()}:{' '}
                      </span>
                      "{e.evidence}"
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-500">AI interview report has not been generated yet.</p>
        )}
      </div>
    </div>
  )
}
