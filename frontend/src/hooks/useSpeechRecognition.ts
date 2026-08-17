import { useCallback, useEffect, useRef, useState } from 'react'

// The Web Speech API's SpeechRecognition has no official TS lib typing —
// kept as `any` here rather than adding a global declaration file for a
// handful of call sites, all contained to this hook.
type RecognitionInstance = any

function getRecognitionCtor(): (new () => RecognitionInstance) | null {
  if (typeof window === 'undefined') return null
  const w = window as any
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

const supported = getRecognitionCtor() !== null

// Live, browser-side captions for the candidate's spoken answer (see
// pages/candidate/Interview.tsx's voice mode) — purely a same-session UX
// aid so the candidate can see what's being picked up. The transcript that
// actually gets scored still comes from the backend's post-interview
// faster-whisper pass over the recorded audio (transcription_service.py);
// this hook's output is never the sole source of truth for an answer.
export function useSpeechRecognition() {
  const [transcript, setTranscript] = useState('')
  const [listening, setListening] = useState(false)
  const recognitionRef = useRef<RecognitionInstance | null>(null)
  const shouldListenRef = useRef(false)
  const finalTranscriptRef = useRef('')

  useEffect(() => {
    return () => {
      shouldListenRef.current = false
      recognitionRef.current?.abort()
    }
  }, [])

  const start = useCallback(() => {
    const Ctor = getRecognitionCtor()
    if (!Ctor || shouldListenRef.current) return
    shouldListenRef.current = true

    const recognition: RecognitionInstance = new Ctor()
    recognition.lang = 'tr-TR'
    recognition.continuous = true
    recognition.interimResults = true
    recognition.onresult = (event: any) => {
      let interim = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) {
          finalTranscriptRef.current += `${result[0].transcript} `
        } else {
          interim += result[0].transcript
        }
      }
      setTranscript(`${finalTranscriptRef.current}${interim}`.trim())
    }
    recognition.onerror = () => {
      // Non-fatal — see the module comment, this is a cosmetic caption feed.
    }
    recognition.onend = () => {
      // Browsers commonly stop recognition on their own after a pause even
      // in continuous mode — transparently resume as long as we're still
      // supposed to be listening, so a mid-answer silence doesn't cut it off.
      if (shouldListenRef.current) {
        try {
          recognition.start()
        } catch {
          // Already starting — ignore.
        }
      } else {
        setListening(false)
      }
    }
    recognitionRef.current = recognition
    setListening(true)
    try {
      recognition.start()
    } catch {
      // Ignore — e.g. called again before the previous instance settled.
    }
  }, [])

  const stop = useCallback(() => {
    shouldListenRef.current = false
    recognitionRef.current?.stop()
    setListening(false)
  }, [])

  const reset = useCallback(() => {
    finalTranscriptRef.current = ''
    setTranscript('')
  }, [])

  return { transcript, listening, supported, start, stop, reset }
}
