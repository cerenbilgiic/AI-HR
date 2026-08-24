import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import apiClient from '../../api/client'

export default function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      const { data } = await apiClient.post('/auth/login', { email, password })
      localStorage.setItem('access_token', data.access_token)
      navigate('/hr/dashboard')
    } catch {
      setError('Geçersiz kullanıcı adı veya şifre')
    }
  }

  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <div className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-lg shadow-black/20">
        <div className="mb-6 text-center">
          <span className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-sm font-bold text-white">
            AI
          </span>
          <h2 className="text-xl font-semibold text-slate-100">İK Girişi</h2>
          <p className="mt-1 text-sm text-slate-500">Devam etmek için hesabınıza giriş yapın</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="email"
            placeholder="E-posta"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded border border-slate-700 bg-slate-800 text-slate-200 placeholder:text-slate-500 px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <input
            type="password"
            placeholder="Şifre"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded border border-slate-700 bg-slate-800 text-slate-200 placeholder:text-slate-500 px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
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
