import { useEffect, useRef, useState } from 'react'

const supported = typeof window !== 'undefined' && 'speechSynthesis' in window

// The Web Speech API doesn't expose a standard "gender" field, so this is a
// best-effort match on common naming conventions across platforms/browsers.
const FEMALE_VOICE_HINTS = [
  'female',
  'kadın',
  'zira',
  'filiz',
  'yelda',
  'emel',
  'seda',
  'samantha',
  'victoria',
  'karen',
  'moira',
  'tessa',
  'fiona',
  'susan',
  'hazel',
]

function pickVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | undefined {
  const turkish = voices.filter((v) => v.lang.toLowerCase().startsWith('tr'))
  const isFemale = (v: SpeechSynthesisVoice) =>
    FEMALE_VOICE_HINTS.some((hint) => v.name.toLowerCase().includes(hint))
  // Correct pronunciation comes first — a non-Turkish voice reading Turkish
  // text is what was making the speech unintelligible, so a Turkish voice
  // (any gender) now outranks a foreign-language female voice. Within the
  // Turkish voices, prefer a female one if the machine has more than one.
  return turkish.find(isFemale) ?? turkish[0] ?? voices.find(isFemale)
}

export function useAIVoice() {
  const [speaking, setSpeaking] = useState(false)
  const [muted, setMuted] = useState(false)
  const mutedRef = useRef(muted)
  mutedRef.current = muted

  useEffect(() => {
    return () => {
      if (supported) window.speechSynthesis.cancel()
    }
  }, [])

  function speak(text: string) {
    if (!supported || mutedRef.current || !text.trim()) return
    // Never let two utterances overlap — cancelling first also fires the
    // in-flight utterance's onend, so `speaking` still resolves correctly.
    window.speechSynthesis.cancel()

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'tr-TR'
    // getVoices() can return [] before the async voiceschanged event fires
    // in some browsers — falling back to the default voice is an acceptable
    // degrade, not worth blocking speech on.
    const voice = pickVoice(window.speechSynthesis.getVoices())
    if (voice) utterance.voice = voice
    // A large pitch shift degrades intelligibility on many speechSynthesis
    // engines (it distorts rather than genuinely re-voices) — keep this
    // modest so it reads as slightly thinner without becoming garbled.
    utterance.pitch = 1.1
    utterance.rate = 1
    utterance.onstart = () => setSpeaking(true)
    utterance.onend = () => setSpeaking(false)
    utterance.onerror = () => setSpeaking(false)
    window.speechSynthesis.speak(utterance)
  }

  function stop() {
    if (supported) window.speechSynthesis.cancel()
    setSpeaking(false)
  }

  return { speak, stop, speaking, muted, setMuted, supported }
}
