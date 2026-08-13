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
    <div className="mx-auto max-w-sm">
      <h2 className="mb-6 text-xl font-semibold text-slate-100">İK Girişi</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="email"
          placeholder="E-posta"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded border border-slate-700 bg-slate-800 text-slate-200 placeholder:text-slate-500 px-3 py-2"
        />
        <input
          type="password"
          placeholder="Şifre"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded border border-slate-700 bg-slate-800 text-slate-200 placeholder:text-slate-500 px-3 py-2"
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
  )
}
