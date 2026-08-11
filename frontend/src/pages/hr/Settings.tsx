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
      .catch(() => setError('Unable to load your settings.'))
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

  if (error) return <p className="text-sm text-red-600">{error}</p>
  if (!user) return <p className="text-sm text-gray-500">Loading settings...</p>

  return (
    <div>
      <h2 className="mb-6 text-xl font-semibold text-gray-900">Settings</h2>
      <div className="max-w-lg space-y-6">
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="mb-3 text-base font-medium text-gray-900">Account Settings</h3>
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-xs uppercase text-gray-500">Name</dt>
              <dd className="text-gray-900">{user.full_name}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-gray-500">Email</dt>
              <dd className="text-gray-900">{user.email}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="mb-1 text-base font-medium text-gray-900">Notification Preferences</h3>
          <p className="mb-3 text-xs text-gray-500">This preference is stored in this browser only.</p>
          <label className="flex items-center gap-2 text-sm text-gray-900">
            <input
              type="checkbox"
              className="accent-indigo-600"
              checked={notificationsEnabled}
              onChange={toggleNotifications}
            />
            Show interview status notifications
          </label>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="mb-3 text-base font-medium text-gray-900">Account</h3>
          <button
            onClick={handleLogout}
            className="rounded border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
          >
            Logout
          </button>
        </div>
      </div>
    </div>
  )
}
