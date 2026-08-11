import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import apiClient from '../../api/client'
import HrStatusBadge from '../../components/HrStatusBadge'
import type { Candidate, InterviewSession, Job } from '../../types'

function latestSessionFor(candidateId: number, sessions: InterviewSession[]): InterviewSession | undefined {
  return sessions
    .filter((s) => s.candidate_id === candidateId)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
}

export default function JobDetail() {
  const { jobId } = useParams()
  const navigate = useNavigate()
  const [job, setJob] = useState<Job | null>(null)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [sessions, setSessions] = useState<InterviewSession[]>([])
  const [evaluatingId, setEvaluatingId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [newQuestion, setNewQuestion] = useState('')
  const [addingQuestion, setAddingQuestion] = useState(false)
  const [questionError, setQuestionError] = useState<string | null>(null)

  function loadJob() {
    apiClient.get<Job>(`/jobs/${jobId}`).then((res) => setJob(res.data))
  }

  function loadSessions() {
    apiClient.get<InterviewSession[]>('/interviews', { params: { job_id: jobId } }).then((res) => setSessions(res.data))
  }

  useEffect(() => {
    loadJob()
    apiClient.get<Candidate[]>('/candidates', { params: { job_id: jobId } }).then((res) => setCandidates(res.data))
    loadSessions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId])

  async function evaluate(sessionId: number) {
    setEvaluatingId(sessionId)
    setError(null)
    try {
      // generate-report (not the older evaluate) is what actually produces
      // overall_score/competency_scores — the "Evaluate" button should
      // always leave the candidate with a real score, not just a summary.
      await apiClient.post(`/interviews/${sessionId}/generate-report`)
      navigate(`/hr/interviews/${sessionId}`)
    } catch {
      setError('Could not evaluate this interview. Please try again.')
    } finally {
      setEvaluatingId(null)
    }
  }

  async function addQuestion() {
    if (!newQuestion.trim() || addingQuestion || !job) return
    setAddingQuestion(true)
    setQuestionError(null)
    try {
      await apiClient.post(`/jobs/${jobId}/questions`, { text: newQuestion.trim(), order: job.questions.length })
      setNewQuestion('')
      loadJob()
    } catch {
      setQuestionError('Could not add this question. Please try again.')
    } finally {
      setAddingQuestion(false)
    }
  }

  async function deleteQuestion(questionId: number) {
    try {
      await apiClient.delete(`/jobs/${jobId}/questions/${questionId}`)
      loadJob()
    } catch {
      setQuestionError('Could not delete this question. Please try again.')
    }
  }

  if (!job) return <p className="text-sm text-gray-500">Loading...</p>

  return (
    <div>
      <h2 className="mb-2 text-xl font-semibold text-gray-900">{job.title}</h2>
      <p className="mb-4 text-sm text-gray-600">{job.description}</p>

      <div className="mb-6 grid grid-cols-3 gap-4 rounded-xl border border-gray-200 bg-white p-4 text-center shadow-sm sm:max-w-md">
        <div>
          <p className="text-xl font-semibold text-gray-900">{candidates.length}</p>
          <p className="text-xs text-gray-500">Applications</p>
        </div>
        <div>
          <p className="text-xl font-semibold text-gray-900">
            {sessions.filter((s) => s.status !== 'pending').length}
          </p>
          <p className="text-xs text-gray-500">Interviewed</p>
        </div>
        <div>
          <p className="text-xl font-semibold text-gray-900">
            {(() => {
              const scores = sessions.map((s) => s.overall_score).filter((s): s is number => s != null)
              return scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : '—'
            })()}
          </p>
          <p className="text-xs text-gray-500">Avg Score</p>
        </div>
      </div>

      <h3 className="mb-3 text-base font-medium text-gray-900">Interview Questions</h3>
      <p className="mb-2 text-xs text-gray-500">
        Every candidate applying to this job is asked these questions, in this order.
      </p>
      {questionError && <p className="mb-2 text-sm text-red-600">{questionError}</p>}
      <ul className="mb-3 divide-y divide-gray-200 rounded border border-gray-200 bg-white">
        {job.questions
          .slice()
          .sort((a, b) => a.order - b.order)
          .map((q, i) => (
            <li key={q.id} className="flex items-center justify-between px-4 py-3 text-sm text-gray-900">
              <span>
                <span className="mr-2 text-gray-400">{i + 1}.</span>
                {q.text}
              </span>
              <button
                onClick={() => void deleteQuestion(q.id)}
                className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
              >
                Delete
              </button>
            </li>
          ))}
        {job.questions.length === 0 && (
          <li className="px-4 py-3 text-sm text-gray-500">
            No questions configured yet — candidates can't start their interview until at least one is added.
          </li>
        )}
      </ul>
      <div className="mb-8 flex gap-2">
        <input
          type="text"
          value={newQuestion}
          onChange={(e) => setNewQuestion(e.target.value)}
          placeholder="Add an interview question"
          className="flex-1 rounded border border-gray-300 px-3 py-1.5 text-sm"
        />
        <button
          onClick={() => void addQuestion()}
          disabled={addingQuestion || !newQuestion.trim()}
          className="rounded bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-40"
        >
          Add question
        </button>
      </div>

      <h3 className="mb-3 text-base font-medium text-gray-900">Candidates</h3>
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      <ul className="divide-y divide-gray-200 rounded border border-gray-200 bg-white">
        {candidates.map((c) => {
          const session = latestSessionFor(c.id, sessions)
          return (
            <li key={c.id} className="flex items-center justify-between px-4 py-3 text-sm text-gray-900">
              <div>
                <p>{c.full_name} — {c.email}</p>
                {session && (
                  <div className="mt-1">
                    <HrStatusBadge status={session.status} />
                  </div>
                )}
              </div>
              {session?.status === 'awaiting_review' && (
                <button
                  onClick={() => void evaluate(session.id)}
                  disabled={evaluatingId === session.id}
                  className="rounded bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-40"
                >
                  {evaluatingId === session.id ? 'Evaluating…' : 'Evaluate'}
                </button>
              )}
              {session?.status === 'completed' && (
                <button
                  onClick={() => navigate(`/hr/interviews/${session.id}`)}
                  className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-900 hover:bg-gray-50"
                >
                  View report
                </button>
              )}
            </li>
          )
        })}
        {candidates.length === 0 && (
          <li className="px-4 py-3 text-sm text-gray-500">No candidates yet.</li>
        )}
      </ul>
    </div>
  )
}
