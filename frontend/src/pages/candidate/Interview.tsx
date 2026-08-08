import { useState } from 'react'
import { candidateApiClient } from '../../api/client'
import type { AIEvaluation, InterviewQuestion, InterviewSession } from '../../types'

export default function Interview() {
  const [session, setSession] = useState<InterviewSession | null>(null)
  const [question, setQuestion] = useState<InterviewQuestion | null>(null)
  const [questionNumber, setQuestionNumber] = useState(1)
  const [answer, setAnswer] = useState('')
  const [finished, setFinished] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function start() {
    setError(null)
    const { data } = await candidateApiClient.post<InterviewSession>('/interviews')
    setSession(data)
    setQuestion(data.questions[0] ?? null)
    setQuestionNumber(1)
  }

  async function submitAnswer() {
    if (!session || !question || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const { data } = await candidateApiClient.post<AIEvaluation>('/ai/evaluate-answer', {
        session_id: session.id,
        question_id: question.id,
        candidate_answer: answer,
      })
      setAnswer('')
      if (data.next_question) {
        setQuestion(data.next_question)
        setQuestionNumber((n) => n + 1)
      } else {
        await candidateApiClient.post(`/interviews/${session.id}/finish`)
        setFinished(true)
      }
    } catch {
      setError('Something went wrong evaluating your answer. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!session) {
    return (
      <div className="mx-auto max-w-lg text-center">
        <button onClick={start} className="rounded bg-gray-900 px-4 py-2 text-white hover:bg-gray-800">
          Start interview
        </button>
      </div>
    )
  }

  if (finished) {
    return <p className="text-center text-gray-900">Thanks — your interview has been submitted.</p>
  }

  return (
    <div className="mx-auto max-w-lg">
      <p className="mb-2 text-xs uppercase text-gray-500">Question {questionNumber}</p>
      <h2 className="mb-4 text-lg font-medium text-gray-900">{question?.text}</h2>
      <textarea
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        rows={5}
        disabled={submitting}
        className="w-full rounded border border-gray-300 px-3 py-2 disabled:opacity-60"
        placeholder="Type your answer (speech-to-text wiring is a follow-up item)"
      />
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <button
        onClick={submitAnswer}
        disabled={submitting || !answer.trim()}
        className="mt-4 w-full rounded bg-gray-900 px-4 py-2 text-white hover:bg-gray-800 disabled:opacity-40"
      >
        {submitting ? 'Evaluating your answer…' : 'Submit answer'}
      </button>
    </div>
  )
}
