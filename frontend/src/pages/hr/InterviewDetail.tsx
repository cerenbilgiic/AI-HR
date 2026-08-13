import { Link, useParams } from 'react-router-dom'
import InterviewDetailPanel from '../../components/InterviewDetailPanel'

export default function InterviewDetail() {
  const { sessionId } = useParams()
  if (!sessionId) return null

  return (
    <div>
      <p className="mb-4 text-xs text-slate-500">
        <Link to="/hr/candidates" className="hover:text-slate-300">
          Adaylar
        </Link>{' '}
        <span className="mx-1">›</span> Mülakat Detayı
      </p>
      <InterviewDetailPanel sessionId={sessionId} />
    </div>
  )
}
