import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import apiClient from '../../api/client'

interface HrUser {
  full_name: string
  email: string
}

const NOTIFICATION_PREF_KEY = 'hr_notification_preference_enabled'

export default function Settings() {
  const navigate = useNavigate()
  const [user, setUser] = useState<HrUser | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    () => localStorage.getItem(NOTIFICATION_PREF_KEY) !== 'false',
  )

  useEffect(() => {
    apiClient
      .get<HrUser>('/users/me')
      .then((res) => setUser(res.data))
      .catch(() => setError('Ayarlarınız yüklenemedi.'))
  }, [])

  function toggleNotifications() {
    const next = !notificationsEnabled
    setNotificationsEnabled(next)
    localStorage.setItem(NOTIFICATION_PREF_KEY, String(next))
  }

  function handleLogout() {
    localStorage.removeItem('access_token')
    navigate('/hr/login')
  }

  if (error) return <p className="text-sm font-medium text-rose-400">{error}</p>
  if (!user) return <p className="text-sm text-slate-500">Ayarlar yükleniyor...</p>

  return (
    <div>
      <h2 className="mb-6 text-xl font-semibold text-slate-100">Ayarlar</h2>
      <div className="max-w-lg space-y-6">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-sm">
          <h3 className="mb-3 text-base font-medium text-slate-100">Hesap Ayarları</h3>
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-xs uppercase text-slate-500">Ad Soyad</dt>
              <dd className="text-slate-100">{user.full_name}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-slate-500">E-posta</dt>
              <dd className="text-slate-100">{user.email}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-sm">
          <h3 className="mb-1 text-base font-medium text-slate-100">Bildirim Tercihleri</h3>
          <p className="mb-3 text-xs text-slate-500">Bu tercih yalnızca bu tarayıcıda saklanır.</p>
          <label className="flex items-center gap-2 text-sm text-slate-100">
            <input
              type="checkbox"
              className="accent-indigo-500"
              checked={notificationsEnabled}
              onChange={toggleNotifications}
            />
            Mülakat durum bildirimlerini göster
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
