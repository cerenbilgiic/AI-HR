import axios from 'axios'
import { useEffect, useRef, useState } from 'react'
import { candidateApiClient } from '../../api/client'
import AIAvatar, { type AvatarGender } from '../../components/AIAvatar'
import { useAIVoice } from '../../hooks/useAIVoice'
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition'
import type { CandidateDetail, InterviewQuestion, InterviewSession, Job } from '../../types'

type AnswerMode = 'voice' | 'written'

// Chosen on the avatar-selection screen right before this page, kept only
// for this interview attempt (not persisted server-side, see AvatarSelection.tsx).
function getSelectedAvatarGender(): AvatarGender {
  return sessionStorage.getItem('interview_avatar_gender') === 'male' ? 'male' : 'female'
}

const QUESTION_SECONDS = 90
const MAX_ANSWER_WORDS = 500
const INTRO_TEXT =
  'Merhaba, ben yapay zeka mülakat asistanınızım. Sorulara sözlü olarak cevap verebilirsiniz, ' +
  'ancak cevabınızı yazılı olarak da yazmanız sizin için bir güvence olacaktır. ' +
  'Başlamadan önce önemli bir uyarı: mülakat sırasında ekrandan çıkar veya başka bir sekmeye ' +
  'ya da uygulamaya geçerseniz, mülakat otomatik olarak sonlandırılacaktır ve tekrar giremezsiniz. ' +
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

function validateAnswerText(text: string, mode: AnswerMode): string | null {
  const words = text.trim().split(/\s+/).filter(Boolean)
  // The word-count cap only applies to typed answers — a candidate
  // answering verbally shouldn't be capped the way a typed answer is (see
  // the matching enforce_word_limit flag on the backend's submit_answer).
  if (mode === 'written' && words.length > MAX_ANSWER_WORDS) {
    return `Cevaplar en fazla ${MAX_ANSWER_WORDS} kelime olabilir.`
  }
  const longTokens = words.filter((w) => w.length >= 4)
  if (longTokens.length > 0) {
    const gibberishCount = longTokens.filter(looksLikeGibberishToken).length
    if (gibberishCount / longTokens.length >= 0.5) {
      return 'Bu gerçek bir cevap gibi görünmüyor. Lütfen tekrar yazın.'
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
  const [answerMode, setAnswerMode] = useState<AnswerMode>('voice')
  const [starting, setStarting] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answer, setAnswer] = useState('')
  const [finished, setFinished] = useState(false)
  const [terminated, setTerminated] = useState(false)
  const [showFinishConfirm, setShowFinishConfirm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [timeLeft, setTimeLeft] = useState(QUESTION_SECONDS)
  const [error, setError] = useState<string | null>(null)
  const [applyingJob, setApplyingJob] = useState<Job | null>(null)
  const [checkingExisting, setCheckingExisting] = useState(true)

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timeUpFiredRef = useRef(false)

  // Track where in the continuous recording each answer's verbal response
  // starts/ends, so the backend can slice just that audio out for
  // post-interview transcription (see submitAnswer / transcription_service.py).
  const recordingStartTimeRef = useRef<number | null>(null)
  const answerWindowStartRef = useRef<number | null>(null)
  const prevSpeakingRef = useRef(false)
  const [canSpeakNow, setCanSpeakNow] = useState(false)

  const [avatarGender] = useState<AvatarGender>(getSelectedAvatarGender)
  const { speak, stop, speaking, muted, setMuted, supported: ttsSupported } = useAIVoice(avatarGender)
  const {
    transcript: voiceTranscript,
    listening,
    supported: sttSupported,
    start: startListening,
    stop: stopListening,
    reset: resetTranscript,
  } = useSpeechRecognition()

  const question: InterviewQuestion | null = session?.questions[currentIndex] ?? null
  const activeAnswerText = answerMode === 'voice' ? voiceTranscript : answer
  const wordCount = activeAnswerText.trim() ? activeAnswerText.trim().split(/\s+/).filter(Boolean).length : 0

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

  // Detects the candidate switching to another tab/app mid-interview.
  // visibilitychange (not window.blur) is deliberate — blur also fires for
  // in-page focus changes (a permission prompt, browser chrome) that aren't
  // actually leaving the page. The candidate is warned about this up front
  // (see INTRO_TEXT, spoken at interview start) — the very first offense
  // ends the interview immediately, no second-chance warning.
  useEffect(() => {
    if (!session || finished || terminated) return
    function handleVisibilityChange() {
      if (document.visibilityState !== 'visible') {
        logViolation('tab_switch')
        void terminateSession()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [session, finished, terminated])

  // Exiting fullscreen counts the same as switching tabs — immediate
  // termination on first offense, same as above.
  useEffect(() => {
    if (!session || finished || terminated) return
    function handleFullscreenChange() {
      if (!document.fullscreenElement) {
        logViolation('fullscreen_exit')
        void terminateSession()
      }
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [session, finished, terminated])

  useEffect(() => {
    if (!question || finished) return
    setTimeLeft(QUESTION_SECONDS)
    timeUpFiredRef.current = false
    // Fallback answer-window start (question appearing) — overridden below
    // once TTS actually finishes speaking it, which is the more accurate
    // "candidate can start talking now" moment.
    answerWindowStartRef.current = Date.now()
    resetTranscript()
    // canSpeakNow otherwise only flips true when `speaking` transitions
    // true->false (see the effect below) — which never happens if the
    // browser can't do TTS at all, or the candidate has muted the AI
    // (speak(), called by the effect above, no-ops in both cases). Don't
    // leave them permanently stuck on a hidden question with a disabled
    // answer box in that case.
    setCanSpeakNow(!ttsSupported || muted)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question, finished])

  useEffect(() => {
    if (prevSpeakingRef.current && !speaking && question && !finished) {
      answerWindowStartRef.current = Date.now()
      setCanSpeakNow(true)
    }
    prevSpeakingRef.current = speaking
  }, [speaking, question, finished])

  // Live captions only run once the AI has actually finished asking the
  // current question, and only while voice mode is the active answer
  // method — see useSpeechRecognition's module comment for why this is a
  // display-only feed, not the scored transcript.
  useEffect(() => {
    if (answerMode === 'voice' && canSpeakNow && !finished) {
      startListening()
    } else {
      stopListening()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answerMode, canSpeakNow, finished])

  // Shown on the pre-start screen so the candidate knows which position
  // they're applying for and what the interview will assess, before they
  // commit to starting it.
  useEffect(() => {
    candidateApiClient
      .get<CandidateDetail>('/candidates/me')
      .then((res) => candidateApiClient.get<Job>(`/jobs/${res.data.job_id}`))
      .then((res) => setApplyingJob(res.data))
      .catch(() => {
        // Non-fatal — the interview can still proceed without this context.
      })
  }, [])

  // Reloading the page loses all in-memory state above (session, currentIndex,
  // camera/fullscreen), which used to mean the pre-start screen reappeared
  // and clicking "Mülakatı başlat" silently created a brand new session —
  // a free restart with fresh questions and lost progress. On mount, check
  // whether a session already exists for this candidate (create_session's
  // backend guard now rejects a second one either way) and resume it in
  // place instead of ever showing the start button again.
  useEffect(() => {
    let cancelled = false
    candidateApiClient
      .get<InterviewSession[]>('/interviews')
      .then(({ data }) => {
        if (cancelled) return
        const existing = [...data].sort((a, b) => b.id - a.id)[0]
        if (!existing) return
        if (existing.status === 'terminated') {
          setSession(existing)
          setTerminated(true)
        } else if (existing.status === 'in_progress') {
          void resumeSession(existing)
        } else {
          setSession(existing)
          setFinished(true)
        }
      })
      .catch(() => {
        // Non-fatal — falls back to the normal start screen.
      })
      .finally(() => {
        if (!cancelled) setCheckingExisting(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function resumeSession(existing: InterviewSession) {
    const firstUnanswered = existing.questions.findIndex((q) => q.answer === null)
    if (firstUnanswered === -1) {
      // Every question already has an answer but the session never made it
      // to "finish" — most likely a refresh landed in the brief gap between
      // the last answer submit and the finish call. Just complete it; there
      // is no in-progress recording left to salvage after a reload anyway.
      setSession(existing)
      setFinished(true)
      try {
        await candidateApiClient.post(`/interviews/${existing.id}/finish`)
      } catch {
        // Best-effort, see finishInterview's identical comment.
      }
      return
    }
    setSession(existing)
    setCurrentIndex(firstUnanswered)
    await setupCamera()
    try {
      await document.documentElement.requestFullscreen()
    } catch {
      // Non-fatal, see start()'s identical comment.
    }
  }

  useEffect(() => {
    // canSpeakNow gates the countdown itself — it doesn't start ticking
    // until the AI has actually finished asking the question.
    if (!question || finished || submitting || !canSpeakNow) return
    if (timeLeft <= 0) {
      if (!timeUpFiredRef.current) {
        timeUpFiredRef.current = true
        void submitAnswer(answerMode === 'voice' ? voiceTranscript : answer, true)
      }
      return
    }
    const id = setTimeout(() => setTimeLeft((s) => s - 1), 1000)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, question, finished, submitting, canSpeakNow])

  async function setupCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }
      startContinuousRecording()
    } catch {
      setError('Kamera/mikrofonunuza erişilemedi. Cevaplarınızı yine de yazarak verebilirsiniz.')
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
      recordingStartTimeRef.current = Date.now()
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
      setError('Cevaplarınız kaydedildi, ancak video kaydı yüklenemedi.')
    }
  }

  // Ends the interview normally (session goes to "awaiting_review", same as
  // finishing the last question) — used both after the last answer and by
  // the voluntary "Mülakatı Bitir" button, so both paths behave identically.
  async function finishInterview() {
    if (!session) return
    const blob = await stopContinuousRecording()
    if (blob && blob.size > 0) {
      await uploadFullRecording(blob)
    }
    try {
      await candidateApiClient.post(`/interviews/${session.id}/finish`)
    } catch {
      // Best-effort — the candidate is leaving the active screen either way.
    }
    setFinished(true)
    // No spoken finish message — the interview is over, the AI goes silent
    // (also cancels anything still mid-utterance from the last question).
    stop()
    stopListening()
    streamRef.current?.getTracks().forEach((track) => track.stop())
  }

  // Fire-and-forget — the candidate's own experience (warning/termination)
  // never waits on this; it's purely for the HR review screen's Integrity
  // card (see interview_service.attach_violation_summary).
  function logViolation(violationType: string) {
    if (!session) return
    void candidateApiClient
      .post(`/interviews/${session.id}/violations`, { violation_type: violationType })
      .catch(() => {})
  }

  // The candidate left the tab/app or exited fullscreen — end the interview
  // immediately for good (distinct "terminated" state, unlike
  // finishInterview's normal "awaiting_review"). They were warned about
  // this up front (INTRO_TEXT). Best-effort: they're leaving the active
  // screen regardless of whether this call succeeds.
  async function terminateSession() {
    if (!session) return
    stop()
    stopListening()
    try {
      await candidateApiClient.post(`/interviews/${session.id}/terminate`)
    } catch {
      // Ignored — see comment above.
    }
    streamRef.current?.getTracks().forEach((track) => track.stop())
    setTerminated(true)
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
      try {
        await document.documentElement.requestFullscreen()
      } catch {
        // Non-fatal — some browsers/contexts (e.g. embedded iframes without
        // the fullscreen permission) reject this; the interview still works.
      }
    } catch (err) {
      const detail = axios.isAxiosError(err) ? err.response?.data?.detail : undefined
      setError(typeof detail === 'string' ? detail : 'Mülakat başlatılamadı. Lütfen tekrar deneyin.')
    } finally {
      setStarting(false)
    }
  }

  async function submitAnswer(overrideAnswer?: string, isTimeout = false) {
    if (!session || !question || submitting) return
    const textToSubmit = overrideAnswer ?? (answerMode === 'voice' ? voiceTranscript : answer)

    // Writing an answer is optional — the candidate may answer purely
    // verbally (the whole interview is recorded regardless). Validation
    // only applies when they actually typed something.
    if (!isTimeout && textToSubmit.trim()) {
      const validationError = validateAnswerText(textToSubmit, answerMode)
      if (validationError) {
        setError(validationError)
        return
      }
    }

    setSubmitting(true)
    setError(null)
    try {
      const recordingStartOffsetSeconds =
        recordingStartTimeRef.current != null && answerWindowStartRef.current != null
          ? Math.max((answerWindowStartRef.current - recordingStartTimeRef.current) / 1000, 0)
          : undefined
      const recordingEndOffsetSeconds =
        recordingStartTimeRef.current != null ? Math.max((Date.now() - recordingStartTimeRef.current) / 1000, 0) : undefined

      await candidateApiClient.post(`/interviews/${session.id}/answers`, {
        question_id: question.id,
        transcript: textToSubmit,
        is_timeout: isTimeout,
        answer_mode: answerMode,
        recording_start_offset_seconds: recordingStartOffsetSeconds,
        recording_end_offset_seconds: recordingEndOffsetSeconds,
      })
      setAnswer('')
      resetTranscript()
      if (currentIndex + 1 < session.questions.length) {
        setCurrentIndex((i) => i + 1)
      } else {
        await finishInterview()
      }
    } catch (err) {
      const detail = axios.isAxiosError(err) ? err.response?.data?.detail : undefined
      setError(typeof detail === 'string' ? detail : 'Cevabınız gönderilirken bir sorun oluştu. Lütfen tekrar deneyin.')
    } finally {
      setSubmitting(false)
    }
  }

  if (checkingExisting) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center text-sm text-slate-400">Yükleniyor…</div>
    )
  }

  if (!session) {
    return (
      <div className="mx-auto max-w-lg">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-8 text-center shadow-sm">
          <div className="mb-4 flex justify-center">
            <AIAvatar speaking={false} gender={avatarGender} />
          </div>
          <h2 className="mb-2 text-xl font-semibold text-slate-100">Hazır olduğunuzda başlayabiliriz</h2>
          <p className="mb-6 text-sm text-slate-400">
            Yapay zeka mülakat asistanınız sizi karşılayacak, her soruyu sesli olarak yöneltecek ve
            cevaplarınızı konuşarak, yazarak ya da ikisini birlikte kullanarak verebilirsiniz.
            Rahat olun — acele etmenize gerek yok.
          </p>
          {applyingJob && (
            <div className="mb-6 rounded-lg border border-slate-800 bg-slate-800 p-4 text-left">
              <p className="text-xs uppercase tracking-wide text-slate-500">Başvurduğunuz pozisyon</p>
              <p className="mb-2 font-medium text-slate-100">{applyingJob.title}</p>
              {applyingJob.skills.length > 0 && (
                <>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Bu mülakat şunları değerlendirecek</p>
                  <p className="text-sm text-slate-300">
                    {applyingJob.skills.map((s) => s.name).join(', ')}
                  </p>
                </>
              )}
            </div>
          )}
          <p className="mb-4 text-xs font-medium text-slate-300">
            ⚠ Mülakat sırasında ekrandan çıkar veya başka bir sekmeye/uygulamaya geçerseniz, mülakat
            otomatik olarak sonlandırılır ve tekrar giremezsiniz.
          </p>
          <button
            onClick={start}
            disabled={starting}
            className="w-full rounded bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-500 disabled:opacity-40"
          >
            {starting ? 'Sorularınız hazırlanıyor…' : 'Mülakatı başlat'}
          </button>
          {starting && (
            <p className="mt-2 text-xs text-slate-500">İlk seferinde bu işlem bir dakika kadar sürebilir.</p>
          )}
          {error && <p className="mt-2 text-sm font-medium text-rose-400">{error}</p>}
        </div>
      </div>
    )
  }

  if (terminated) {
    return (
      <div className="mx-auto max-w-lg">
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-8 text-center shadow-sm">
          <p className="mb-1 text-lg font-semibold text-rose-300">Mülakatınız sonlandırıldı</p>
          <p className="text-sm text-rose-100/80">
            Mülakat sırasında ekrandan ayrıldığınız (başka bir sekmeye/uygulamaya geçtiğiniz veya
            tam ekrandan çıktığınız) için mülakatınız sonlandırılmıştır. Bu mülakata tekrar
            giremezsiniz.
          </p>
        </div>
      </div>
    )
  }

  if (finished) {
    return (
      <div className="mx-auto max-w-lg">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-8 text-center shadow-sm">
          <div className="mb-4 flex justify-center">
            <AIAvatar speaking={speaking} gender={avatarGender} />
          </div>
          <h2 className="mb-2 text-xl font-semibold text-slate-100">Mülakat Tamamlandı 🎉</h2>
          <p className="text-slate-100">{FINISH_TEXT}</p>
          <div className="mx-auto mt-4 inline-block rounded-full bg-amber-500/15 px-3 py-1 text-xs font-medium text-amber-400">
            Durum: Değerlendiriliyor
          </div>
          <p className="mt-4 text-sm text-slate-400">
            İşe alım ekibimiz başvurunuzu inceleyecek ve sonraki adımlar hakkında e-posta ile sizinle
            iletişime geçecektir. Bu sekmeyi kapatabilirsiniz.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div
      className="mx-auto max-w-lg"
      onCopy={(e) => {
        e.preventDefault()
        logViolation('copy_attempt')
      }}
      onPaste={(e) => {
        e.preventDefault()
        logViolation('paste_attempt')
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        logViolation('right_click')
      }}
    >
      {showFinishConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-w-sm rounded-xl bg-slate-900 p-6 text-center shadow-lg">
            <p className="mb-2 text-lg font-semibold text-slate-100">Mülakatı bitir</p>
            <p className="mb-4 text-sm text-slate-300">
              Mülakatı şimdi bitirmek istediğinize emin misiniz? Cevaplanmamış sorular boş bırakılmış
              sayılacaktır.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowFinishConfirm(false)}
                className="w-full rounded border border-slate-700 px-4 py-2 text-slate-300 hover:bg-slate-800"
              >
                Vazgeç
              </button>
              <button
                onClick={() => {
                  setShowFinishConfirm(false)
                  void finishInterview()
                }}
                className="w-full rounded bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-500"
              >
                Evet, bitir
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mb-2 flex justify-end">
        <button
          type="button"
          onClick={() => setShowFinishConfirm(true)}
          className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-400 hover:bg-slate-800"
        >
          Mülakatı Bitir
        </button>
      </div>

      <div className="mb-4 flex items-start gap-4">
        <div className="flex flex-col items-center gap-1">
          <AIAvatar speaking={speaking} gender={avatarGender} size="lg" />
          <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
            AI Mülakat Asistanı
          </span>
        </div>
        <div className="relative flex-shrink-0">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="aspect-video w-64 rounded border border-slate-700 bg-slate-900 object-cover"
          />
          <span className="absolute left-1 top-1 flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-500" />
            Kayıt
          </span>
        </div>
      </div>

      <div className="mb-4">
        <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
          <span>
            Soru {currentIndex + 1} / {session.questions.length}
          </span>
          <span>
            Tamamlanan: {currentIndex} · Kalan: {session.questions.length - currentIndex}
          </span>
        </div>
        <div className="flex gap-1">
          {session.questions.map((q, i) => (
            <span
              key={q.id}
              className={`h-1.5 flex-1 rounded-full ${i <= currentIndex ? 'bg-indigo-500' : 'bg-slate-700'}`}
            />
          ))}
        </div>
      </div>

      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className={`font-mono text-2xl text-slate-100 ${timeLeft <= 15 ? 'font-bold' : ''}`}>
            {formatTime(timeLeft)}
          </p>
          <p className="text-xs text-slate-500">Bu soru için kalan süre</p>
          {canSpeakNow && !speaking && (
            <p className="mt-1 text-xs font-medium text-slate-100">
              🎤 Şimdi cevabınızı söyleyebilirsiniz
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => question && speak(question.text)}
            className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
          >
            🔊 Tekrar Oynat
          </button>
          <button
            type="button"
            onClick={() => setMuted((m) => !m)}
            className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
          >
            {muted ? '🔇 Sesi Aç' : '🔈 Sessize Al'}
          </button>
        </div>
      </div>

      <div className="mb-4 rounded-xl border border-slate-800 bg-slate-900 p-4 shadow-sm">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
          Soru {currentIndex + 1} / {session.questions.length}
        </p>
        {canSpeakNow ? (
          <h2 className="text-lg font-medium text-slate-100">{question?.text}</h2>
        ) : (
          <p className="text-sm italic text-slate-500">AI mülakat asistanınız soruyu okuyor…</p>
        )}
      </div>

      <div className="mb-3 flex gap-1 rounded-lg bg-slate-800 p-1 text-sm">
        <button
          type="button"
          onClick={() => setAnswerMode('voice')}
          className={`flex-1 rounded-md py-1.5 font-medium ${
            answerMode === 'voice' ? 'bg-slate-700 text-slate-100 shadow-sm' : 'text-slate-500'
          }`}
        >
          🎙️ Sesli
        </button>
        <button
          type="button"
          onClick={() => setAnswerMode('written')}
          className={`flex-1 rounded-md py-1.5 font-medium ${
            answerMode === 'written' ? 'bg-slate-700 text-slate-100 shadow-sm' : 'text-slate-500'
          }`}
        >
          📝 Yazılı
        </button>
      </div>

      {/* Recording runs continuously for the whole interview regardless of
          this tab — it only decides whether the text box is shown. A
          verbal-only answer still works fine in Written mode too (both
          submit through the same flow), this is purely a UI affordance. */}
      {answerMode === 'voice' ? (
        !canSpeakNow ? (
          <div className="rounded-xl border border-dashed border-slate-700 bg-slate-800 p-6 text-center text-sm text-slate-400">
            AI sorusunu bitirdiğinde cevap vermeye başlayabilirsiniz.
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-700 bg-slate-800 p-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
              {listening ? '🎤 Dinleniyor — söyledikleriniz aşağıda görünecek' : '🎤 Cevabınızı sözlü olarak verebilirsiniz.'}
            </p>
            {/* Read-only — this is a live caption of the spoken answer, not
                an editable field (see useSpeechRecognition's module comment). */}
            <div
              aria-readonly="true"
              className="min-h-[96px] whitespace-pre-wrap rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200"
            >
              {voiceTranscript || (
                <span className="text-slate-500">Konuşmaya başladığınızda metin burada belirecek…</span>
              )}
            </div>
            {!sttSupported && (
              <p className="mt-2 text-xs text-slate-500">
                Tarayıcınız canlı transkripti desteklemiyor — cevabınız yine de kaydediliyor.
              </p>
            )}
          </div>
        )
      ) : (
        <>
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            rows={6}
            disabled={submitting || !canSpeakNow}
            className="w-full rounded border border-slate-700 bg-slate-800 text-slate-200 placeholder:text-slate-500 px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-60"
            placeholder={canSpeakNow ? 'Cevabınızı buraya yazın' : 'AI sorusunu bitirdiğinde yazmaya başlayabilirsiniz'}
          />
          <p className={`mt-1 text-right text-xs ${wordCount > MAX_ANSWER_WORDS ? 'font-medium text-slate-100' : 'text-slate-500'}`}>
            {wordCount} / {MAX_ANSWER_WORDS} kelime
          </p>
        </>
      )}
      {error && <p className="mt-2 text-sm font-medium text-rose-400">{error}</p>}
      <button
        onClick={() => void submitAnswer()}
        disabled={submitting || (answerMode === 'written' && wordCount > MAX_ANSWER_WORDS) || !canSpeakNow}
        className="mt-4 w-full rounded bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-500 disabled:opacity-40"
      >
        {submitting
          ? 'Cevabınız kaydediliyor…'
          : currentIndex + 1 < session.questions.length
            ? 'Sonraki soru'
            : 'Mülakatı bitir'}
      </button>
    </div>
  )
}
