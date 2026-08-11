import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { candidateApiClient } from '../../api/client'
import type { InterviewSession } from '../../types'

export default function InterviewResultDetail() {
  const { sessionId } = useParams()
  const [session, setSession] = useState<InterviewSession | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    candidateApiClient
      .get<InterviewSession>(`/interviews/${sessionId}`)
      .then((res) => setSession(res.data))
      .catch(() => setError('Sonuç yüklenemedi. Lütfen tekrar deneyin.'))
  }, [sessionId])

  if (error) return <p className="text-sm text-red-600">{error}</p>
  if (!session) return <p className="text-sm text-gray-500">Yükleniyor...</p>

  // Candidate-facing outcome is deliberately binary — "maybe" reads to a
  // candidate the same as a rejection, only an explicit "recommended" is
  // shown as positive.
  const isPositive = session.recommendation === 'recommended'

  return (
    <div>
      <h2 className="mb-4 text-xl font-semibold text-gray-900">Mülakat Sonucu</h2>
      {isPositive ? (
        <div className="rounded-xl border border-green-200 bg-green-50 p-6 text-center">
          <p className="text-2xl font-bold text-green-700">Olumlu</p>
          <p className="mt-2 text-sm text-green-800">
            Sonraki aşama detayları için lütfen mail adresinizi kontrol ediniz.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-2xl font-bold text-red-700">Olumsuz</p>
        </div>
      )}
    </div>
  )
}
