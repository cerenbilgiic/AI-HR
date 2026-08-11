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

  if (error) return <p className="text-sm text-red-600">{error}</p>
  if (!candidate) return <p className="text-sm text-gray-500">Yükleniyor...</p>

  return (
    <div>
      <h2 className="mb-4 text-xl font-semibold text-gray-900">Ayarlar</h2>
      <div className="space-y-6">
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="mb-3 text-base font-medium text-gray-900">Hesap Bilgileri</h3>
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-xs uppercase text-gray-500">Ad Soyad</dt>
              <dd className="text-gray-900">{candidate.full_name}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-gray-500">E-posta</dt>
              <dd className="text-gray-900">{candidate.email}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="mb-1 text-base font-medium text-gray-900">Bildirim Tercihleri</h3>
          <p className="mb-3 text-xs text-gray-500">
            Bu tercih yalnızca bu tarayıcıda saklanır, hesabınıza kaydedilmez.
          </p>
          <label className="flex items-center gap-2 text-sm text-gray-900">
            <input
              type="checkbox"
              className="accent-indigo-600"
              checked={notificationsEnabled}
              onChange={toggleNotifications}
            />
            Mülakat durum bildirimlerini görüntüle
          </label>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="mb-3 text-base font-medium text-gray-900">Hesap</h3>
          <button
            onClick={handleLogout}
            className="rounded border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
          >
            Çıkış Yap
          </button>
        </div>
      </div>
    </div>
  )
}
