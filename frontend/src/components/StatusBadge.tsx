import { statusBadgeClasses, statusLabel } from '../utils/interviewStatus'

export default function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBadgeClasses(status)}`}>
      {statusLabel(status)}
    </span>
  )
}
