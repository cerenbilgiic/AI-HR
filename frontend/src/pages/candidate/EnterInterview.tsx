import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { candidateApiClient } from '../../api/client'
import type { CandidateDetail } from '../../types'

// Landing page for the magic link emailed by HR (see
// invitation_service.send_interview_link) — there is no candidate login
// anymore, this token *is* the candidate's session. Stores it, resolves
// who it belongs to, and hands off straight into the consent flow.
export default function EnterInterview() {
  const { token } = useParams()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) {
      setError('Geçersiz bağlantı.')
      return
    }
    localStorage.setItem('candidate_access_token', token)
    candidateApiClient
      .get<CandidateDetail>('/candidates/me')
      .then((res) => navigate(`/interview/${res.data.id}/consent`, { replace: true }))
      .catch(() => {
        localStorage.removeItem('candidate_access_token')
        setError('Bu bağlantının süresi dolmuş veya geçersiz. Lütfen İK ile iletişime geçin.')
      })
  }, [token, navigate])

  return (
    <div className="mx-auto max-w-md text-center">
      {error ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-8 shadow-sm">
          <p className="text-sm font-medium text-rose-300">{error}</p>
        </div>
      ) : (
        <p className="text-sm text-slate-500">Mülakatınıza yönlendiriliyorsunuz…</p>
      )}
    </div>
  )
}
