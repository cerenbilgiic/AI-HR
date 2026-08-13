import { Download } from 'lucide-react'
import { useEffect, useState } from 'react'
import apiClient from '../api/client'
import type { Candidate, InterviewReport, InterviewSession, Job } from '../types'
import HrStatusBadge from './HrStatusBadge'
import RecommendationBadge, { RECOMMENDATION_LABELS } from './RecommendationBadge'
import { COMPETENCY_LABELS } from '../utils/competency'

const VIOLATION_LABELS: Record<string, string> = {
  tab_switch: 'Sekme/uygulama değişikliği',
  fullscreen_exit: 'Tam ekrandan çıkış',
  copy_attempt: 'Kopyalama denemesi',
  paste_attempt: 'Yapıştırma denemesi',
  right_click: 'Sağ tık denemesi',
}

const TABS = [
  { key: 'review', label: 'İnceleme' },
  { key: 'transcript', label: 'Döküm' },
  { key: 'evaluation', label: 'AI Değerlendirmesi' },
  { key: 'report', label: 'Rapor' },
] as const
type TabKey = (typeof TABS)[number]['key']

function ScoreBar({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm">
        <span className="text-slate-300">{label}</span>
        <span className="font-medium text-slate-100">{value}</span>
      </div>
      <div className="h-2 w-full rounded-full bg-slate-800">
        <div className="h-2 rounded-full bg-indigo-500" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
    </div>
  )
}

function answerText(answer: { transcript: string | null; recording_start_offset_seconds: number | null } | null): string {
  if (answer?.transcript) return answer.transcript
  if (answer?.recording_start_offset_seconds != null) {
    return 'Sesli yanıt verildi ancak transkript oluşturulamadı.'
  }
  return 'Bu soru boş bırakıldı.'
}

function toApiPath(urlFromBackend: string): string {
  return urlFromBackend.startsWith('/api/v1') ? urlFromBackend.slice('/api/v1'.length) : urlFromBackend
}

// Used both standalone (pages/hr/InterviewDetail.tsx, full width) and as
// CandidateWorkspace.tsx's third column (narrower) — the tab split exists
// specifically so all of this fits in a workspace column without an
// enormous amount of vertical scrolling.
export default function InterviewDetailPanel({ sessionId }: { sessionId: string }) {
  const [activeTab, setActiveTab] = useState<TabKey>('review')
  const [session, setSession] = useState<InterviewSession | null>(null)
  const [candidate, setCandidate] = useState<Candidate | null>(null)
  const [job, setJob] = useState<Job | null>(null)
  const [report, setReport] = useState<InterviewReport | null>(null)
  const [reportChecked, setReportChecked] = useState(false)
  const [videoObjectUrl, setVideoObjectUrl] = useState<string | null>(null)
  const [videoError, setVideoError] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savingDecision, setSavingDecision] = useState(false)
  const [decisionError, setDecisionError] = useState<string | null>(null)
  const [pdfDownloading, setPdfDownloading] = useState(false)
  const [pdfError, setPdfError] = useState<string | null>(null)

  useEffect(() => {
    setActiveTab('review')
    setSession(null)
    setReport(null)
    setReportChecked(false)
    setVideoObjectUrl(null)
    setVideoError(false)
    setError(null)

    apiClient
      .get<InterviewSession>(`/interviews/${sessionId}`)
      .then((res) => {
        setSession(res.data)
        return Promise.all([
          apiClient.get<Candidate>(`/candidates/${res.data.candidate_id}`),
          apiClient.get<Job>(`/jobs/${res.data.job_id}`),
        ])
      })
      .then(([candidateRes, jobRes]) => {
        setCandidate(candidateRes.data)
        setJob(jobRes.data)
      })
      .catch(() => setError('Mülakat bilgileri yüklenemedi.'))

    apiClient
      .get<InterviewReport>(`/reports/session/${sessionId}`)
      .then((res) => setReport(res.data))
      .catch(() => setReport(null))
      .finally(() => setReportChecked(true))
  }, [sessionId])

  useEffect(() => {
    if (!session?.recording_path) return
    let cancelled = false
    let createdUrl: string | null = null
    apiClient
      .get<{ url: string }>(`/interviews/${sessionId}/recording-url`)
      .then((res) => apiClient.get(toApiPath(res.data.url), { responseType: 'blob' }))
      .then((res) => {
        if (cancelled) return
        createdUrl = URL.createObjectURL(res.data)
        setVideoObjectUrl(createdUrl)
      })
      .catch(() => setVideoError(true))
    return () => {
      cancelled = true
      if (createdUrl) URL.revokeObjectURL(createdUrl)
    }
  }, [sessionId, session?.recording_path])

  async function setFinalDecision(hrDecision: string) {
    setSavingDecision(true)
    setDecisionError(null)
    try {
      const { data } = await apiClient.put<InterviewReport>(`/reports/session/${sessionId}`, {
        hr_decision: hrDecision,
      })
      setReport(data)
    } catch {
      setDecisionError('Nihai karar kaydedilemedi. Lütfen tekrar deneyin.')
    } finally {
      setSavingDecision(false)
    }
  }

  async function handleDownloadPdf() {
    if (!candidate) return
    setPdfDownloading(true)
    setPdfError(null)
    try {
      const res = await apiClient.get(`/reports/session/${sessionId}/pdf`, { responseType: 'blob' })
      const blobUrl = URL.createObjectURL(res.data)
      const link = document.createElement('a')
      link.href = blobUrl
      link.download = `${candidate.full_name.replace(/\s+/g, '_')}_interview_report.pdf`
      link.click()
      URL.revokeObjectURL(blobUrl)
    } catch {
      setPdfError('PDF rapor indirilemedi.')
    } finally {
      setPdfDownloading(false)
    }
  }

  if (error) return <p className="text-sm font-medium text-rose-400">{error}</p>
  if (!session || !candidate) return <p className="text-sm text-slate-500">Mülakat bilgileri yükleniyor...</p>

  const answeredCount = session.questions.filter((q) => q.answer?.transcript).length

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-1 border-b border-slate-800">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'review' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-100">{candidate.full_name}</h2>
            <p className="text-sm text-slate-500">{job?.title ?? 'Bilinmeyen pozisyon'}</p>
            {/* Always 2 columns, not viewport-responsive — this panel renders
                both full-width (standalone page) and narrow (third column of
                CandidateWorkspace.tsx), and sm:/md: breakpoints key off the
                viewport, not this container, so a wider step there would
                force too many columns into the narrow case and overlap. */}
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs uppercase text-slate-500">Mülakat No</dt>
                <dd className="text-slate-200">#{session.id}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-slate-500">Durum</dt>
                <dd className="mt-0.5"><HrStatusBadge status={session.status} /></dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-slate-500">Süre</dt>
                <dd className="text-slate-200">
                  {session.duration_minutes != null ? `${session.duration_minutes} dk` : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-slate-500">Cevaplanan</dt>
                <dd className="text-slate-200">
                  {answeredCount} / {session.questions.length}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-slate-500">Genel AI Puanı</dt>
                <dd className="text-slate-200">{session.overall_score != null ? `${session.overall_score}/100` : '—'}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-slate-500">Tavsiye</dt>
                <dd className="mt-0.5">
                  {session.recommendation ? <RecommendationBadge recommendation={session.recommendation} /> : '—'}
                </dd>
              </div>
            </dl>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 shadow-sm">
            <h3 className="mb-3 text-sm font-medium text-slate-100">Video Kaydı</h3>
            {session.recording_path ? (
              videoObjectUrl ? (
                <video controls className="w-full rounded bg-black" src={videoObjectUrl} />
              ) : videoError ? (
                <p className="text-sm font-medium text-rose-400">Video kaydı yüklenemedi.</p>
              ) : (
                <p className="text-sm text-slate-500">Video yükleniyor...</p>
              )
            ) : (
              <p className="text-sm text-slate-500">Bu mülakat için video kaydı bulunmuyor.</p>
            )}
          </div>

          {(session.risk_score != null || (session.violation_counts && Object.keys(session.violation_counts).length > 0)) && (
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 shadow-sm">
              <h3 className="mb-3 text-sm font-medium text-slate-100">Bütünlük</h3>
              <div className="mb-3 flex items-center gap-2">
                <span className="text-2xl font-semibold text-slate-100">{session.risk_score ?? 0}</span>
                <span className="text-sm text-slate-500">/ 100 risk skoru</span>
              </div>
              {session.violation_counts && Object.keys(session.violation_counts).length > 0 ? (
                <ul className="space-y-1 text-sm text-slate-300">
                  {Object.entries(session.violation_counts).map(([type, count]) => (
                    <li key={type}>
                      <span className="font-medium text-slate-100">{VIOLATION_LABELS[type] ?? type}:</span> {count}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-500">Herhangi bir ihlal kaydedilmedi.</p>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === 'transcript' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 shadow-sm">
            <h3 className="mb-4 text-sm font-medium text-slate-100">Sorular ve Cevaplar</h3>
            <div className="space-y-5">
              {session.questions
                .slice()
                .sort((a, b) => a.order - b.order)
                .map((q, i) => (
                  <div key={q.id} className="border-b border-slate-800 pb-4 last:border-0 last:pb-0">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Soru {i + 1}</p>
                    <p className="mt-1 font-medium text-slate-100">{q.text}</p>
                    <p className="mt-2 text-sm text-slate-300">
                      <span className="font-medium text-slate-100">Cevap: </span>
                      {answerText(q.answer)}
                    </p>
                    {q.answer?.evaluation ? (
                      <div className="mt-2 rounded bg-slate-800 p-2 text-xs text-slate-300">
                        <p>
                          <span className="font-medium text-slate-100">AI Puanı: </span>
                          {q.answer.evaluation.score ?? '—'} &nbsp;
                          <span className="font-medium text-slate-100">Yetkinlik: </span>
                          {q.answer.evaluation.competency ?? '—'}
                        </p>
                        {q.answer.evaluation.feedback && (
                          <p className="mt-1">
                            <span className="font-medium text-slate-100">Geri Bildirim: </span>
                            {q.answer.evaluation.feedback}
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-slate-500">Ayrı olarak değerlendirilmedi.</p>
                    )}
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'evaluation' && (
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 shadow-sm">
          <h3 className="mb-4 text-sm font-medium text-slate-100">AI Puanı</h3>
          {!reportChecked ? (
            <p className="text-sm text-slate-500">Puanlar yükleniyor...</p>
          ) : report?.competency_scores ? (
            <>
              <p className="mb-4 text-3xl font-semibold text-slate-100">
                {report.overall_score} <span className="text-base font-normal text-slate-500">/ 100</span>
              </p>
              {/* Same reasoning as the header dl above — no viewport-based
                  column bump, this panel can render in a narrow container. */}
              <div className="grid grid-cols-1 gap-4">
                {Object.entries(report.competency_scores).map(([key, value]) => (
                  <ScoreBar key={key} label={COMPETENCY_LABELS[key] ?? key} value={value} />
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-500">AI mülakat raporu henüz oluşturulmadı.</p>
          )}
        </div>
      )}

      {activeTab === 'report' && (
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-medium text-slate-100">Nihai AI Raporu</h3>
            {report && (
              <button
                type="button"
                onClick={() => void handleDownloadPdf()}
                disabled={pdfDownloading}
                className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-50"
              >
                <Download className="h-3.5 w-3.5" />
                {pdfDownloading ? 'Hazırlanıyor…' : 'PDF İndir'}
              </button>
            )}
          </div>
          {pdfError && <p className="mb-3 text-xs font-medium text-rose-400">{pdfError}</p>}
          {!reportChecked ? (
            <p className="text-sm text-slate-500">Rapor yükleniyor...</p>
          ) : report ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                {report.overall_score != null && (
                  <span className="text-2xl font-semibold text-slate-100">{report.overall_score}/100</span>
                )}
                {report.recommendation && (
                  <span className="flex items-center gap-1.5 text-sm text-slate-400">
                    AI Önerisi: <RecommendationBadge recommendation={report.recommendation} />
                  </span>
                )}
              </div>

              {/* HR's own call — deliberately independent of report.recommendation
                  above (the AI's suggestion). Starts with nothing selected even
                  when the AI already suggested something, so the AI can only
                  ever suggest, never pre-mark a decision on HR's behalf. Only
                  once this is set does the candidate get to see any result —
                  see utils/interviewStatus.ts's candidateFacingStatus. */}
              <div>
                <h4 className="mb-1 text-sm font-medium text-slate-100">Nihai Karar (İK)</h4>
                <div className="flex flex-wrap gap-2">
                  {(['recommended', 'maybe', 'not_recommended'] as const).map((option) => (
                    <button
                      key={option}
                      type="button"
                      disabled={savingDecision}
                      onClick={() => void setFinalDecision(option)}
                      className={`rounded-full px-3 py-1 text-xs font-medium disabled:opacity-50 ${
                        report.hr_decision === option
                          ? 'bg-indigo-600 text-white'
                          : 'border border-slate-700 text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      {RECOMMENDATION_LABELS[option]}
                    </button>
                  ))}
                </div>
                {decisionError && <p className="mt-2 text-xs font-medium text-rose-400">{decisionError}</p>}
              </div>
              {report.strengths && report.strengths.length > 0 && (
                <div>
                  <h4 className="mb-1 text-sm font-medium text-slate-100">Güçlü Yönler</h4>
                  <ul className="list-inside list-disc text-sm text-slate-300">
                    {report.strengths.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}
              {report.development_areas && report.development_areas.length > 0 && (
                <div>
                  <h4 className="mb-1 text-sm font-medium text-slate-100">Gelişim Alanları</h4>
                  <ul className="list-inside list-disc text-sm text-slate-300">
                    {report.development_areas.map((d, i) => (
                      <li key={i}>{d}</li>
                    ))}
                  </ul>
                </div>
              )}
              {report.summary && (
                <div>
                  <h4 className="mb-1 text-sm font-medium text-slate-100">Özet</h4>
                  <p className="text-sm text-slate-300">{report.summary}</p>
                </div>
              )}
              {report.evidence && report.evidence.length > 0 && (
                <div>
                  <h4 className="mb-1 text-sm font-medium text-slate-100">Kanıtlar</h4>
                  <ul className="space-y-1 text-sm text-slate-300">
                    {report.evidence.map((e, i) => (
                      <li key={i}>
                        <span className="font-medium capitalize text-slate-100">
                          {(COMPETENCY_LABELS[e.competency] ?? e.competency).toString()}:{' '}
                        </span>
                        "{e.evidence}"
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-slate-500">AI mülakat raporu henüz oluşturulmadı.</p>
          )}
        </div>
      )}
    </div>
  )
}
