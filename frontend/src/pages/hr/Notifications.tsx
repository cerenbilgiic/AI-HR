import { useEffect, useState } from 'react'
import apiClient from '../../api/client'
import Pagination from '../../components/Pagination'
import type { Candidate, InterviewSession } from '../../types'
import { markAllRead, notificationsFrom, readIds, type NotificationItem } from '../../utils/hrNotifications'

interface HrUser {
  id: number
}

const PAGE_SIZE = 20

export default function Notifications() {
  const [items, setItems] = useState<NotificationItem[] | null>(null)
  const [alreadyRead, setAlreadyRead] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)

  useEffect(() => {
    Promise.all([
      apiClient.get<InterviewSession[]>('/interviews'),
      apiClient.get<Candidate[]>('/candidates'),
      apiClient.get<HrUser>('/users/me'),
    ])
      .then(([sessionsRes, candidatesRes, meRes]) => {
        const derived = notificationsFrom(sessionsRes.data, candidatesRes.data)
        setAlreadyRead(readIds(meRes.data.id))
        setItems(derived)
        markAllRead(meRes.data.id, derived)
      })
      .catch(() => setError('Bildirimler yüklenemedi.'))
  }, [])

  if (error) return <p className="text-sm font-medium text-rose-400">{error}</p>
  if (!items) return <p className="text-sm text-slate-500">Bildirimler yükleniyor...</p>

  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE))
  const pageItems = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <div>
      <h2 className="mb-6 text-xl font-semibold text-slate-100">Bildirimler</h2>
      {items.length === 0 ? (
        <p className="text-sm text-slate-400">Henüz bildirim yok.</p>
      ) : (
        <div className="space-y-2">
          {pageItems.map((n) => {
            const isUnread = !alreadyRead.has(n.id)
            return (
              <div
                key={n.id}
                className={`flex items-start gap-3 rounded-xl border p-4 shadow-sm ${
                  isUnread ? 'border-indigo-500/30 bg-indigo-500/5' : 'border-slate-800 bg-slate-900'
                }`}
              >
                <span className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${isUnread ? 'bg-indigo-400' : 'bg-slate-600'}`} />
                <div>
                  <p className="text-sm font-medium text-slate-100">{n.title}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{new Date(n.timestamp).toLocaleString()}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}
      <Pagination page={page} totalPages={totalPages} onChange={setPage} />
    </div>
  )
}
