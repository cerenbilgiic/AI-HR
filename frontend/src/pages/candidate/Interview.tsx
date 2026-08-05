import { useState } from 'react'
import { useParams } from 'react-router-dom'
import apiClient from '../../api/client'
import type { InterviewSession } from '../../types'

export default function Interview() {
  const { candidateId } = useParams()
  const [session, setSession] = useState<InterviewSession | null>(null)
  const [current, setCurrent] = useState(0)
  const [answer, setAnswer] = useState('')
  const [finished, setFinished] = useState(false)

  async function start() {
    const { data } = await apiClient.post<InterviewSession>('/interviews', {
      candidate_id: Number(candidateId),
      job_id: 1,
    })
    setSession(data)
  }

  async function submitAnswer() {
    if (!session) return
    const question = session.questions[current]
    await apiClient.post(`/interviews/${session.id}/answers`, {
      question_id: question.id,
      transcript: answer,
    })
    setAnswer('')
    if (current + 1 < session.questions.length) {
      setCurrent(current + 1)
    } else {
      await apiClient.post(`/interviews/${session.id}/finish`)
      setFinished(true)
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

  const question = session.questions[current]

  return (
    <div className="mx-auto max-w-lg">
      <p className="mb-2 text-xs uppercase text-gray-500">
        Question {current + 1} of {session.questions.length}
      </p>
      <h2 className="mb-4 text-lg font-medium text-gray-900">{question?.text}</h2>
      <textarea
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        rows={5}
        className="w-full rounded border border-gray-300 px-3 py-2"
        placeholder="Type your answer (speech-to-text wiring is a follow-up item)"
      />
      <button
        onClick={submitAnswer}
        className="mt-4 w-full rounded bg-gray-900 px-4 py-2 text-white hover:bg-gray-800"
      >
        {current + 1 < session.questions.length ? 'Next question' : 'Finish interview'}
      </button>
    </div>
  )
}
