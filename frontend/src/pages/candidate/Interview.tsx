import axios from 'axios'
import { useEffect, useRef, useState } from 'react'
import { candidateApiClient } from '../../api/client'
import AIAvatar from '../../components/AIAvatar'
import { useAIVoice } from '../../hooks/useAIVoice'
import type { InterviewQuestion, InterviewSession } from '../../types'

const QUESTION_SECONDS = 90
const MAX_ANSWER_WORDS = 500
const INTRO_TEXT =
  'Merhaba, ben yapay zeka mülakat asistanınızım. Sorulara sözlü olarak cevap verebilirsiniz, ' +
  'ancak cevabınızı yazılı olarak da yazmanız sizin için bir güvence olacaktır. ' +
  'Şimdi size birkaç soru soracağım.'
const FINISH_TEXT =
  'Tebrikler, mülakatınızı başarıyla tamamladınız. Cevaplarınız kaydedildi, katılımınız için teşekkür ederiz.'

// Mirrors the server-side check in backend/app/services/text_quality.py —
// this copy is only for instant UX feedback; the server remains the real
// enforcement boundary.
const VOWELS = new Set('aeıioöuüAEIİOÖUÜ'.split(''))

function looksLikeGibberishToken(token: string): boolean {
  const letters = [...token].filter((c) => /\p{L}/u.test(c))
  if (letters.length < 4) return false
  if (!letters.some((c) => VOWELS.has(c))) return true
  const distinct = new Set(letters.map((c) => c.toLowerCase())).size
  return distinct / letters.length < 0.35
}

function validateAnswerText(text: string): string | null {
  const words = text.trim().split(/\s+/).filter(Boolean)
  if (words.length < 3) return 'Please provide a more complete answer.'
  if (words.length > MAX_ANSWER_WORDS) return `Answers are limited to ${MAX_ANSWER_WORDS} words.`
  const longTokens = words.filter((w) => w.length >= 4)
  if (longTokens.length > 0) {
    const gibberishCount = longTokens.filter(looksLikeGibberishToken).length
    if (gibberishCount / longTokens.length >= 0.5) {
      return "This doesn't look like a real answer. Please rewrite it."
    }
  }
  return null
}

function formatTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export default function Interview() {
  const [session, setSession] = useState<InterviewSession | null>(null)
  const [starting, setStarting] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answer, setAnswer] = useState('')
  const [finished, setFinished] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [timeLeft, setTimeLeft] = useState(QUESTION_SECONDS)
  const [error, setError] = useState<string | null>(null)

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timeUpFiredRef = useRef(false)

  const { speak, speaking, muted, setMuted } = useAIVoice()

  const question: InterviewQuestion | null = session?.questions[currentIndex] ?? null
  const wordCount = answer.trim() ? answer.trim().split(/\s+/).filter(Boolean).length : 0

  useEffect(() => {
    if (!question) return
    // The intro is prefixed onto the first question's speech rather than
    // spoken as a separate call — speak() cancels any in-flight utterance,
    // so a standalone intro call would race with (and get cut off by) this
    // same effect firing for question 0 right after the camera is ready.
    speak(currentIndex === 0 ? `${INTRO_TEXT} ${question.text}` : question.text)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question?.id])

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
    if (!question || finished || submitting) return
    if (timeLeft <= 0) {
      if (!timeUpFiredRef.current) {
        timeUpFiredRef.current = true
        void submitAnswer(answer, true)
      }
      return
    }
    const id = setTimeout(() => setTimeLeft((s) => s - 1), 1000)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, question, finished, submitting])

  async function setupCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }
      startContinuousRecording()
    } catch {
      setError('Could not access your camera/microphone. You can still type your answers.')
    }
  }

  function startContinuousRecording() {
    if (!streamRef.current) return
    try {
      const recorder = new MediaRecorder(streamRef.current)
      chunksRef.current = []
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      mediaRecorderRef.current = recorder
      recorder.start()
    } catch {
      // Non-fatal — the interview can still proceed with written answers only.
    }
  }

  function stopContinuousRecording(): Promise<Blob | null> {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current
      if (!recorder || recorder.state === 'inactive') {
        resolve(null)
        return
      }
      recorder.onstop = () => {
        resolve(new Blob(chunksRef.current, { type: recorder.mimeType || 'video/webm' }))
      }
      recorder.stop()
    })
  }

  async function uploadFullRecording(blob: Blob) {
    if (!session) return
    try {
      const formData = new FormData()
      formData.append('recording', blob, 'interview.webm')
      await candidateApiClient.post(`/interviews/${session.id}/recording`, formData)
    } catch {
      // Best-effort — the candidate's answers are already saved either way.
      setError('Your answers were saved, but the recording could not be uploaded.')
    }
  }

  async function start() {
    if (starting) return
    setStarting(true)
    setError(null)
    try {
      const { data } = await candidateApiClient.post<InterviewSession>('/interviews')
      setSession(data)
      setCurrentIndex(0)
      await setupCamera()
    } catch {
      setError('Could not start the interview. Please try again.')
    } finally {
      setStarting(false)
    }
  }

  async function submitAnswer(overrideAnswer?: string, isTimeout = false) {
    if (!session || !question || submitting) return
    const textToSubmit = overrideAnswer ?? answer

    // Writing an answer is optional — the candidate may answer purely
    // verbally (the whole interview is recorded regardless). Validation
    // only applies when they actually typed something.
    if (!isTimeout && textToSubmit.trim()) {
      const validationError = validateAnswerText(textToSubmit)
      if (validationError) {
        setError(validationError)
        return
      }
    }

    setSubmitting(true)
    setError(null)
    try {
      await candidateApiClient.post(`/interviews/${session.id}/answers`, {
        question_id: question.id,
        transcript: textToSubmit,
        is_timeout: isTimeout,
      })
      setAnswer('')
      if (currentIndex + 1 < session.questions.length) {
        setCurrentIndex((i) => i + 1)
      } else {
        const blob = await stopContinuousRecording()
        if (blob && blob.size > 0) {
          await uploadFullRecording(blob)
        }
        await candidateApiClient.post(`/interviews/${session.id}/finish`)
        setFinished(true)
        speak(FINISH_TEXT)
        streamRef.current?.getTracks().forEach((track) => track.stop())
      }
    } catch (err) {
      const detail = axios.isAxiosError(err) ? err.response?.data?.detail : undefined
      setError(typeof detail === 'string' ? detail : 'Something went wrong submitting your answer. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!session) {
    return (
      <div className="mx-auto max-w-lg">
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
          <div className="mb-4 flex justify-center">
            <AIAvatar speaking={false} />
          </div>
          <h2 className="mb-2 text-xl font-semibold text-gray-900">Ready when you are</h2>
          <p className="mb-6 text-sm text-gray-600">
            Your AI interviewer will greet you, walk you through each question out loud, and you can
            answer by speaking, typing, or both. Take a breath — there's no rush.
          </p>
          <button
            onClick={start}
            disabled={starting}
            className="w-full rounded bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700 disabled:opacity-40"
          >
            {starting ? 'Preparing your questions…' : 'Start interview'}
          </button>
          {starting && (
            <p className="mt-2 text-xs text-gray-500">This can take up to a minute the first time.</p>
          )}
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </div>
      </div>
    )
  }

  if (finished) {
    return (
      <div className="mx-auto max-w-lg">
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
          <div className="mb-4 flex justify-center">
            <AIAvatar speaking={speaking} />
          </div>
          <p className="text-gray-900">{FINISH_TEXT}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-4 flex items-start gap-4">
        <AIAvatar speaking={speaking} />
        <div className="relative flex-shrink-0">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="aspect-video w-64 rounded border border-gray-300 bg-gray-900 object-cover"
          />
          <span className="absolute left-1 top-1 flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
            Recording
          </span>
        </div>
      </div>

      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className={`font-mono text-2xl ${timeLeft <= 15 ? 'text-red-600' : 'text-gray-900'}`}>
            {formatTime(timeLeft)}
          </p>
          <p className="text-xs text-gray-500">Time left for this question</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => question && speak(question.text)}
            className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
          >
            🔊 Replay
          </button>
          <button
            type="button"
            onClick={() => setMuted((m) => !m)}
            className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
          >
            {muted ? '🔇 Unmute' : '🔈 Mute'}
          </button>
        </div>
      </div>

      <div className="mb-4 rounded-xl border border-indigo-100 bg-white p-4 shadow-sm">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-indigo-600">
          Question {currentIndex + 1} of {session.questions.length}
        </p>
        <h2 className="text-lg font-medium text-gray-900">{question?.text}</h2>
      </div>

      <textarea
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        rows={6}
        disabled={submitting}
        className="w-full rounded border border-gray-300 px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-60"
        placeholder="Type your answer here"
      />
      <p className={`mt-1 text-right text-xs ${wordCount > MAX_ANSWER_WORDS ? 'text-red-600' : 'text-gray-500'}`}>
        {wordCount} / {MAX_ANSWER_WORDS} words
      </p>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <button
        onClick={() => void submitAnswer()}
        disabled={submitting || wordCount > MAX_ANSWER_WORDS}
        className="mt-4 w-full rounded bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700 disabled:opacity-40"
      >
        {submitting
          ? 'Saving your answer…'
          : currentIndex + 1 < session.questions.length
            ? 'Next question'
            : 'Finish interview'}
      </button>
    </div>
  )
}
