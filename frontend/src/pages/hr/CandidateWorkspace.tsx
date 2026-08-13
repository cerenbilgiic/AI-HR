import { Eye, Upload } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import apiClient from '../../api/client'
import CandidateDetailPanel from '../../components/CandidateDetailPanel'
import HrStatusBadge from '../../components/HrStatusBadge'
import InterviewDetailPanel from '../../components/InterviewDetailPanel'
import Pagination from '../../components/Pagination'
import RecommendationBadge from '../../components/RecommendationBadge'
import { pipelineStatus } from '../../utils/hrStatus'
import type { Candidate, InterviewSession, InvitationOut, Job } from '../../types'

const PAGE_SIZE = 10
type SortKey = 'date' | 'score'

function latestSessionFor(candidateId: number, sessions: InterviewSession[]): InterviewSession | undefined {
  return sessions
    .filter((s) => s.candidate_id === candidateId)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
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
  const [invitingIds, setInvitingIds] = useState<Set<number>>(new Set())
  const [lastCredentials, setLastCredentials] = useState<InvitationOut | InvitationOut[] | null>(null)
  const [bulkSending, setBulkSending] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)

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
      result = result.filter((r) => r.session?.recommendation === recommendationFilter)
    }
    if (minScore.trim()) {
      const min = Number(minScore)
      result = result.filter((r) => r.session?.overall_score != null && r.session.overall_score >= min)
    }
    if (sortKey) {
      result = [...result].sort((a, b) => {
        const av = sortKey === 'score' ? (a.session?.overall_score ?? -1) : new Date(a.session?.created_at ?? 0).getTime()
        const bv = sortKey === 'score' ? (b.session?.overall_score ?? -1) : new Date(b.session?.created_at ?? 0).getTime()
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

  async function handleInvite(candidateId: number) {
    setInvitingIds((prev) => new Set(prev).add(candidateId))
    setInviteError(null)
    try {
      const { data } = await apiClient.post<InvitationOut>(`/candidates/${candidateId}/invite`)
      setLastCredentials(data)
      await loadData()
    } catch {
      setInviteError('Davet gönderilemedi. Lütfen tekrar deneyin.')
    } finally {
      setInvitingIds((prev) => {
        const next = new Set(prev)
        next.delete(candidateId)
        return next
      })
    }
  }

  async function handleBulkInvite() {
    setBulkSending(true)
    setInviteError(null)
    try {
      const { data } = await apiClient.post<InvitationOut[]>('/candidates/invite-bulk', Array.from(selected))
      setLastCredentials(data)
      setSelected(new Set())
      await loadData()
    } catch {
      setInviteError('Toplu davet gönderilemedi. Lütfen tekrar deneyin.')
    } finally {
      setBulkSending(false)
    }
  }

  function copyText(text: string) {
    void navigator.clipboard?.writeText(text)
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
              onClick={() => void handleBulkInvite()}
              disabled={bulkSending}
              className="rounded bg-indigo-600 px-2 py-1 font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {bulkSending ? 'Gönderiliyor…' : 'Davet Gönder'}
            </button>
          </div>
        )}
        {inviteError && <p className="text-xs font-medium text-rose-400">{inviteError}</p>}
        {lastCredentials && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="font-medium text-amber-300">Giriş bilgileri oluşturuldu — şimdi iletin.</span>
              <button onClick={() => setLastCredentials(null)} className="text-slate-400 hover:text-slate-200">
                ✕
              </button>
            </div>
            <div className="space-y-1.5">
              {(Array.isArray(lastCredentials) ? lastCredentials : [lastCredentials]).map((cred) => (
                <div
                  key={cred.candidate_id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-700 bg-slate-800 px-2 py-1.5"
                >
                  <span className="text-slate-300">
                    <span className="font-medium text-slate-100">
                      {candidateById.get(cred.candidate_id)?.full_name ?? `Aday #${cred.candidate_id}`}:
                    </span>{' '}
                    {cred.login_email} / {cred.password}
                  </span>
                  <button
                    onClick={() => copyText(`E-posta: ${cred.login_email}\nŞifre: ${cred.password}`)}
                    className="rounded border border-slate-700 px-1.5 py-0.5 text-[11px] font-medium text-slate-200 hover:bg-slate-700"
                  >
                    Kopyala
                  </button>
                </div>
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
              checked={selected.size > 0 && pageRows.every((r) => selected.has(r.candidate.id))}
              onChange={(e) =>
                setSelected(e.target.checked ? new Set(pageRows.map((r) => r.candidate.id)) : new Set())
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
              className="accent-indigo-500"
              checked={selected.has(candidate.id)}
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
              {session?.recommendation && (
                <div className="mt-1">
                  <RecommendationBadge recommendation={session.recommendation} />
                </div>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  void handleInvite(candidate.id)
                }}
                disabled={invitingIds.has(candidate.id)}
                className="mt-1.5 text-[11px] font-medium text-indigo-400 hover:text-indigo-300 disabled:opacity-50"
              >
                {invitingIds.has(candidate.id) ? 'Gönderiliyor…' : candidate.invited_at ? 'Yeniden davet gönder' : 'Davet gönder'}
              </button>
            </div>
            <Eye className="h-4 w-4 flex-shrink-0 text-slate-600" />
          </div>
        ))}
      </div>

      <div className="border-t border-slate-800 p-2">
        <Pagination page={page} totalPages={totalPages} onChange={setPage} />
      </div>
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
          <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-slate-800 text-sm text-slate-500">
            Detayları görüntülemek için bir aday seçin.
          </div>
        )}
      </div>

      <div>
        {candidateId && selectedSessionId ? (
          <InterviewDetailPanel sessionId={String(selectedSessionId)} />
        ) : (
          <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-slate-800 text-sm text-slate-500">
            {candidateId ? 'Bu adayın mülakat oturumu yok.' : 'Bir mülakat görüntülemek için önce bir aday seçin.'}
          </div>
        )}
      </div>
    </div>
  )
}
