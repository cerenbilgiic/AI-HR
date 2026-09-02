import { useEffect, useRef, useState } from 'react'

const supported = typeof window !== 'undefined' && 'speechSynthesis' in window

export type VoiceGender = 'female' | 'male'

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
const MALE_VOICE_HINTS = [
  'male',
  'erkek',
  'david',
  'tolga',
  'ahmet',
  'daniel',
  'mark',
  'alex',
  'george',
  'james',
  'fred',
  'aaron',
]

function pickVoice(voices: SpeechSynthesisVoice[], gender: VoiceGender): SpeechSynthesisVoice | undefined {
  const hints = gender === 'male' ? MALE_VOICE_HINTS : FEMALE_VOICE_HINTS
  const turkish = voices.filter((v) => v.lang.toLowerCase().startsWith('tr'))
  const matchesGender = (v: SpeechSynthesisVoice) => hints.some((hint) => v.name.toLowerCase().includes(hint))
  // Correct pronunciation comes first — a non-Turkish voice reading Turkish
  // text is what was making speech unintelligible, so a Turkish voice (any
  // gender) outranks a foreign-language voice matching the preferred gender.
  return turkish.find(matchesGender) ?? turkish[0] ?? voices.find(matchesGender)
}

export function useAIVoice(preferredGender: VoiceGender = 'female') {
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
    const voice = pickVoice(window.speechSynthesis.getVoices(), preferredGender)
    if (voice) utterance.voice = voice
    // A large pitch shift degrades intelligibility on many speechSynthesis
    // engines (it distorts rather than genuinely re-voices) — keep this
    // modest. The female voice keeps the slight upward "ince ve naif" shift;
    // male stays neutral rather than also being pushed thinner.
    utterance.pitch = preferredGender === 'female' ? 1.1 : 1.0
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

  // Muting only ever gated *future* speak() calls (via mutedRef) — it never
  // touched whatever utterance was already in flight, so clicking mute
  // while the AI was mid-sentence looked like the button did nothing until
  // that sentence finished on its own. Cancel immediately when muting.
  function toggleMuted() {
    setMuted((m) => {
      const next = !m
      if (next) stop()
      return next
    })
  }

  return { speak, stop, speaking, muted, setMuted, toggleMuted, supported }
}
