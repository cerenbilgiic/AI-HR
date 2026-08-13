import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import AIAvatar, { type AvatarGender } from '../../components/AIAvatar'

const OPTIONS: { gender: AvatarGender; label: string }[] = [
  { gender: 'female', label: 'Kadın Asistan' },
  { gender: 'male', label: 'Erkek Asistan' },
]

export default function AvatarSelection() {
  const { candidateId } = useParams()
  const navigate = useNavigate()
  const [selected, setSelected] = useState<AvatarGender | null>(null)

  function proceed() {
    if (!selected) return
    sessionStorage.setItem('interview_avatar_gender', selected)
    navigate(`/interview/${candidateId}/start`)
  }

  return (
    <div className="mx-auto max-w-lg">
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-8 text-center shadow-sm">
        <h2 className="mb-2 text-xl font-semibold text-slate-100">Mülakat asistanınızı seçin</h2>
        <p className="mb-6 text-sm text-slate-400">
          Mülakat boyunca sizinle bu asistan konuşacak ve soruları soracak.
        </p>
        <div className="mb-6 grid grid-cols-2 gap-4">
          {OPTIONS.map((option) => (
            <button
              key={option.gender}
              type="button"
              onClick={() => setSelected(option.gender)}
              className={`flex flex-col items-center gap-3 rounded-lg border-2 p-4 transition ${
                selected === option.gender
                  ? 'border-indigo-500 bg-indigo-500/10'
                  : 'border-slate-800 hover:border-slate-700'
              }`}
            >
              <AIAvatar speaking={false} gender={option.gender} />
              <span className="text-sm font-medium text-slate-100">{option.label}</span>
            </button>
          ))}
        </div>
        <button
          onClick={proceed}
          disabled={!selected}
          className="w-full rounded bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-500 disabled:opacity-40"
        >
          Devam Et
        </button>
      </div>
    </div>
  )
}
