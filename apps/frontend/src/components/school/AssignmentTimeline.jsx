import { useMemo, useState } from "react";
import { startOfDay, addDays, format } from "date-fns";
import { tr } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * E-Sınıf — Ödev "Line takvim" (7 günlük pencere, Gantt tarzı).
 * Açılışta/sayfa yenilemede BUGÜNDEN itibaren 7 gün gösterilir; sol/sağ oklarla
 * 7''şer gün ileri/geri gezinilir (offset state — yenilemede sıfırlanır → tekrar bugün).
 * Her ödev availableFrom→dueDate aralığında bir çubuk; pencereye kırpılır; üzerine
 * gelince (native title) ödev adı + tarih + durum görünür.
 */
const STATUS_BAR = { submitted: "bg-emerald-500", overdue: "bg-rose-500", open: "bg-indigo-500" };
const STATUS_LABEL = { submitted: "Teslim edildi", overdue: "Süresi geçti", open: "Açık" };
const DAYS = 7;

export function AssignmentTimeline({ items = [] }) {
  const [offset, setOffset] = useState(0); // 0 = bugünden itibaren 7 gün

  const windowStart = useMemo(() => addDays(startOfDay(new Date()), offset * DAYS), [offset]);
  const startMs = windowStart.getTime();
  const endMs = addDays(windowStart, DAYS).getTime();
  const spanMs = endMs - startMs;
  const now = Date.now();

  const rows = useMemo(() => {
    return items
      .filter((a) => a.availableFrom && a.dueDate)
      .map((a) => ({ ...a, from: new Date(a.availableFrom).getTime(), to: new Date(a.dueDate).getTime() }))
      .filter((a) => !Number.isNaN(a.from) && !Number.isNaN(a.to) && a.from < endMs && a.to >= startMs)
      .sort((a, b) => a.to - b.to);
  }, [items, startMs, endMs]);

  const pct = (t) => Math.min(100, Math.max(0, ((t - startMs) / spanMs) * 100));
  const ticks = Array.from({ length: DAYS }, (_, i) => addDays(windowStart, i));
  const statusOf = (a) => (a.submitted ? "submitted" : a.to < now ? "overdue" : "open");
  const rangeLabel = `${format(windowStart, "d MMM", { locale: tr })} – ${format(addDays(windowStart, DAYS - 1), "d MMM yyyy", { locale: tr })}`;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      {/* Pencere navigasyonu */}
      <div className="flex items-center justify-between mb-3">
        <button type="button" onClick={() => setOffset((o) => o - 1)} aria-label="Önceki 7 gün"
          className="inline-flex items-center justify-center h-8 w-8 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"><ChevronLeft className="w-4 h-4" /></button>
        <span className="text-sm font-medium text-slate-700">{rangeLabel}</span>
        <button type="button" onClick={() => setOffset((o) => o + 1)} aria-label="Sonraki 7 gün"
          className="inline-flex items-center justify-center h-8 w-8 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"><ChevronRight className="w-4 h-4" /></button>
      </div>

      {/* Gün başlıkları */}
      <div className="grid grid-cols-7">
        {ticks.map((t) => (
          <div key={t.getTime()} className="text-center text-[10px] leading-tight text-slate-400 border-l border-slate-100 first:border-l-0 pb-1">
            <div className="font-semibold text-slate-500">{format(t, "d", { locale: tr })}</div>
            <div>{format(t, "EEE", { locale: tr })}</div>
          </div>
        ))}
      </div>

      {/* Çubuk alanı + gün ızgarası + bugün çizgisi */}
      <div className="relative pt-1">
        <div className="absolute inset-0 grid grid-cols-7 pointer-events-none" aria-hidden="true">
          {ticks.map((t) => <div key={t.getTime()} className="border-l border-slate-100 first:border-l-0" />)}
        </div>
        {now >= startMs && now < endMs && (
          <div className="absolute top-0 bottom-0 w-0.5 bg-indigo-400 z-10" style={{ left: `${pct(now)}%` }} title="Bugün" aria-hidden="true" />
        )}
        {rows.length === 0 ? (
          <p className="text-center text-xs text-slate-400 py-6">Bu 7 günde gösterilecek ödev yok.</p>
        ) : (
          <div className="relative space-y-1.5">
            {rows.map((a) => {
              const left = pct(a.from);
              const width = Math.max(3, pct(a.to) - left);
              const st = statusOf(a);
              return (
                <div key={a.id} className="relative h-6">
                  <div className="absolute inset-y-1 left-0 right-0 bg-slate-50 rounded" aria-hidden="true" />
                  <div
                    className={`absolute inset-y-0.5 rounded ${STATUS_BAR[st]} flex items-center px-1.5 overflow-hidden`}
                    style={{ left: `${left}%`, width: `${width}%` }}
                    title={`${a.title} · ${format(new Date(a.from), "d MMM", { locale: tr })} – ${format(new Date(a.to), "d MMM yyyy", { locale: tr })} · ${STATUS_LABEL[st]}`}
                  >
                    <span className="text-[10px] font-medium text-white truncate">{a.title}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
