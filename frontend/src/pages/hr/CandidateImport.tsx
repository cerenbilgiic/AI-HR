import axios from 'axios'
import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import apiClient from '../../api/client'
import type { CandidateImportSummary } from '../../types'

export default function CandidateImport() {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<CandidateImportSummary | null>(null)

  async function handleDownloadTemplate() {
    const res = await apiClient.get('/candidates/import/template', { responseType: 'blob' })
    const blobUrl = URL.createObjectURL(res.data)
    const link = document.createElement('a')
    link.href = blobUrl
    link.download = 'aday_import_sablonu.xlsx'
    link.click()
    URL.revokeObjectURL(blobUrl)
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError(null)
    setSummary(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const { data } = await apiClient.post<CandidateImportSummary>('/candidates/import', formData)
      setSummary(data)
    } catch (err) {
      const detail = axios.isAxiosError(err) ? err.response?.data?.detail : undefined
      setError(typeof detail === 'string' ? detail : 'Dosya içe aktarılamadı. Lütfen tekrar deneyin.')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-slate-100">Aday İçe Aktar</h2>
        <Link to="/hr/candidates" className="text-sm text-indigo-400 hover:text-indigo-300">
          Adaylara dön
        </Link>
      </div>

      <div className="mb-6 rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-sm">
        <h3 className="mb-1 text-base font-medium text-slate-100">1. Şablonu indirin</h3>
        <p className="mb-3 text-sm text-slate-400">
          Kolonlar:{' '}
          <span className="font-medium text-slate-100">Ad, Soyad, E-posta, Telefon, Pozisyon, Departman</span>.
          Telefon opsiyoneldir. Pozisyon, sistemde tanımlı bir iş ilanının başlığıyla birebir eşleşmelidir.
        </p>
        <button
          onClick={() => void handleDownloadTemplate()}
          className="rounded border border-slate-700 px-4 py-2 text-sm font-medium text-slate-100 hover:bg-slate-800"
        >
          ⬇ Şablon İndir
        </button>
      </div>

      <div className="mb-6 rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-sm">
        <h3 className="mb-1 text-base font-medium text-slate-100">2. Doldurduğunuz dosyayı yükleyin</h3>
        <p className="mb-3 text-sm text-slate-400">CSV veya Excel (.xlsx) dosyası kabul edilir.</p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          disabled={uploading}
          onChange={handleFileSelected}
          className="block w-full text-sm text-slate-400 file:mr-3 file:rounded file:border-0 file:bg-indigo-600 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-indigo-500 disabled:opacity-50"
        />
        {uploading && <p className="mt-2 text-xs text-slate-500">İçe aktarılıyor…</p>}
        {error && <p className="mt-2 text-sm font-medium text-rose-400">{error}</p>}
      </div>

      {summary && (
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-sm">
          <h3 className="mb-4 text-base font-medium text-slate-100">Sonuç</h3>
          <div className="mb-4 grid grid-cols-3 gap-4 text-center text-sm">
            <div className="rounded-lg border border-slate-800 p-3">
              <p className="text-2xl font-semibold text-slate-100">{summary.created}</p>
              <p className="text-slate-500">Eklendi</p>
            </div>
            <div className="rounded-lg border border-slate-800 p-3">
              <p className="text-2xl font-semibold text-slate-100">{summary.errors.length}</p>
              <p className="text-slate-500">Hatalı satır</p>
            </div>
            <div className="rounded-lg border border-slate-800 p-3">
              <p className="text-2xl font-semibold text-slate-100">{summary.duplicates.length}</p>
              <p className="text-slate-500">Mükerrer (atlandı)</p>
            </div>
          </div>

          {summary.errors.length > 0 && (
            <div className="mb-4">
              <h4 className="mb-1 text-sm font-medium text-slate-100">Hatalar</h4>
              <ul className="space-y-1 text-sm text-slate-300">
                {summary.errors.map((e, i) => (
                  <li key={i}>
                    <span className="font-medium text-slate-100">Satır {e.row}:</span> {e.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {summary.duplicates.length > 0 && (
            <div>
              <h4 className="mb-1 text-sm font-medium text-slate-100">Mükerrer kayıtlar</h4>
              <ul className="space-y-1 text-sm text-slate-300">
                {summary.duplicates.map((d, i) => (
                  <li key={i}>
                    <span className="font-medium text-slate-100">Satır {d.row}:</span> {d.email} zaten kayıtlı
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
