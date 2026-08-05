import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import apiClient from '../../api/client'
import type { InterviewReport as InterviewReportType } from '../../types'

export default function InterviewReport() {
  const { sessionId } = useParams()
  const [report, setReport] = useState<InterviewReportType | null>(null)

  useEffect(() => {
    apiClient.get<InterviewReportType>(`/reports/session/${sessionId}`).then((res) => setReport(res.data))
  }, [sessionId])

  if (!report) return <p className="text-sm text-gray-500">Loading...</p>

  return (
    <div>
      <h2 className="mb-4 text-xl font-semibold text-gray-900">Interview Report</h2>
      <p className="mb-2 text-sm font-medium text-gray-900">Recommendation: {report.recommendation ?? 'Pending'}</p>
      <p className="mb-6 text-sm text-gray-600">{report.summary}</p>

      {report.scores && (
        <dl className="grid grid-cols-2 gap-4 rounded border border-gray-200 bg-white p-4">
          {Object.entries(report.scores).map(([key, value]) => (
            <div key={key}>
              <dt className="text-xs uppercase text-gray-500">{key.replaceAll('_', ' ')}</dt>
              <dd className="text-sm font-medium text-gray-900">{value ?? '—'}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}
