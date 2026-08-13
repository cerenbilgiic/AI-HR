import axios from 'axios'
import { useEffect, useRef, useState } from 'react'
import { candidateApiClient } from '../../api/client'
import type { CandidateCV, CandidateDetail } from '../../types'

function fileTypeLabel(filePath: string): string {
  const ext = filePath.split('.').pop()?.toUpperCase()
  return ext ? `${ext} dosyası` : 'Dosya'
}

// How long to keep polling for AI-extracted skills after a CV upload —
// the extraction runs as a backend background task (can take up to ~1
// minute on a cold local model), so the newly-added skills won't show up
// from the upload response itself. See candidate_service.extract_and_merge_cv_skills.
const SKILLS_POLL_INTERVAL_MS = 5000
const SKILLS_POLL_MAX_ATTEMPTS = 18 // ~90s

export default function MyProfile() {
  const [candidate, setCandidate] = useState<CandidateDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [waitingForSkills, setWaitingForSkills] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const skillsPollRef = useRef<{ timer: ReturnType<typeof setInterval> | null; attempts: number; baseline: number }>({
    timer: null,
    attempts: 0,
    baseline: 0,
  })

  useEffect(() => {
    return () => {
      if (skillsPollRef.current.timer) clearInterval(skillsPollRef.current.timer)
    }
  }, [])

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
        return res.data
      })
      .catch(() => {
        setError('Profiliniz yüklenemedi. Lütfen tekrar deneyin.')
        return null
      })
  }

  useEffect(() => {
    loadCandidate()
  }, [])

  function startSkillsPolling(baselineCount: number) {
    if (skillsPollRef.current.timer) clearInterval(skillsPollRef.current.timer)
    skillsPollRef.current = { timer: null, attempts: 0, baseline: baselineCount }
    setWaitingForSkills(true)
    const timer = setInterval(() => {
      skillsPollRef.current.attempts += 1
      loadCandidate().then((data) => {
        const done =
          !data ||
          data.skills.length !== skillsPollRef.current.baseline ||
          skillsPollRef.current.attempts >= SKILLS_POLL_MAX_ATTEMPTS
        if (done) {
          clearInterval(timer)
          skillsPollRef.current.timer = null
          setWaitingForSkills(false)
        }
      })
    }, SKILLS_POLL_INTERVAL_MS)
    skillsPollRef.current.timer = timer
  }

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
    const baselineSkillCount = candidate?.skills.length ?? 0
    setUploading(true)
    setUploadError(null)
    try {
      const formData = new FormData()
      formData.append('cv', file)
      const { data: uploadedCv } = await candidateApiClient.post<CandidateCV>('/candidates/me/cv', formData)
      await loadCandidate()
      // Only poll if the backend actually extracted text — otherwise no
      // background skill-extraction task was scheduled at all (see
      // routers/candidates.py's upload_my_cv), so there's nothing to wait for.
      if (uploadedCv.parsed_text) {
        startSkillsPolling(baselineSkillCount)
      }
    } catch (err) {
      const detail = axios.isAxiosError(err) ? err.response?.data?.detail : undefined
      setUploadError(typeof detail === 'string' ? detail : 'Özgeçmiş yüklenemedi. Lütfen tekrar deneyin.')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  if (error) return <p className="text-sm font-medium text-rose-400">{error}</p>
  if (!candidate) return <p className="text-sm text-slate-500">Yükleniyor...</p>

  const latestCv = candidate.cvs[candidate.cvs.length - 1]

  return (
    <div>
      <h2 className="mb-4 text-xl font-semibold text-slate-100">Profilim</h2>
      <div className="space-y-6">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-sm">
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
                <label className="mb-1 block text-xs font-medium text-slate-400">Telefon</label>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full rounded border border-slate-700 bg-slate-800 text-slate-200 placeholder:text-slate-500 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              {saveError && <p className="text-sm font-medium text-rose-400">{saveError}</p>}
              <div className="flex gap-2">
                <button
                  onClick={() => void handleSaveProfile()}
                  disabled={saving}
                  className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                >
                  {saving ? 'Kaydediliyor…' : 'Kaydet'}
                </button>
                <button
                  onClick={() => {
                    setEditing(false)
                    setFullName(candidate.full_name)
                    setPhone(candidate.phone ?? '')
                  }}
                  className="rounded border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800"
                >
                  Vazgeç
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className="text-lg font-medium text-slate-100">{candidate.full_name}</p>
              <dl className="mt-3 space-y-2 text-sm">
                <div>
                  <dt className="text-xs uppercase text-slate-500">E-posta</dt>
                  <dd className="text-slate-100">{candidate.email}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase text-slate-500">Telefon</dt>
                  <dd className="text-slate-100">{candidate.phone ?? '—'}</dd>
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

        <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-sm">
          <h3 className="mb-3 text-base font-medium text-slate-100">Özgeçmiş</h3>
          {latestCv ? (
            <div className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-800 px-4 py-3">
              <span className="text-2xl">📄</span>
              <span className="text-sm font-medium text-slate-100">{fileTypeLabel(latestCv.file_path)}</span>
            </div>
          ) : (
            <p className="mb-3 text-sm text-slate-500">Özgeçmiş yüklenmemiş.</p>
          )}

          <div className="mt-4 border-t border-slate-800 pt-4">
            <label className="mb-1 block text-xs font-medium text-slate-400">
              {latestCv ? 'Özgeçmişi güncelle' : 'Özgeçmiş yükle'} (PDF, DOC veya DOCX)
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              disabled={uploading}
              onChange={handleFileSelected}
              className="block w-full text-sm text-slate-400 file:mr-3 file:rounded file:border-0 file:bg-indigo-600 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-indigo-500 disabled:opacity-50"
            />
            {uploading && <p className="mt-2 text-xs text-slate-500">Yükleniyor…</p>}
            {uploadError && <p className="mt-2 text-xs font-medium text-rose-400">{uploadError}</p>}
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-sm">
          <h3 className="mb-1 text-base font-medium text-slate-100">Beceriler</h3>
          <p className="mb-3 text-xs text-slate-500">
            Özgeçmişiniz yüklendiğinde yapay zekâ tarafından otomatik olarak tespit edilir.
          </p>
          {waitingForSkills && (
            <p className="mb-3 text-xs font-medium text-slate-300">
              ⏳ Yapay zekâ özgeçmişinizi inceliyor, beceriler birazdan burada görünecek…
            </p>
          )}
          {candidate.skills.length === 0 ? (
            <p className="text-sm text-slate-500">
              {waitingForSkills ? 'Henüz beceri tespit edilmedi.' : 'Belirtilmiş bir beceri yok.'}
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {candidate.skills.map((skill) => (
                <span
                  key={skill.id}
                  className="rounded-full bg-slate-800 px-3 py-1 text-xs font-medium text-slate-300"
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
