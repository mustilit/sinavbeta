import { ChevronLeft, ChevronRight } from "lucide-react";

const DEFAULT_PAGE_SIZES = [10, 25, 50, 100];

/**
 * Evrensel sayfalama bileşeni.
 *
 * Props:
 *   page             – mevcut sayfa (1-tabanlı)
 *   pageSize         – sayfa başına satır sayısı
 *   total            – toplam öğe sayısı
 *   onPageChange     – (newPage: number) => void
 *   onPageSizeChange – (newSize: number) => void  (isteğe bağlı; yoksa dropdown gizlenir)
 *   pageSizeOptions  – varsayılan [10, 25, 50, 100]
 */
export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = DEFAULT_PAGE_SIZES,
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1 && !onPageSizeChange) return null;

  const pageNumbers = Array.from({ length: totalPages }, (_, i) => i + 1)
    .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
    .reduce((acc, p, idx, arr) => {
      if (idx > 0 && p - arr[idx - 1] > 1) acc.push("...");
      acc.push(p);
      return acc;
    }, []);

  const from = Math.min((page - 1) * pageSize + 1, total);
  const to   = Math.min(page * pageSize, total);

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 text-sm flex-wrap gap-2">
      <div className="flex items-center gap-3 text-slate-500">
        <span>{total === 0 ? "0 kayıt" : `${from}–${to} / ${total}`}</span>
        {onPageSizeChange && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-400">Sayfa başına:</span>
            <select
              value={pageSize}
              onChange={(e) => { onPageSizeChange(Number(e.target.value)); onPageChange(1); }}
              className="text-xs border border-slate-200 rounded-md px-1.5 py-1 bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {pageSizeOptions.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <button onClick={() => onPageChange(1)} disabled={page === 1}
            className="px-2 py-1 rounded-md text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed">«</button>
          <button onClick={() => onPageChange(Math.max(1, page - 1))} disabled={page === 1}
            className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed">
            <ChevronLeft className="w-4 h-4" />
          </button>
          {pageNumbers.map((p, idx) =>
            p === "..." ? (
              <span key={`e${idx}`} className="px-2 py-1 text-slate-400">…</span>
            ) : (
              <button key={p} onClick={() => onPageChange(p)}
                className={`w-8 h-8 rounded-md text-sm font-medium transition-colors ${page === p ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}>
                {p}
              </button>
            )
          )}
          <button onClick={() => onPageChange(Math.min(totalPages, page + 1))} disabled={page === totalPages}
            className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed">
            <ChevronRight className="w-4 h-4" />
          </button>
          <button onClick={() => onPageChange(totalPages)} disabled={page === totalPages}
            className="px-2 py-1 rounded-md text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed">»</button>
        </div>
      )}
    </div>
  );
}
