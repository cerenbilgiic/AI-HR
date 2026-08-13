import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { candidateApiClient } from '../../api/client'
import type { CandidateDetail } from '../../types'

const NOTIFICATION_PREF_KEY = 'notification_preference_enabled'

export default function Settings() {
  const navigate = useNavigate()
  const [candidate, setCandidate] = useState<CandidateDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    () => localStorage.getItem(NOTIFICATION_PREF_KEY) !== 'false',
  )

  useEffect(() => {
    candidateApiClient
      .get<CandidateDetail>('/candidates/me')
      .then((res) => setCandidate(res.data))
      .catch(() => setError('Ayarlarınız yüklenemedi. Lütfen tekrar deneyin.'))
  }, [])

  function toggleNotifications() {
    const next = !notificationsEnabled
    setNotificationsEnabled(next)
    localStorage.setItem(NOTIFICATION_PREF_KEY, String(next))
  }

  function handleLogout() {
    localStorage.removeItem('candidate_access_token')
    navigate('/interview/login')
  }

  if (error) return <p className="text-sm font-medium text-rose-400">{error}</p>
  if (!candidate) return <p className="text-sm text-slate-500">Yükleniyor...</p>

  return (
    <div>
      <h2 className="mb-4 text-xl font-semibold text-slate-100">Ayarlar</h2>
      <div className="space-y-6">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-sm">
          <h3 className="mb-3 text-base font-medium text-slate-100">Hesap Bilgileri</h3>
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-xs uppercase text-slate-500">Ad Soyad</dt>
              <dd className="text-slate-100">{candidate.full_name}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-slate-500">E-posta</dt>
              <dd className="text-slate-100">{candidate.email}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-sm">
          <h3 className="mb-1 text-base font-medium text-slate-100">Bildirim Tercihleri</h3>
          <p className="mb-3 text-xs text-slate-500">
            Bu tercih yalnızca bu tarayıcıda saklanır, hesabınıza kaydedilmez.
          </p>
          <label className="flex items-center gap-2 text-sm text-slate-100">
            <input
              type="checkbox"
              className="accent-indigo-500"
              checked={notificationsEnabled}
              onChange={toggleNotifications}
            />
            Mülakat durum bildirimlerini görüntüle
          </label>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-sm">
          <h3 className="mb-3 text-base font-medium text-slate-100">Hesap</h3>
          <button
            onClick={handleLogout}
            className="rounded border border-slate-700 px-4 py-2 text-sm font-medium text-slate-100 hover:bg-slate-800"
          >
            Çıkış Yap
          </button>
        </div>
      </div>
    </div>
  )
}
