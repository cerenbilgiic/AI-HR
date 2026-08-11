import { useEffect, useRef, useState } from 'react'
import femalePhoto from '../assets/avatars/female.jpg'
import malePhoto from '../assets/avatars/male.jpg'

export type AvatarGender = 'female' | 'male'
export type AvatarSize = 'sm' | 'lg'

const PALETTES: Record<AvatarGender, { ring: string; bar: string }> = {
  female: { ring: 'ring-indigo-400', bar: 'bg-indigo-500' },
  male: { ring: 'ring-slate-400', bar: 'bg-slate-500' },
}

const PHOTOS: Record<AvatarGender, string> = {
  female: femalePhoto,
  male: malePhoto,
}

// Percentage position (relative to the square photo) of the mouth's center,
// hand-picked per photo — the two source images frame the face differently,
// so a single shared position would sit on the nose for one of them.
const MOUTH_POSITION: Record<AvatarGender, { left: string; top: string }> = {
  female: { left: '47.5%', top: '70.5%' },
  male: { left: '50%', top: '46.5%' },
}

// A darkened version of each photo's own lip color, sampled from the source
// image — using the real lip tone (instead of one generic color) is what
// keeps the overlay from reading as a sticker glued onto the face.
const MOUTH_COLOR: Record<AvatarGender, string> = {
  female: '60, 28, 24',
  male: '82, 58, 51',
}

const SIZE_CLASSES: Record<AvatarSize, string> = {
  sm: 'h-20 w-20',
  lg: 'h-36 w-36',
}

// Web Speech API exposes no audio stream or phoneme/viseme timing, so this
// can't be true lip-sync — the mouth just chomps on a steady cadence while
// speechSynthesis reports it's speaking, giving a "talking" look rather
// than word- or phoneme-accurate movement.
const CHOMP_INTERVAL_MS = 180

export default function AIAvatar({
  speaking,
  gender = 'female',
  size = 'sm',
}: {
  speaking: boolean
  gender?: AvatarGender
  size?: AvatarSize
}) {
  const palette = PALETTES[gender]
  const mouthPos = MOUTH_POSITION[gender]
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
    <div className={`relative flex flex-shrink-0 items-center justify-center ${SIZE_CLASSES[size]}`}>
      {speaking && <span className={`absolute inset-0 animate-ping rounded-full opacity-30 ${palette.bar}`} />}
      <div className={`relative overflow-hidden rounded-full ring-2 ${palette.ring} ${SIZE_CLASSES[size]}`}>
        <img
          src={PHOTOS[gender]}
          alt={gender === 'female' ? 'Kadın mülakat asistanı' : 'Erkek mülakat asistanı'}
          className={`h-full w-full object-cover ${speaking ? 'avatar-talking' : ''}`}
        />
        {/* Mouth overlay — a soft, feathered shadow (radial gradient, blurred,
            multiply-blended, using the photo's own lip color) sitting on the
            real mouth position, opening/closing on the chomp cadence above.
            A hard-edged solid shape read as a sticker glued onto the face;
            feathering it into the skin is what sells it as part of the photo. */}
        <span
          className="pointer-events-none absolute rounded-[50%] transition-all duration-75"
          style={{
            left: mouthPos.left,
            top: mouthPos.top,
            width: '13%',
            height: mouthOpen ? '5%' : '1.3%',
            transform: 'translate(-50%, -50%)',
            opacity: speaking ? (mouthOpen ? 0.55 : 0.3) : 0,
            background: `radial-gradient(ellipse, rgba(${MOUTH_COLOR[gender]},0.9) 0%, rgba(${MOUTH_COLOR[gender]},0.5) 50%, rgba(${MOUTH_COLOR[gender]},0) 80%)`,
            filter: 'blur(1.5px)',
            mixBlendMode: 'multiply',
          }}
        />
      </div>
      {speaking && (
        <span className="absolute -bottom-1 -right-1 flex h-5 items-end gap-0.5 rounded-full bg-white px-1.5 py-0.5 shadow ring-1 ring-gray-200">
          <span className={`avatar-eq-bar w-1 rounded-sm ${palette.bar}`} style={{ animationDelay: '0ms' }} />
          <span className={`avatar-eq-bar w-1 rounded-sm ${palette.bar}`} style={{ animationDelay: '120ms' }} />
          <span className={`avatar-eq-bar w-1 rounded-sm ${palette.bar}`} style={{ animationDelay: '240ms' }} />
        </span>
      )}
    </div>
  )
}
