import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { candidateApiClient } from '../../api/client'
import StatusBadge from '../../components/StatusBadge'
import { formatDate } from '../../utils/interviewStatus'
import type { InterviewSession, Job } from '../../types'

export default function InterviewHistoryDetail() {
  const { candidateId, sessionId } = useParams()
  const [session, setSession] = useState<InterviewSession | null>(null)
  const [job, setJob] = useState<Job | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    candidateApiClient
      .get<InterviewSession>(`/interviews/${sessionId}`)
      .then((res) => {
        setSession(res.data)
        return candidateApiClient.get<Job>(`/jobs/${res.data.job_id}`)
      })
      .then((res) => setJob(res.data))
      .catch(() => setError('Mülakat detayları yüklenemedi. Lütfen tekrar deneyin.'))
  }, [sessionId])

  if (error) return <p className="text-sm text-red-600">{error}</p>
  if (!session || !job) return <p className="text-sm text-gray-500">Yükleniyor...</p>

  return (
    <div>
      <h2 className="mb-4 text-xl font-semibold text-gray-900">{job.title} Mülakatı</h2>
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-xs uppercase text-gray-500">Mülakat Tarihi</dt>
            <dd className="text-gray-900">{formatDate(session.created_at)}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-gray-500">Durum</dt>
            <dd>
              <StatusBadge status={session.status} />
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-gray-500">Soru Sayısı</dt>
            <dd className="text-gray-900">{session.questions.length}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-gray-500">Tamamlanma Süresi</dt>
            <dd className="text-gray-900">{session.duration_minutes ?? '—'} dk</dd>
          </div>
        </dl>

        <div className="mt-6 border-t border-gray-100 pt-4">
          <h3 className="mb-1 text-sm font-medium text-gray-900">Mülakat Özeti</h3>
          <p className="text-sm text-gray-600">
            Mülakatınız başarıyla tamamlanmış ve değerlendirmeye gönderilmiştir.
          </p>
        </div>

        {session.status === 'completed' && (
          <Link
            to={`/interview/${candidateId}/home/results/${session.id}`}
            className="mt-4 inline-block rounded bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-700"
          >
            Sonucu Görüntüle
          </Link>
        )}
      </div>
    </div>
  )
}
