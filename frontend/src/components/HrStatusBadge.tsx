import { statusBadgeClasses, statusLabel } from '../utils/hrStatus'

export default function HrStatusBadge({ status }: { status: string | undefined }) {
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBadgeClasses(status)}`}>
      {statusLabel(status)}
    </span>
  )
}
