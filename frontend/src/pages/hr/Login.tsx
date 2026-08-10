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
      setError('Invalid credentials')
    }
  }

  return (
    <div className="mx-auto max-w-sm">
      <h2 className="mb-6 text-xl font-semibold text-gray-900">HR Login</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded border border-gray-300 px-3 py-2"
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded border border-gray-300 px-3 py-2"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          className="w-full rounded bg-gray-900 px-3 py-2 text-white hover:bg-gray-800"
        >
          Sign in
        </button>
      </form>
    </div>
  )
}
