import { useRef, useState } from 'react'
import { candidateApiClient } from '../../api/client'
import type { AIEvaluation, AITranscription, InterviewQuestion, InterviewSession } from '../../types'

export default function Interview() {
  const [session, setSession] = useState<InterviewSession | null>(null)
  const [question, setQuestion] = useState<InterviewQuestion | null>(null)
  const [questionNumber, setQuestionNumber] = useState(1)
  const [answer, setAnswer] = useState('')
  const [finished, setFinished] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [recording, setRecording] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  async function start() {
    setError(null)
    const { data } = await candidateApiClient.post<InterviewSession>('/interviews')
    setSession(data)
    setQuestion(data.questions[0] ?? null)
    setQuestionNumber(1)
  }

  async function startRecording() {
    if (!session) return
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      chunksRef.current = []
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop())
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        void uploadRecording(blob)
      }
      mediaRecorderRef.current = recorder
      recorder.start()
      setRecording(true)
    } catch {
      setError('Could not access the microphone. Please check permissions.')
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop()
    setRecording(false)
  }

  async function uploadRecording(blob: Blob) {
    if (!session) return
    setTranscribing(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append('session_id', String(session.id))
      formData.append('audio', blob, 'answer.webm')
      const { data } = await candidateApiClient.post<AITranscription>('/ai/transcribe', formData)
      setAnswer(data.transcript)
    } catch {
      setError('Could not transcribe your recording. Please try again or type your answer.')
    } finally {
      setTranscribing(false)
    }
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

      <div className="mb-2 flex items-center gap-3">
        <button
          type="button"
          onClick={recording ? stopRecording : startRecording}
          disabled={submitting || transcribing}
          className={`rounded px-3 py-1.5 text-sm font-medium disabled:opacity-40 ${
            recording ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
          }`}
        >
          {recording ? 'Stop recording' : 'Record answer'}
        </button>
        {transcribing && <span className="text-sm text-gray-500">Transcribing…</span>}
      </div>

      <textarea
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        rows={5}
        disabled={submitting}
        className="w-full rounded border border-gray-300 px-3 py-2 disabled:opacity-60"
        placeholder="Type your answer, or record it above"
      />
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <button
        onClick={submitAnswer}
        disabled={submitting || transcribing || recording || !answer.trim()}
        className="mt-4 w-full rounded bg-gray-900 px-4 py-2 text-white hover:bg-gray-800 disabled:opacity-40"
      >
        {submitting ? 'Evaluating your answer…' : 'Submit answer'}
      </button>
    </div>
  )
}
