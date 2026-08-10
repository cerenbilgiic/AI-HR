import { useEffect, useRef, useState } from 'react'

// Web Speech API exposes no audio stream or phoneme/viseme timing, so this
// can't be true lip-sync — the mouth just chomps on a steady cadence while
// speechSynthesis reports it's speaking, giving a "talking" look rather
// than word- or phoneme-accurate movement.
const CHOMP_INTERVAL_MS = 180

export default function AIAvatar({ speaking }: { speaking: boolean }) {
  const [mouthOpen, setMouthOpen] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (speaking) {
      intervalRef.current = setInterval(() => setMouthOpen((open) => !open), CHOMP_INTERVAL_MS)
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current)
      intervalRef.current = null
      setMouthOpen(false)
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [speaking])

  return (
    <div className="relative flex h-20 w-20 flex-shrink-0 items-center justify-center">
      {speaking && (
        <span className="absolute inset-0 animate-ping rounded-full bg-indigo-400 opacity-30" />
      )}
      <svg viewBox="0 0 100 100" className="relative h-20 w-20">
        <circle cx="50" cy="50" r="46" className="fill-indigo-100 stroke-indigo-400" strokeWidth="2" />
        <circle cx="35" cy="42" r="5" className="fill-indigo-700" />
        <circle cx="65" cy="42" r="5" className="fill-indigo-700" />
        {mouthOpen ? (
          <ellipse cx="50" cy="66" rx="14" ry="9" className="fill-indigo-700" />
        ) : (
          <rect x="36" y="64" width="28" height="4" rx="2" className="fill-indigo-700" />
        )}
      </svg>
    </div>
  )
}
