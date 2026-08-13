export interface DonutSegment {
  label: string
  value: number
  // A Tailwind text-color utility (e.g. "text-emerald-400") — driving both
  // the ring's stroke and the legend dot's fill via currentColor, so each
  // segment only needs one class instead of a separate stroke/bg pair.
  colorClass: string
}

const RADIUS = 40
const STROKE = 12
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

// Hand-rolled SVG ring (stacked stroke-dasharray arcs) — no charting library
// needed for a single donut, consistent with this project's minimal-
// dependency pattern elsewhere (openpyxl over pandas, pypdf over heavier
// PDF libs).
export default function DonutChart({
  segments,
  centerLabel = 'Toplam',
}: {
  segments: DonutSegment[]
  centerLabel?: string
}) {
  const total = segments.reduce((sum, s) => sum + s.value, 0)

  let cursor = 0
  const arcs = segments
    .filter((s) => s.value > 0)
    .map((s) => {
      const length = total > 0 ? (s.value / total) * CIRCUMFERENCE : 0
      const arc = { ...s, length, offset: cursor }
      cursor += length
      return arc
    })

  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row">
      <div className="relative h-40 w-40 flex-shrink-0">
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
          <circle cx="50" cy="50" r={RADIUS} fill="none" strokeWidth={STROKE} className="stroke-slate-800" />
          {arcs.map((arc) => (
            <circle
              key={arc.label}
              cx="50"
              cy="50"
              r={RADIUS}
              fill="none"
              strokeWidth={STROKE}
              strokeLinecap="round"
              strokeDasharray={`${arc.length} ${CIRCUMFERENCE - arc.length}`}
              strokeDashoffset={-arc.offset}
              className={`stroke-current ${arc.colorClass}`}
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold text-slate-100">{total}</span>
          <span className="text-xs text-slate-500">{centerLabel}</span>
        </div>
      </div>
      <ul className="w-full space-y-2 text-sm">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 whitespace-nowrap text-slate-300">
              <span className={`h-2.5 w-2.5 flex-shrink-0 rounded-full bg-current ${s.colorClass}`} />
              {s.label}
            </span>
            <span className="text-slate-400">
              {s.value}
              {total > 0 && <span className="text-slate-500"> (%{Math.round((s.value / total) * 100)})</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
