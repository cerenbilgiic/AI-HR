import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { candidateApiClient } from '../../api/client'

export default function CandidateLogin() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      const { data } = await candidateApiClient.post('/auth/candidate-login', { email, password })
      localStorage.setItem('candidate_access_token', data.access_token)
      navigate(`/interview/${data.candidate_id}/home`)
    } catch {
      setError('Giriş bilgileri hatalı.')
    }
  }

  return (
    <div className="mx-auto max-w-sm">
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-8 shadow-sm">
        <h2 className="mb-1 text-xl font-semibold text-slate-100">Tekrar hoş geldiniz</h2>
        <p className="mb-6 text-sm text-slate-500">
          Mülakatınıza devam etmek için İK'nın size verdiği giriş e-postası ve şifreyle giriş yapın —
          kişisel e-postanız değil.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Giriş E-postası</label>
            <input
              type="email"
              placeholder="ad.soyad1234@aday.mulakat.internal"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded border border-slate-700 bg-slate-800 text-slate-200 placeholder:text-slate-500 px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Şifre</label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded border border-slate-700 bg-slate-800 text-slate-200 placeholder:text-slate-500 px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          {error && <p className="text-sm font-medium text-rose-400">{error}</p>}
          <button
            type="submit"
            className="w-full rounded bg-indigo-600 px-3 py-2 text-white hover:bg-indigo-500"
          >
            Giriş Yap
          </button>
        </form>
      </div>
    </div>
  )
}
