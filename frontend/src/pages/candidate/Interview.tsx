import { useEffect, useRef, useState } from 'react'
import { candidateApiClient } from '../../api/client'
import type { AIEvaluation, AITranscription, InterviewQuestion, InterviewSession } from '../../types'

const QUESTION_SECONDS = 90

function formatTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export default function Interview() {
  const [session, setSession] = useState<InterviewSession | null>(null)
  const [starting, setStarting] = useState(false)
  const [question, setQuestion] = useState<InterviewQuestion | null>(null)
  const [questionNumber, setQuestionNumber] = useState(1)
  const [answer, setAnswer] = useState('')
  const [finished, setFinished] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [recording, setRecording] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [timeLeft, setTimeLeft] = useState(QUESTION_SECONDS)
  const [error, setError] = useState<string | null>(null)

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const audioPathRef = useRef<string | null>(null)
  const pendingAutoSubmitRef = useRef(false)
  const timeUpFiredRef = useRef(false)

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop())
    }
  }, [])

  useEffect(() => {
    if (!question || finished) return
    setTimeLeft(QUESTION_SECONDS)
    timeUpFiredRef.current = false
  }, [question, finished])

  useEffect(() => {
    if (!question || finished || submitting || transcribing) return
    if (timeLeft <= 0) {
      if (!timeUpFiredRef.current) {
        timeUpFiredRef.current = true
        handleTimeUp()
      }
      return
    }
    const id = setTimeout(() => setTimeLeft((s) => s - 1), 1000)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, question, finished, submitting, transcribing])

  async function setupCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }
    } catch {
      setError('Could not access your camera/microphone. You can still type your answers.')
    }
  }

  async function start() {
    if (starting) return
    setStarting(true)
    setError(null)
    try {
      const { data } = await candidateApiClient.post<InterviewSession>('/interviews')
      setSession(data)
      setQuestion(data.questions[0] ?? null)
      setQuestionNumber(1)
      await setupCamera()
    } catch {
      setError('Could not start the interview. Please try again.')
    } finally {
      setStarting(false)
    }
  }

  function handleTimeUp() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      pendingAutoSubmitRef.current = true
      stopRecording()
    } else {
      void submitAnswer()
    }
  }

  function startRecording() {
    if (!streamRef.current) return
    setError(null)
    try {
      const recorder = new MediaRecorder(streamRef.current)
      chunksRef.current = []
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'video/webm' })
        void uploadRecording(blob)
      }
      mediaRecorderRef.current = recorder
      recorder.start()
      setRecording(true)
    } catch {
      setError('Could not start recording.')
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
      audioPathRef.current = data.audio_path
      if (data.transcript.trim()) {
        setAnswer(data.transcript)
      } else {
        setError('No speech was detected in that recording. Please try again.')
      }
      if (pendingAutoSubmitRef.current) {
        pendingAutoSubmitRef.current = false
        await submitAnswer(data.transcript)
      }
    } catch {
      setError('Could not transcribe your recording. Please try again or type your answer.')
      if (pendingAutoSubmitRef.current) {
        pendingAutoSubmitRef.current = false
        await submitAnswer()
      }
    } finally {
      setTranscribing(false)
    }
  }

  async function submitAnswer(overrideAnswer?: string) {
    if (!session || !question || submitting) return
    const textToSubmit = overrideAnswer ?? answer
    setSubmitting(true)
    setError(null)
    try {
      const { data } = await candidateApiClient.post<AIEvaluation>('/ai/evaluate-answer', {
        session_id: session.id,
        question_id: question.id,
        candidate_answer: textToSubmit,
        audio_path: audioPathRef.current,
      })
      setAnswer('')
      audioPathRef.current = null
      if (data.next_question) {
        setQuestion(data.next_question)
        setQuestionNumber((n) => n + 1)
      } else {
        await candidateApiClient.post(`/interviews/${session.id}/finish`)
        setFinished(true)
        streamRef.current?.getTracks().forEach((track) => track.stop())
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
        <button
          onClick={start}
          disabled={starting}
          className="rounded bg-gray-900 px-4 py-2 text-white hover:bg-gray-800 disabled:opacity-40"
        >
          {starting ? 'Preparing your first question…' : 'Start interview'}
        </button>
        {starting && (
          <p className="mt-2 text-xs text-gray-500">This can take up to a minute the first time.</p>
        )}
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>
    )
  }

  if (finished) {
    return <p className="text-center text-gray-900">Thanks — your interview has been submitted.</p>
  }

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-4 flex items-start gap-4">
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="aspect-video w-40 flex-shrink-0 rounded border border-gray-300 bg-gray-900 object-cover"
        />
        <div className="flex-1">
          <p className={`font-mono text-2xl ${timeLeft <= 15 ? 'text-red-600' : 'text-gray-900'}`}>
            {formatTime(timeLeft)}
          </p>
          <p className="text-xs text-gray-500">Time left for this question</p>
        </div>
      </div>

      <div className="mb-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <div className="mb-2 flex items-center gap-2 text-xs text-gray-500">
          <span className="uppercase tracking-wide">Question {questionNumber}</span>
          {question?.category && (
            <span className="rounded-full bg-gray-100 px-2 py-0.5">{question.category}</span>
          )}
          {question?.difficulty && (
            <span className="rounded-full bg-gray-100 px-2 py-0.5 capitalize">{question.difficulty}</span>
          )}
        </div>
        <h2 className="text-lg font-medium text-gray-900">{question?.text}</h2>
      </div>

      <div className="mb-2 flex items-center gap-3">
        <button
          type="button"
          onClick={recording ? stopRecording : startRecording}
          disabled={submitting || transcribing || !streamRef.current}
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
        onClick={() => void submitAnswer()}
        disabled={submitting || transcribing || recording || !answer.trim()}
        className="mt-4 w-full rounded bg-gray-900 px-4 py-2 text-white hover:bg-gray-800 disabled:opacity-40"
      >
        {submitting ? 'Evaluating your answer…' : 'Submit answer'}
      </button>
    </div>
  )
}
