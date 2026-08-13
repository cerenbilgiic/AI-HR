import axios from 'axios'
import { useEffect, useMemo, useState } from 'react'
import apiClient from '../../api/client'
import type { AuditLogEntry } from '../../types'

const ACTION_LABELS: Record<string, string> = {
  credentials_issued: 'Giriş bilgileri oluşturuldu',
  credentials_reissued: 'Giriş bilgileri yeniden oluşturuldu',
  candidates_imported: 'Adaylar içe aktarıldı',
}

function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action
}

function detailSummary(detail: Record<string, unknown> | null): string | null {
  if (!detail) return null
  if ('created' in detail) {
    return `${detail.created} eklendi, ${detail.errors ?? 0} hatalı, ${detail.duplicates ?? 0} mükerrer`
  }
  return null
}

export default function AuditLog() {
  const [entries, setEntries] = useState<AuditLogEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [forbidden, setForbidden] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => {
    apiClient
      .get<AuditLogEntry[]>('/audit-logs')
      .then((res) => setEntries(res.data))
      .catch((err) => {
        if (axios.isAxiosError(err) && err.response?.status === 403) {
          setForbidden(true)
        } else {
          setError('İşlem geçmişi yüklenemedi. Lütfen tekrar deneyin.')
        }
      })
  }, [])

  const rows = useMemo(() => {
    if (!entries) return []
    if (!search.trim()) return entries
    const q = search.trim().toLowerCase()
    return entries.filter(
      (e) =>
        (e.actor_name?.toLowerCase().includes(q) ?? false) ||
        (e.candidate_name?.toLowerCase().includes(q) ?? false) ||
        actionLabel(e.action).toLowerCase().includes(q),
    )
  }, [entries, search])

  if (forbidden) {
    return <p className="text-sm font-medium text-rose-400">Bu sayfayı görüntüleme yetkiniz yok.</p>
  }
  if (error) return <p className="text-sm font-medium text-rose-400">{error}</p>
  if (!entries) return <p className="text-sm text-slate-500">İşlem geçmişi yükleniyor...</p>

  return (
    <div>
      <h2 className="mb-6 text-xl font-semibold text-slate-100">İşlem Geçmişi</h2>

      <input
        type="text"
        placeholder="Kişi, aday veya işleme göre ara"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mb-4 w-72 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      />

      <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900 shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-800 bg-slate-800/50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Zaman</th>
              <th className="px-4 py-3">Kim</th>
              <th className="px-4 py-3">Aday</th>
              <th className="px-4 py-3">İşlem</th>
              <th className="px-4 py-3">Detay</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {rows.map((entry) => (
              <tr key={entry.id} className="hover:bg-slate-800">
                <td className="whitespace-nowrap px-4 py-3 text-slate-400">
                  {new Date(entry.created_at).toLocaleString('tr-TR')}
                </td>
                <td className="px-4 py-3 text-slate-100">
                  {entry.actor_name ?? (entry.actor_type === 'system' ? 'Sistem' : '—')}
                </td>
                <td className="px-4 py-3 text-slate-300">{entry.candidate_name ?? '—'}</td>
                <td className="px-4 py-3 text-slate-100">{actionLabel(entry.action)}</td>
                <td className="px-4 py-3 text-slate-500">{detailSummary(entry.detail) ?? '—'}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-sm text-slate-500">
                  Kayıt bulunamadı.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
