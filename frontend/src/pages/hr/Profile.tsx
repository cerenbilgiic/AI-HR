import axios from 'axios'
import { useEffect, useState } from 'react'
import apiClient from '../../api/client'

interface HrUser {
  id: number
  email: string
  full_name: string
  role: string
}

const ROLE_LABELS: Record<string, string> = {
  hr: 'HR Manager',
  admin: 'Administrator',
}

export default function Profile() {
  const [user, setUser] = useState<HrUser | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  function load() {
    return apiClient
      .get<HrUser>('/users/me')
      .then((res) => {
        setUser(res.data)
        setFullName(res.data.full_name)
        setEmail(res.data.email)
      })
      .catch(() => setError('Unable to load your profile.'))
  }

  useEffect(() => {
    load()
  }, [])

  async function handleSave() {
    if (!user) return
    setSaving(true)
    setSaveError(null)
    try {
      await apiClient.put(`/users/${user.id}`, { full_name: fullName, email })
      await load()
      setEditing(false)
    } catch (err) {
      const detail = axios.isAxiosError(err) ? err.response?.data?.detail : undefined
      setSaveError(typeof detail === 'string' ? detail : 'Could not save your profile. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (error) return <p className="text-sm text-red-600">{error}</p>
  if (!user) return <p className="text-sm text-gray-500">Loading your profile...</p>

  return (
    <div>
      <h2 className="mb-6 text-xl font-semibold text-gray-900">My Profile</h2>
      <div className="max-w-lg rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        {editing ? (
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Name</label>
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Email</label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            {saveError && <p className="text-sm text-red-600">{saveError}</p>}
            <div className="flex gap-2">
              <button
                onClick={() => void handleSave()}
                disabled={saving}
                className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button
                onClick={() => setEditing(false)}
                className="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-xs uppercase text-gray-500">Name</dt>
                <dd className="text-gray-900">{user.full_name}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-gray-500">Email</dt>
                <dd className="text-gray-900">{user.email}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-gray-500">Role</dt>
                <dd className="text-gray-900">{ROLE_LABELS[user.role] ?? user.role}</dd>
              </div>
            </dl>
            <button
              onClick={() => setEditing(true)}
              className="mt-4 rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
            >
              Edit Profile
            </button>
          </>
        )}
      </div>
    </div>
  )
}
