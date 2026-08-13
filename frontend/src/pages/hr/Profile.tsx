import axios from 'axios'
import { useEffect, useState } from 'react'
import apiClient from '../../api/client'
import { ROLE_LABELS } from '../../utils/roles'

interface HrUser {
  id: number
  email: string
  full_name: string
  role: string
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
      .catch(() => setError('Profiliniz yüklenemedi.'))
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
      setSaveError(typeof detail === 'string' ? detail : 'Profiliniz kaydedilemedi. Lütfen tekrar deneyin.')
    } finally {
      setSaving(false)
    }
  }

  if (error) return <p className="text-sm font-medium text-rose-400">{error}</p>
  if (!user) return <p className="text-sm text-slate-500">Profiliniz yükleniyor...</p>

  return (
    <div>
      <h2 className="mb-6 text-xl font-semibold text-slate-100">Profilim</h2>
      <div className="max-w-lg rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-sm">
        {editing ? (
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Ad Soyad</label>
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full rounded border border-slate-700 bg-slate-800 text-slate-200 placeholder:text-slate-500 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">E-posta</label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded border border-slate-700 bg-slate-800 text-slate-200 placeholder:text-slate-500 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            {saveError && <p className="text-sm font-medium text-rose-400">{saveError}</p>}
            <div className="flex gap-2">
              <button
                onClick={() => void handleSave()}
                disabled={saving}
                className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                {saving ? 'Kaydediliyor…' : 'Kaydet'}
              </button>
              <button
                onClick={() => setEditing(false)}
                className="rounded border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800"
              >
                Vazgeç
              </button>
            </div>
          </div>
        ) : (
          <>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-xs uppercase text-slate-500">Ad Soyad</dt>
                <dd className="text-slate-100">{user.full_name}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-slate-500">E-posta</dt>
                <dd className="text-slate-100">{user.email}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-slate-500">Rol</dt>
                <dd className="text-slate-100">{ROLE_LABELS[user.role] ?? user.role}</dd>
              </div>
            </dl>
            <button
              onClick={() => setEditing(true)}
              className="mt-4 rounded border border-slate-700 px-4 py-2 text-sm font-medium text-slate-100 hover:bg-slate-800"
            >
              Profili Düzenle
            </button>
          </>
        )}
      </div>
    </div>
  )
}
