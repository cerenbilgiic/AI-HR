import axios from 'axios'
import { useEffect, useRef, useState } from 'react'
import { candidateApiClient } from '../../api/client'
import type { CandidateDetail } from '../../types'

function fileTypeLabel(filePath: string): string {
  const ext = filePath.split('.').pop()?.toUpperCase()
  return ext ? `${ext} dosyası` : 'Dosya'
}

export default function MyProfile() {
  const [candidate, setCandidate] = useState<CandidateDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const [editing, setEditing] = useState(false)
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  function loadCandidate() {
    return candidateApiClient
      .get<CandidateDetail>('/candidates/me')
      .then((res) => {
        setCandidate(res.data)
        setFullName(res.data.full_name)
        setPhone(res.data.phone ?? '')
      })
      .catch(() => setError('Profiliniz yüklenemedi. Lütfen tekrar deneyin.'))
  }

  useEffect(() => {
    loadCandidate()
  }, [])

  async function handleSaveProfile() {
    setSaving(true)
    setSaveError(null)
    try {
      await candidateApiClient.put('/candidates/me', { full_name: fullName, phone: phone || null })
      await loadCandidate()
      setEditing(false)
    } catch (err) {
      const detail = axios.isAxiosError(err) ? err.response?.data?.detail : undefined
      setSaveError(typeof detail === 'string' ? detail : 'Profiliniz kaydedilemedi. Lütfen tekrar deneyin.')
    } finally {
      setSaving(false)
    }
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setUploadError(null)
    try {
      const formData = new FormData()
      formData.append('cv', file)
      await candidateApiClient.post('/candidates/me/cv', formData)
      await loadCandidate()
    } catch (err) {
      const detail = axios.isAxiosError(err) ? err.response?.data?.detail : undefined
      setUploadError(typeof detail === 'string' ? detail : 'Özgeçmiş yüklenemedi. Lütfen tekrar deneyin.')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  if (error) return <p className="text-sm text-red-600">{error}</p>
  if (!candidate) return <p className="text-sm text-gray-500">Yükleniyor...</p>

  const latestCv = candidate.cvs[candidate.cvs.length - 1]

  return (
    <div>
      <h2 className="mb-4 text-xl font-semibold text-gray-900">Profilim</h2>
      <div className="space-y-6">
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          {editing ? (
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Ad Soyad</label>
                <input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Telefon</label>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              {saveError && <p className="text-sm text-red-600">{saveError}</p>}
              <div className="flex gap-2">
                <button
                  onClick={() => void handleSaveProfile()}
                  disabled={saving}
                  className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {saving ? 'Kaydediliyor…' : 'Kaydet'}
                </button>
                <button
                  onClick={() => {
                    setEditing(false)
                    setFullName(candidate.full_name)
                    setPhone(candidate.phone ?? '')
                  }}
                  className="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Vazgeç
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className="text-lg font-medium text-gray-900">{candidate.full_name}</p>
              <dl className="mt-3 space-y-2 text-sm">
                <div>
                  <dt className="text-xs uppercase text-gray-500">E-posta</dt>
                  <dd className="text-gray-900">{candidate.email}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase text-gray-500">Telefon</dt>
                  <dd className="text-gray-900">{candidate.phone ?? '—'}</dd>
                </div>
              </dl>
              <button
                onClick={() => setEditing(true)}
                className="mt-4 rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
              >
                Profili Düzenle
              </button>
            </>
          )}
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="mb-3 text-base font-medium text-gray-900">Özgeçmiş</h3>
          {latestCv ? (
            <div className="flex items-center gap-3 rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
              <span className="text-2xl">📄</span>
              <span className="text-sm font-medium text-gray-900">{fileTypeLabel(latestCv.file_path)}</span>
            </div>
          ) : (
            <p className="mb-3 text-sm text-gray-500">Özgeçmiş yüklenmemiş.</p>
          )}

          <div className="mt-4 border-t border-gray-100 pt-4">
            <label className="mb-1 block text-xs font-medium text-gray-600">
              {latestCv ? 'Özgeçmişi güncelle' : 'Özgeçmiş yükle'} (PDF, DOC veya DOCX)
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              disabled={uploading}
              onChange={handleFileSelected}
              className="block w-full text-sm text-gray-600 file:mr-3 file:rounded file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-indigo-700 hover:file:bg-indigo-100 disabled:opacity-50"
            />
            {uploading && <p className="mt-2 text-xs text-gray-500">Yükleniyor…</p>}
            {uploadError && <p className="mt-2 text-xs text-red-600">{uploadError}</p>}
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="mb-3 text-base font-medium text-gray-900">Beceriler</h3>
          {candidate.skills.length === 0 ? (
            <p className="text-sm text-gray-500">Belirtilmiş bir beceri yok.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {candidate.skills.map((skill) => (
                <span
                  key={skill.id}
                  className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700"
                >
                  {skill.name}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
