import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminApiClient } from '../../api/client'

// The admin portal's own entry point — separate token (admin_access_token,
// see api/client.ts) and separate routes (/admin/*, see App.tsx/AdminLayout)
// from the HR portal's /hr/login. After a valid login it additionally
// checks the account is actually role "admin" and rejects hr/hr_manager
// credentials here even though they're valid on /hr/login, so this stays a
// deliberate admin-only door.
export default function AdminLogin() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      const { data } = await adminApiClient.post('/auth/login', { email, password })
      localStorage.setItem('admin_access_token', data.access_token)
      const { data: me } = await adminApiClient.get<{ role: string }>('/users/me')
      if (me.role !== 'admin') {
        localStorage.removeItem('admin_access_token')
        setError('Bu giriş sayfası yalnızca sistem yöneticileri içindir.')
        return
      }
      navigate('/admin/employees')
    } catch {
      setError('Geçersiz kullanıcı adı veya şifre')
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <div className="mx-auto w-full max-w-sm">
        <h2 className="mb-6 text-xl font-semibold text-slate-100">Yönetici Girişi</h2>
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
    </div>
  )
}
