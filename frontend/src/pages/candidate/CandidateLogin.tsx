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
      navigate(`/interview/${data.candidate_id}/consent`)
    } catch {
      setError('Invalid credentials')
    }
  }

  return (
    <div className="mx-auto max-w-sm">
      <h2 className="mb-6 text-xl font-semibold text-gray-900">Candidate Login</h2>
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
