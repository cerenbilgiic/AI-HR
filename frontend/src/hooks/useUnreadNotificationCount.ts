import { useEffect, useState } from 'react'
import apiClient from '../api/client'
import type { Candidate, InterviewSession } from '../types'
import { notificationsFrom, readIds } from '../utils/hrNotifications'

// Powers Layout.tsx's header bell badge — read-only (never marks anything
// as read; only pages/hr/Notifications.tsx does that, on visit).
export function useUnreadNotificationCount(enabled: boolean): number {
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    Promise.all([
      apiClient.get<InterviewSession[]>('/interviews'),
      apiClient.get<Candidate[]>('/candidates'),
      apiClient.get<{ id: number }>('/users/me'),
    ])
      .then(([sessionsRes, candidatesRes, meRes]) => {
        if (cancelled) return
        const items = notificationsFrom(sessionsRes.data, candidatesRes.data)
        const read = readIds(meRes.data.id)
        setCount(items.filter((n) => !read.has(n.id)).length)
      })
      .catch(() => {
        // Non-fatal — badge just shows nothing.
      })
    return () => {
      cancelled = true
    }
  }, [enabled])

  return count
}
