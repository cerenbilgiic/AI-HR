import axios from 'axios'
import { Eye, UserRoundSearch, Video, Upload } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import apiClient from '../../api/client'
import CandidateDetailPanel from '../../components/CandidateDetailPanel'
import HrStatusBadge from '../../components/HrStatusBadge'
import InterviewDetailPanel from '../../components/InterviewDetailPanel'
import Pagination from '../../components/Pagination'
import RecommendationBadge, { effectiveRecommendation } from '../../components/RecommendationBadge'
import { pipelineStatus } from '../../utils/hrStatus'
import type { Candidate, InterviewSession, InvitationEmail, InvitationOut, Job } from '../../types'

const PAGE_SIZE = 10
type SortKey = 'date' | 'score'

function latestSessionFor(candidateId: number, sessions: InterviewSession[]): InterviewSession | undefined {
  return sessions
    .filter((s) => s.candidate_id === candidateId)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
}

// Once a candidate has any interview session — in any status, not just a
// final HR decision — they have no fresh interview to send a link to
// (create_session refuses a second attempt regardless of that session's
// status) — mirrors the backend guard in
// invitation_service._has_started_interview.
function hasStartedInterview(session: InterviewSession | undefined): boolean {
  return session != null
}

// Opens the invitation draft as a real Gmail compose tab instead of sending
// through backend SMTP — HR reviews/edits it in their own Gmail account and
// hits send themselves. URLSearchParams handles the percent-encoding
// (including newlines as %0A) for the multi-line body.
function gmailComposeUrl(email: InvitationEmail): string {
  const params = new URLSearchParams({ view: 'cm', fs: '1', to: email.to, su: email.subject, body: email.body })
  return `https://mail.google.com/mail/?${params.toString()}`
}

function initialsOf(fullName: string): string {
  return fullName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}

// Left panel: candidate list — the same search/filter/bulk-invite/CSV-import
// functionality that used to live in the standalone CandidateList.tsx page,
// just condensed for a ~360px column with pagination.
function CandidateListPanel({ selectedCandidateId }: { selectedCandidateId: string | undefined }) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [candidates, setCandidates] = useState<Candidate[] | null>(null)
  const [sessions, setSessions] = useState<InterviewSession[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState(() => searchParams.get('q') ?? '')
  const [statusFilter, setStatusFilter] = useState('all')
  const [positionFilter, setPositionFilter] = useState('all')
  const [recommendationFilter, setRecommendationFilter] = useState('all')
  const [minScore, setMinScore] = useState('')
  const [sortKey, setSortKey] = useState<SortKey | null>(null)
  const [sortDesc, setSortDesc] = useState(true)
  const [page, setPage] = useState(1)

  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [lastSent, setLastSent] = useState<InvitationOut | InvitationOut[] | null>(null)
  const [inviteError, setInviteError] = useState<string | null>(null)

  // Preview-before-send: clicking "Davet gönder" (single or bulk) opens a
  // draft of the actual email — including the real magic link — that HR
  // reviews before anything actually goes out. previewItems is null until
  // a preview has been requested; previewLoading distinguishes "fetching
  // the draft" from "draft ready, waiting for HR to confirm or cancel".
  const [previewItems, setPreviewItems] = useState<{ candidateId: number; email: InvitationEmail }[] | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  // Which candidates in the current preview HR has already clicked
  // "Gmail'de Aç" for — purely a per-row label swap, see handleGmailOpened.
  const [markedIds, setMarkedIds] = useState<Set<number>>(new Set())

  function loadData() {
    return Promise.all([
      apiClient.get<Candidate[]>('/candidates'),
      apiClient.get<InterviewSession[]>('/interviews'),
      apiClient.get<Job[]>('/jobs'),
    ])
      .then(([candidatesRes, sessionsRes, jobsRes]) => {
        setCandidates(candidatesRes.data)
        setSessions(sessionsRes.data)
        setJobs(jobsRes.data)
      })
      .catch(() => setError('Aday bilgileri yüklenemedi.'))
  }

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const jobById = useMemo(() => new Map(jobs.map((j) => [j.id, j])), [jobs])
  const candidateById = useMemo(() => new Map((candidates ?? []).map((c) => [c.id, c])), [candidates])

  const rows = useMemo(() => {
    if (!candidates) return []
    let result = candidates.map((c) => ({
      candidate: c,
      job: jobById.get(c.job_id),
      session: latestSessionFor(c.id, sessions),
    }))

    if (search.trim()) {
      const q = search.trim().toLowerCase()
      result = result.filter(
        (r) => r.candidate.full_name.toLowerCase().includes(q) || r.candidate.email.toLowerCase().includes(q),
      )
    }
    if (statusFilter !== 'all') {
      result = result.filter((r) => pipelineStatus(r.candidate, r.session) === statusFilter)
    }
    if (positionFilter !== 'all') {
      result = result.filter((r) => String(r.candidate.job_id) === positionFilter)
    }
    if (recommendationFilter !== 'all') {
      result = result.filter((r) => r.session && effectiveRecommendation(r.session) === recommendationFilter)
    }
    if (minScore.trim()) {
      const min = Number(minScore)
      result = result.filter((r) => r.session?.overall_score != null && r.session.overall_score >= min)
    }
    if (sortKey) {
      result = [...result].sort((a, b) => {
        // updated_at, not created_at — created_at is fixed at interview
        // start, so "sort by date" needs the most recent status change
        // (e.g. just completed) to actually move a candidate, not their
        // original start time (see InterviewList.tsx's identical fix).
        const av = sortKey === 'score' ? (a.session?.overall_score ?? -1) : new Date(a.session?.updated_at ?? 0).getTime()
        const bv = sortKey === 'score' ? (b.session?.overall_score ?? -1) : new Date(b.session?.updated_at ?? 0).getTime()
        return sortDesc ? bv - av : av - bv
      })
    }
    return result
  }, [candidates, sessions, jobById, search, statusFilter, positionFilter, recommendationFilter, minScore, sortKey, sortDesc])

  useEffect(() => {
    setPage(1)
  }, [search, statusFilter, positionFilter, recommendationFilter, minScore])

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDesc((d) => !d)
    } else {
      setSortKey(key)
      setSortDesc(true)
    }
  }

  function toggleSelected(candidateId: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(candidateId)) next.delete(candidateId)
      else next.add(candidateId)
      return next
    })
  }

  async function openInvitePreview(candidateIds: number[]) {
    setInviteError(null)
    setPreviewLoading(true)
    setPreviewItems(null)
    setMarkedIds(new Set())
    try {
      const results = await Promise.all(
        candidateIds.map((id) =>
          apiClient
            .get<InvitationEmail>(`/candidates/${id}/invite-email`)
            .then((res) => ({ candidateId: id, email: res.data })),
        ),
      )
      setPreviewItems(results)
    } catch (err) {
      const detail = axios.isAxiosError(err) ? err.response?.data?.detail : undefined
      setInviteError(typeof detail === 'string' ? detail : 'Taslak hazırlanamadı. Lütfen tekrar deneyin.')
    } finally {
      setPreviewLoading(false)
    }
  }

  function closeInvitePreview() {
    setPreviewItems(null)
    setSelected(new Set())
  }

  // Each candidate gets its own real <a target="_blank"> link in the modal
  // (see the JSX below) rather than a single button that loops
  // window.open() — a script-triggered window.open is exactly what popup
  // blockers exist to stop (and browsers cap how many a single click may
  // open at once), while a genuine anchor click essentially never gets
  // blocked. onClick fires alongside the browser's own navigation, so this
  // just records that HR opened Gmail for that candidate.
  function handleGmailOpened(candidateId: number) {
    setMarkedIds((prev) => new Set(prev).add(candidateId))
    void markAsInvited([candidateId])
  }

  async function markAsInvited(ids: number[]) {
    try {
      if (ids.length === 1) {
        const { data } = await apiClient.post<InvitationOut>(`/candidates/${ids[0]}/invite`)
        setLastSent(data)
      } else {
        const { data } = await apiClient.post<InvitationOut[]>('/candidates/invite-bulk', ids)
        setLastSent(data)
      }
      await loadData()
    } catch (err) {
      const detail = axios.isAxiosError(err) ? err.response?.data?.detail : undefined
      setInviteError(typeof detail === 'string' ? detail : 'Gmail açıldı, ancak davet durumu güncellenemedi.')
    }
  }

  if (error) return <p className="text-sm font-medium text-rose-400">{error}</p>
  if (!candidates) return <p className="text-sm text-slate-500">Adaylar yükleniyor...</p>

  return (
    <div className="flex h-full flex-col rounded-xl border border-slate-800 bg-slate-900 shadow-sm">
      <div className="space-y-3 border-b border-slate-800 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-100">Adaylar</h2>
          <Link
            to="/hr/candidates/import"
            className="flex items-center gap-1 text-xs font-medium text-indigo-400 hover:text-indigo-300"
          >
            <Upload className="h-3.5 w-3.5" />
            İçe Aktar
          </Link>
        </div>

        {selected.size > 0 && (
          <div className="flex items-center justify-between rounded-lg bg-indigo-500/10 px-3 py-2 text-xs">
            <span className="text-indigo-300">{selected.size} seçildi</span>
            <button
              onClick={() => void openInvitePreview(Array.from(selected))}
              disabled={previewLoading}
              className="rounded bg-indigo-600 px-2 py-1 font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {previewLoading ? 'Taslak hazırlanıyor…' : 'Davet Gönder'}
            </button>
          </div>
        )}
        {inviteError && <p className="text-xs font-medium text-rose-400">{inviteError}</p>}
        {lastSent && (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="font-medium text-emerald-300">Gmail'de taslak açıldı.</span>
              <button onClick={() => setLastSent(null)} className="text-slate-400 hover:text-slate-200">
                ✕
              </button>
            </div>
            <div className="space-y-1">
              {(Array.isArray(lastSent) ? lastSent : [lastSent]).map((sent) => (
                <p key={sent.candidate_id} className="text-slate-300">
                  <span className="font-medium text-slate-100">
                    {candidateById.get(sent.candidate_id)?.full_name ?? `Aday #${sent.candidate_id}`}
                  </span>{' '}
                  → {sent.sent_to}
                </p>
              ))}
            </div>
          </div>
        )}

        <input
          type="text"
          placeholder="Ad veya e-postaya göre ara"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-200"
        >
          <option value="all">Tüm durumlar</option>
          <option value="not_invited">Beklemede</option>
          <option value="invited">Davet Gönderildi</option>
          <option value="logged_in">Giriş Yaptı</option>
          <option value="in_progress">Mülakatta</option>
          <option value="awaiting_review">Tamamlandı</option>
          <option value="completed">Değerlendirildi</option>
          <option value="terminated">Sonlandırıldı</option>
        </select>
        <select
          value={positionFilter}
          onChange={(e) => setPositionFilter(e.target.value)}
          className="w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-200"
        >
          <option value="all">Tüm pozisyonlar</option>
          {jobs.map((j) => (
            <option key={j.id} value={j.id}>
              {j.title}
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <select
            value={recommendationFilter}
            onChange={(e) => setRecommendationFilter(e.target.value)}
            className="w-1/2 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-200"
          >
            <option value="all">Tüm tavsiyeler</option>
            <option value="recommended">Olumlu</option>
            <option value="maybe">Belirsiz</option>
            <option value="not_recommended">Olumsuz</option>
          </select>
          <input
            type="number"
            min={0}
            max={100}
            placeholder="Min. puan"
            value={minScore}
            onChange={(e) => setMinScore(e.target.value)}
            className="w-1/2 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-200 placeholder:text-slate-500"
          />
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              className="accent-indigo-500"
              checked={
                selected.size > 0 &&
                pageRows.filter((r) => !hasStartedInterview(r.session)).every((r) => selected.has(r.candidate.id))
              }
              onChange={(e) =>
                setSelected(
                  e.target.checked
                    ? new Set(pageRows.filter((r) => !hasStartedInterview(r.session)).map((r) => r.candidate.id))
                    : new Set(),
                )
              }
            />
            Tümünü seç
          </label>
          <button onClick={() => toggleSort('score')} className={sortKey === 'score' ? 'text-indigo-400' : 'hover:text-slate-300'}>
            Puana göre sırala {sortKey === 'score' ? (sortDesc ? '↓' : '↑') : ''}
          </button>
          <button onClick={() => toggleSort('date')} className={sortKey === 'date' ? 'text-indigo-400' : 'hover:text-slate-300'}>
            Tarihe göre sırala {sortKey === 'date' ? (sortDesc ? '↓' : '↑') : ''}
          </button>
        </div>
      </div>

      <div className="flex-1 divide-y divide-slate-800 overflow-y-auto">
        {pageRows.length === 0 && <p className="p-4 text-center text-sm text-slate-500">Eşleşen aday yok.</p>}
        {pageRows.map(({ candidate, job, session }) => (
          <div
            key={candidate.id}
            className={`flex cursor-pointer items-center gap-2 px-4 py-3 ${
              selectedCandidateId === String(candidate.id) ? 'bg-indigo-500/10' : 'hover:bg-slate-800/60'
            }`}
            onClick={() => navigate(`/hr/candidates/${candidate.id}`)}
          >
            <input
              type="checkbox"
              className="accent-indigo-500 disabled:opacity-30"
              checked={selected.has(candidate.id)}
              disabled={hasStartedInterview(session)}
              onClick={(e) => e.stopPropagation()}
              onChange={() => toggleSelected(candidate.id)}
            />
            <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-slate-700 text-xs font-semibold text-slate-200">
              {initialsOf(candidate.full_name)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-100">{candidate.full_name}</p>
              <p className="truncate text-xs text-slate-500">{job?.title ?? '—'}</p>
              <div className="mt-1 flex items-center gap-2">
                <HrStatusBadge status={pipelineStatus(candidate, session)} />
                {session?.overall_score != null && <span className="text-xs text-slate-400">{session.overall_score}/100</span>}
              </div>
              {session && effectiveRecommendation(session) && (
                <div className="mt-1">
                  <RecommendationBadge recommendation={effectiveRecommendation(session)!} />
                </div>
              )}
              {hasStartedInterview(session) ? (
                <p className="mt-1.5 text-[11px] font-medium text-slate-600">
                  Aday mülakatını zaten başlattı/tamamladı — tekrar davet gönderilemez.
                </p>
              ) : (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    void openInvitePreview([candidate.id])
                  }}
                  disabled={previewLoading}
                  className="mt-1.5 text-[11px] font-medium text-indigo-400 hover:text-indigo-300 disabled:opacity-50"
                >
                  {previewLoading ? 'Taslak hazırlanıyor…' : candidate.invited_at ? 'Yeniden davet gönder' : 'Davet gönder'}
                </button>
              )}
            </div>
            <Eye className="h-4 w-4 flex-shrink-0 text-slate-600" />
          </div>
        ))}
      </div>

      <div className="border-t border-slate-800 p-2">
        <Pagination page={page} totalPages={totalPages} onChange={setPage} />
      </div>

      {previewItems && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-xl bg-slate-900 p-6 shadow-lg">
            <h3 className="mb-1 text-lg font-semibold text-slate-100">
              {previewItems.length > 1 ? `${previewItems.length} Davet — Önizleme` : 'Davet — Önizleme'}
            </h3>
            <p className="mb-4 text-xs text-slate-500">
              Her aday için "Gmail'de Aç" bu içerikle dolu bir Gmail taslak sekmesi açar — e-postayı
              gerçekten göndermek için Gmail'deki "Gönder" butonuna basmanız gerekir.
            </p>
            <div className="space-y-3">
              {previewItems.map((item) => {
                const c = candidateById.get(item.candidateId)
                return (
                  <div key={item.candidateId} className="rounded-lg border border-slate-800 bg-slate-800/40 p-3">
                    {c && <p className="mb-1 text-xs font-medium text-slate-100">{c.full_name}</p>}
                    <p className="text-xs text-slate-500">
                      Alıcı: <span className="text-slate-300">{item.email.to}</span>
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Konu: <span className="text-slate-300">{item.email.subject}</span>
                    </p>
                    <p className="mt-2 whitespace-pre-line rounded border border-slate-700 bg-slate-900 p-2 text-xs text-slate-300">
                      {item.email.body}
                    </p>
                    <a
                      href={gmailComposeUrl(item.email)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => handleGmailOpened(item.candidateId)}
                      className={`mt-2 inline-block rounded px-3 py-1.5 text-xs font-medium text-white ${
                        markedIds.has(item.candidateId) ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-indigo-600 hover:bg-indigo-500'
                      }`}
                    >
                      {markedIds.has(item.candidateId) ? "Gmail'de açıldı ✓" : "Gmail'de Aç →"}
                    </a>
                  </div>
                )
              })}
            </div>
            <div className="mt-4">
              <button
                onClick={closeInvitePreview}
                className="w-full rounded border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function CandidateWorkspace() {
  const { candidateId } = useParams()
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null)

  useEffect(() => {
    setSelectedSessionId(null)
  }, [candidateId])

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[340px_1fr_1.3fr] lg:items-start">
      <CandidateListPanel selectedCandidateId={candidateId} />

      <div>
        {candidateId ? (
          <CandidateDetailPanel
            candidateId={candidateId}
            selectedSessionId={selectedSessionId}
            onSelectSession={setSelectedSessionId}
          />
        ) : (
          <div className="flex min-h-[420px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-slate-800 px-6 text-center text-sm text-slate-500">
            <UserRoundSearch className="h-8 w-8 text-slate-700" />
            <p>Detayları görüntülemek için soldan bir aday seçin.</p>
          </div>
        )}
      </div>

      <div>
        {candidateId && selectedSessionId ? (
          <InterviewDetailPanel sessionId={String(selectedSessionId)} />
        ) : (
          <div className="flex min-h-[420px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-slate-800 px-6 text-center text-sm text-slate-500">
            <Video className="h-8 w-8 text-slate-700" />
            <p>{candidateId ? 'Bu adayın mülakat oturumu yok.' : 'Bir mülakat görüntülemek için önce bir aday seçin.'}</p>
          </div>
        )}
      </div>
    </div>
  )
}
