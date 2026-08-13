import axios from 'axios'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import apiClient from '../../api/client'
import HrStatusBadge from '../../components/HrStatusBadge'
import type { Candidate, InterviewSession, Job, JobTransferRequest } from '../../types'

interface HrUser {
  id: number
  full_name: string
  role: string
}

function latestSessionFor(candidateId: number, sessions: InterviewSession[]): InterviewSession | undefined {
  return sessions
    .filter((s) => s.candidate_id === candidateId)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
}

// Frontend mirror of jobs.py transfer_job's authorization check — pure UX
// politeness (hides the button when it would just 403), the backend is the
// real gate.
function canTransfer(me: HrUser, job: Job, directory: HrUser[]): boolean {
  if (me.id === job.created_by_id) return true
  if (me.role === 'admin') return true
  const owner = directory.find((u) => u.id === job.created_by_id)
  return me.role === 'hr_manager' && owner?.role === 'hr'
}

export default function JobDetail() {
  const { jobId } = useParams()
  const navigate = useNavigate()
  const [job, setJob] = useState<Job | null>(null)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [sessions, setSessions] = useState<InterviewSession[]>([])
  const [evaluatingId, setEvaluatingId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [newQuestion, setNewQuestion] = useState('')
  const [addingQuestion, setAddingQuestion] = useState(false)
  const [questionError, setQuestionError] = useState<string | null>(null)

  const [me, setMe] = useState<HrUser | null>(null)
  const [directory, setDirectory] = useState<HrUser[]>([])
  const [pendingTransfer, setPendingTransfer] = useState<JobTransferRequest | null>(null)
  const [showTransferForm, setShowTransferForm] = useState(false)
  const [transferTo, setTransferTo] = useState('')
  const [transferring, setTransferring] = useState(false)
  const [transferError, setTransferError] = useState<string | null>(null)

  function loadJob() {
    apiClient.get<Job>(`/jobs/${jobId}`).then((res) => setJob(res.data))
  }

  function loadSessions() {
    apiClient.get<InterviewSession[]>('/interviews', { params: { job_id: jobId } }).then((res) => setSessions(res.data))
  }

  function loadOutgoingTransfer() {
    apiClient.get<JobTransferRequest[]>('/jobs/transfer-requests/outgoing').then((res) => {
      setPendingTransfer(res.data.find((r) => r.job_id === Number(jobId) && r.status === 'pending') ?? null)
    })
  }

  useEffect(() => {
    loadJob()
    apiClient.get<Candidate[]>('/candidates', { params: { job_id: jobId } }).then((res) => setCandidates(res.data))
    loadSessions()
    loadOutgoingTransfer()
    apiClient.get<HrUser>('/users/me').then((res) => setMe(res.data))
    apiClient.get<HrUser[]>('/users/directory').then((res) => setDirectory(res.data))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId])

  async function submitTransfer() {
    if (!transferTo || transferring) return
    setTransferring(true)
    setTransferError(null)
    try {
      await apiClient.post(`/jobs/${jobId}/transfer`, { to_user_id: Number(transferTo) })
      setShowTransferForm(false)
      setTransferTo('')
      loadOutgoingTransfer()
    } catch (err) {
      const detail = axios.isAxiosError(err) ? err.response?.data?.detail : null
      setTransferError(typeof detail === 'string' ? detail : 'Devir talebi gönderilemedi.')
    } finally {
      setTransferring(false)
    }
  }

  async function evaluate(sessionId: number) {
    setEvaluatingId(sessionId)
    setError(null)
    try {
      // generate-report (not the older evaluate) is what actually produces
      // overall_score/competency_scores — the "Evaluate" button should
      // always leave the candidate with a real score, not just a summary.
      await apiClient.post(`/interviews/${sessionId}/generate-report`)
      navigate(`/hr/interviews/${sessionId}`)
    } catch {
      setError('Bu mülakat değerlendirilemedi. Lütfen tekrar deneyin.')
    } finally {
      setEvaluatingId(null)
    }
  }

  async function addQuestion() {
    if (!newQuestion.trim() || addingQuestion || !job) return
    setAddingQuestion(true)
    setQuestionError(null)
    try {
      await apiClient.post(`/jobs/${jobId}/questions`, { text: newQuestion.trim(), order: job.questions.length })
      setNewQuestion('')
      loadJob()
    } catch {
      setQuestionError('Bu soru eklenemedi. Lütfen tekrar deneyin.')
    } finally {
      setAddingQuestion(false)
    }
  }

  async function deleteQuestion(questionId: number) {
    try {
      await apiClient.delete(`/jobs/${jobId}/questions/${questionId}`)
      loadJob()
    } catch {
      setQuestionError('Bu soru silinemedi. Lütfen tekrar deneyin.')
    }
  }

  if (!job) return <p className="text-sm text-slate-500">Yükleniyor...</p>

  return (
    <div>
      <h2 className="mb-2 text-xl font-semibold text-slate-100">{job.title}</h2>
      <p className="mb-1 text-sm text-slate-400">{job.description}</p>
      <p className="mb-4 text-xs text-slate-500">Sahibi: {job.created_by_name ?? '—'}</p>

      {pendingTransfer ? (
        <p className="mb-4 text-xs text-amber-400">
          Devir talebi gönderildi, {pendingTransfer.to_user_name ?? 'alıcı'} onayı bekleniyor.
        </p>
      ) : (
        me &&
        canTransfer(me, job, directory) && (
          <div className="mb-4">
            {!showTransferForm ? (
              <button
                onClick={() => setShowTransferForm(true)}
                className="rounded border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-100 hover:bg-slate-800"
              >
                Devret
              </button>
            ) : (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 p-3">
                <select
                  value={transferTo}
                  onChange={(e) => setTransferTo(e.target.value)}
                  className="rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-200"
                >
                  <option value="">Alıcı seçin…</option>
                  {directory
                    .filter((u) => u.id !== job.created_by_id)
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.full_name}
                      </option>
                    ))}
                </select>
                <button
                  onClick={() => void submitTransfer()}
                  disabled={!transferTo || transferring}
                  className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
                >
                  {transferring ? 'Gönderiliyor…' : 'Talebi Gönder'}
                </button>
                <button
                  onClick={() => {
                    setShowTransferForm(false)
                    setTransferError(null)
                  }}
                  className="rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-800"
                >
                  Vazgeç
                </button>
                {transferError && <p className="w-full text-xs font-medium text-rose-400">{transferError}</p>}
              </div>
            )}
          </div>
        )
      )}

      <div className="mb-6 grid grid-cols-3 gap-4 rounded-xl border border-slate-800 bg-slate-900 p-4 text-center shadow-sm sm:max-w-md">
        <div>
          <p className="text-xl font-semibold text-slate-100">{candidates.length}</p>
          <p className="text-xs text-slate-500">Başvuru</p>
        </div>
        <div>
          <p className="text-xl font-semibold text-slate-100">
            {sessions.filter((s) => s.status !== 'pending').length}
          </p>
          <p className="text-xs text-slate-500">Mülakat Yapıldı</p>
        </div>
        <div>
          <p className="text-xl font-semibold text-slate-100">
            {(() => {
              const scores = sessions.map((s) => s.overall_score).filter((s): s is number => s != null)
              return scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : '—'
            })()}
          </p>
          <p className="text-xs text-slate-500">Ort. Puan</p>
        </div>
      </div>

      <h3 className="mb-3 text-base font-medium text-slate-100">Mülakat Soruları</h3>
      <p className="mb-2 text-xs text-slate-500">
        Bu pozisyona başvuran her adaya bu sorular, bu sırayla sorulur.
      </p>
      {questionError && <p className="mb-2 text-sm font-medium text-rose-400">{questionError}</p>}
      <ul className="mb-3 divide-y divide-slate-800 rounded border border-slate-800 bg-slate-900">
        {job.questions
          .slice()
          .sort((a, b) => a.order - b.order)
          .map((q, i) => (
            <li key={q.id} className="flex items-center justify-between px-4 py-3 text-sm text-slate-100">
              <span>
                <span className="mr-2 text-slate-500">{i + 1}.</span>
                {q.text}
              </span>
              <button
                onClick={() => void deleteQuestion(q.id)}
                className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-400 hover:bg-slate-800"
              >
                Sil
              </button>
            </li>
          ))}
        {job.questions.length === 0 && (
          <li className="px-4 py-3 text-sm text-slate-500">
            Henüz soru eklenmedi — en az bir soru eklenmeden adaylar mülakata başlayamaz.
          </li>
        )}
      </ul>
      <div className="mb-8 flex gap-2">
        <input
          type="text"
          value={newQuestion}
          onChange={(e) => setNewQuestion(e.target.value)}
          placeholder="Mülakat sorusu ekle"
          className="flex-1 rounded border border-slate-700 bg-slate-800 text-slate-200 placeholder:text-slate-500 px-3 py-1.5 text-sm"
        />
        <button
          onClick={() => void addQuestion()}
          disabled={addingQuestion || !newQuestion.trim()}
          className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
        >
          Soru ekle
        </button>
      </div>

      <h3 className="mb-3 text-base font-medium text-slate-100">Adaylar</h3>
      {error && <p className="mb-2 text-sm font-medium text-rose-400">{error}</p>}
      <ul className="divide-y divide-slate-800 rounded border border-slate-800 bg-slate-900">
        {candidates.map((c) => {
          const session = latestSessionFor(c.id, sessions)
          return (
            <li key={c.id} className="flex items-center justify-between px-4 py-3 text-sm text-slate-100">
              <div>
                <p>{c.full_name} — {c.email}</p>
                {session && (
                  <div className="mt-1">
                    <HrStatusBadge status={session.status} />
                  </div>
                )}
              </div>
              {session?.status === 'awaiting_review' && (
                <button
                  onClick={() => void evaluate(session.id)}
                  disabled={evaluatingId === session.id}
                  className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
                >
                  {evaluatingId === session.id ? 'Değerlendiriliyor…' : 'Değerlendir'}
                </button>
              )}
              {session?.status === 'completed' && (
                <button
                  onClick={() => navigate(`/hr/interviews/${session.id}`)}
                  className="rounded border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-100 hover:bg-slate-800"
                >
                  Raporu Görüntüle
                </button>
              )}
            </li>
          )
        })}
        {candidates.length === 0 && (
          <li className="px-4 py-3 text-sm text-slate-500">Henüz aday yok.</li>
        )}
      </ul>
    </div>
  )
}
