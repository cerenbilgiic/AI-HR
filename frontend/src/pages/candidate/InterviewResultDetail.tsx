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

  if (error) return <p className="text-sm font-medium text-rose-400">{error}</p>
  if (!session) return <p className="text-sm text-slate-500">Yükleniyor...</p>

  // Defensive — MyResults.tsx only links here once HR has decided, but if
  // this is reached directly (e.g. a stale/bookmarked link) before that,
  // don't guess: there's simply nothing to show yet.
  if (session.hr_decision == null) {
    return <p className="text-sm text-slate-500">Sonucunuz henüz değerlendirme aşamasında.</p>
  }

  // Candidate-facing outcome is deliberately binary — "maybe" reads to a
  // candidate the same as a rejection, only an explicit "recommended" is
  // shown as positive. This reads HR's own decision, never the AI's raw
  // suggestion (session.recommendation) — see utils/interviewStatus.ts's
  // candidateFacingStatus for why.
  const isPositive = session.hr_decision === 'recommended'

  return (
    <div>
      <h2 className="mb-4 text-xl font-semibold text-slate-100">Mülakat Sonucu</h2>
      {isPositive ? (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-6 text-center">
          <p className="text-lg font-semibold text-emerald-300">Tebrikler, süreciniz ilerliyor!</p>
          <p className="mt-2 text-sm text-emerald-100/80">
            Mülakatınızı başarıyla tamamladınız ve bir sonraki aşamaya geçmeye hak kazandınız.
            Sonraki adım detayları için lütfen e-posta adresinizi kontrol ediniz.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 text-center">
          <p className="text-lg font-semibold text-slate-100">Değerlendirme tamamlandı</p>
          <p className="mt-2 text-sm text-slate-300">
            Zaman ayırıp mülakatımıza katıldığınız için teşekkür ederiz. Bu pozisyon için
            şu anda süreci sizinle ilerletemiyoruz. Sizinle uyumlu diğer fırsatları takip
            etmenizi dileriz.
          </p>
        </div>
      )}
    </div>
  )
}
