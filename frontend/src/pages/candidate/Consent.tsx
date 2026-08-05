import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import apiClient from '../../api/client'

const CONSENT_ITEMS = [
  { key: 'camera_access', label: 'Camera access' },
  { key: 'microphone_access', label: 'Microphone access' },
  { key: 'audio_recording', label: 'Audio recording' },
  { key: 'video_recording', label: 'Video recording' },
  { key: 'ai_evaluation', label: 'AI evaluation of my responses' },
] as const

type ConsentKey = (typeof CONSENT_ITEMS)[number]['key']

export default function Consent() {
  const { candidateId } = useParams()
  const navigate = useNavigate()
  const [accepted, setAccepted] = useState<Record<ConsentKey, boolean>>({
    camera_access: false,
    microphone_access: false,
    audio_recording: false,
    video_recording: false,
    ai_evaluation: false,
  })

  const allAccepted = Object.values(accepted).every(Boolean)

  async function handleContinue() {
    await apiClient.post(`/candidates/${candidateId}/consent`, accepted)
    navigate(`/interview/${candidateId}/start`)
  }

  return (
    <div className="mx-auto max-w-lg">
      <h2 className="mb-4 text-xl font-semibold text-gray-900">Consent</h2>
      <div className="space-y-3 rounded border border-gray-200 bg-white p-4">
        {CONSENT_ITEMS.map((item) => (
          <label key={item.key} className="flex items-center gap-2 text-sm text-gray-900">
            <input
              type="checkbox"
              checked={accepted[item.key]}
              onChange={(e) => setAccepted((prev) => ({ ...prev, [item.key]: e.target.checked }))}
            />
            {item.label}
          </label>
        ))}
      </div>
      <button
        disabled={!allAccepted}
        onClick={handleContinue}
        className="mt-6 w-full rounded bg-gray-900 px-4 py-2 text-white hover:bg-gray-800 disabled:opacity-40"
      >
        I agree, continue
      </button>
    </div>
  )
}
