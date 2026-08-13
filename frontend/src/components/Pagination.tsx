import { ChevronLeft, ChevronRight } from 'lucide-react'

// Collapses a long page range to first/last + a window around the current
// page (e.g. "1 2 … 5 6 7 … 12"), matching the compact style most table
// paginators use instead of listing every page.
function pageNumbers(current: number, total: number): (number | 'ellipsis')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const keep = new Set([1, 2, total - 1, total, current - 1, current, current + 1])
  const filtered = [...keep].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b)
  const result: (number | 'ellipsis')[] = []
  filtered.forEach((p, i) => {
    if (i > 0 && p - filtered[i - 1] > 1) result.push('ellipsis')
    result.push(p)
  })
  return result
}

export default function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number
  totalPages: number
  onChange: (page: number) => void
}) {
  if (totalPages <= 1) return null

  return (
    <div className="flex items-center justify-center gap-1 pt-3">
      <button
        type="button"
        onClick={() => onChange(Math.max(1, page - 1))}
        disabled={page === 1}
        className="flex h-7 w-7 items-center justify-center rounded text-slate-400 hover:bg-slate-800 hover:text-slate-100 disabled:opacity-30"
        aria-label="Önceki sayfa"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      {pageNumbers(page, totalPages).map((p, i) =>
        p === 'ellipsis' ? (
          <span key={`ellipsis-${i}`} className="px-1 text-sm text-slate-600">
            …
          </span>
        ) : (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            className={`flex h-7 w-7 items-center justify-center rounded text-sm font-medium ${
              p === page ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
            }`}
          >
            {p}
          </button>
        ),
      )}
      <button
        type="button"
        onClick={() => onChange(Math.min(totalPages, page + 1))}
        disabled={page === totalPages}
        className="flex h-7 w-7 items-center justify-center rounded text-slate-400 hover:bg-slate-800 hover:text-slate-100 disabled:opacity-30"
        aria-label="Sonraki sayfa"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  )
}
