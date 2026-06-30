import { useMemo } from "react";
import { format, startOfMonth, addMonths } from "date-fns";
import { tr } from "date-fns/locale";

/**
 * E-Sınıf — Öğrenci Ödevlerim "Line takvim" (Gantt tarzı zaman çizelgesi).
 * Her ödev, yapılabileceği tarih aralığı (availableFrom → dueDate) boyunca bir çubuk
 * olarak işaretlenir; üzerine gelince (native title) ödev adı + tarih aralığı görünür.
 * Çubuk rengi duruma göre: teslim=yeşil, süresi geçmiş=kırmızı, açık=indigo.
 */
const STATUS_BAR = {
  submitted: "bg-emerald-500",
  overdue: "bg-rose-500",
  open: "bg-indigo-500",
};
const STATUS_LABEL = { submitted: "Teslim edildi", overdue: "Süresi geçti", open: "Açık" };

export function AssignmentTimeline({ items = [] }) {
  const data = useMemo(() => {
    const rows = items
      .filter((a) => a.availableFrom && a.dueDate)
      .map((a) => ({ ...a, from: new Date(a.availableFrom), to: new Date(a.dueDate) }))
      .filter((a) => !Number.isNaN(a.from.getTime()) && !Number.isNaN(a.to.getTime()));
    if (!rows.length) return null;
    let min = rows[0].from.getTime();
    let max = rows[0].to.getTime();
    for (const r of rows) { min = Math.min(min, r.from.getTime()); max = Math.max(max, r.to.getTime()); }
    return { rows, min, max, span: Math.max(1, max - min) };
  }, [items]);

  if (!data) return null;
  const { rows, min, max, span } = data;
  const now = Date.now();
  const pct = (t) => Math.min(100, Math.max(0, ((t - min) / span) * 100));

  const ticks = [];
  let cur = startOfMonth(new Date(min));
  for (let i = 0; i < 36 && cur.getTime() <= max; i += 1) { ticks.push(cur); cur = addMonths(cur, 1); }

  const statusOf = (a) => (a.submitted ? "submitted" : a.to.getTime() < now ? "overdue" : "open");

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 overflow-x-auto">
      <div className="relative min-w-[560px]">
        {/* Ay etiketleri */}
        <div className="relative h-5 mb-1 border-b border-slate-100">
          {ticks.map((t) => (
            <span key={t.getTime()} className="absolute -translate-x-1/2 text-[10px] text-slate-400" style={{ left: `${pct(t.getTime())}%` }}>
              {format(t, "MMM yy", { locale: tr })}
            </span>
          ))}
        </div>
        {/* Bugün çizgisi */}
        {now >= min && now <= max && (
          <div className="absolute top-5 bottom-0 w-0.5 bg-indigo-300 z-10" style={{ left: `${pct(now)}%` }} title="Bugün" aria-hidden="true" />
        )}
        {/* Ödev çubukları */}
        <div className="space-y-1.5 pt-1">
          {rows.map((a) => {
            const left = pct(a.from.getTime());
            const width = Math.max(3, pct(a.to.getTime()) - left);
            const st = statusOf(a);
            return (
              <div key={a.id} className="relative h-6">
                <div className="absolute inset-y-1 left-0 right-0 bg-slate-50 rounded" aria-hidden="true" />
                <div
                  className={`absolute inset-y-0.5 rounded ${STATUS_BAR[st]} flex items-center px-1.5 overflow-hidden`}
                  style={{ left: `${left}%`, width: `${width}%` }}
                  title={`${a.title} · ${format(a.from, "d MMM", { locale: tr })} – ${format(a.to, "d MMM yyyy", { locale: tr })} · ${STATUS_LABEL[st]}`}
                >
                  <span className="text-[10px] font-medium text-white truncate">{a.title}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
