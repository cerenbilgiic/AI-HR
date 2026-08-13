import type { LucideIcon } from 'lucide-react'

// Delta is a month-over-month percentage the caller has already computed —
// null means "no prior-month baseline to compare against" (avoids showing a
// misleading/infinite percentage), not "zero change".
export default function StatCard({
  icon: Icon,
  iconClassName = 'bg-indigo-500/15 text-indigo-400',
  label,
  value,
  deltaPct,
}: {
  icon: LucideIcon
  iconClassName?: string
  label: string
  value: string | number
  deltaPct: number | null
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 shadow-sm">
      <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${iconClassName}`}>
        <Icon className="h-5 w-5" />
      </span>
      <p className="mt-3 text-2xl font-semibold text-slate-100">{value}</p>
      <p className="text-xs text-slate-400">{label}</p>
      {deltaPct != null && (
        <p className={`mt-2 text-xs font-medium ${deltaPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
          {deltaPct >= 0 ? '↑' : '↓'} %{Math.abs(Math.round(deltaPct))} geçen aya göre
        </p>
      )}
    </div>
  )
}
