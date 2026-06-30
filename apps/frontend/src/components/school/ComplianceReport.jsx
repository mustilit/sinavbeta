import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { school as schoolApi } from "@/api/dalClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CheckCircle2, Clock, XCircle, Timer, AlertTriangle, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { tr } from "date-fns/locale";

/**
 * E-Sınıf — Ödev uyum raporu (hiyerarşik, rol-bilinçli). Hem StudentReports hem
 * SchoolReports'ta kullanılır; backend `/school/reports/compliance` aktörün rolüne
 * göre kapsamı belirler (öğrenci self / sınıf öğretmeni / zümre / seviye / şube / okul).
 * Statü + süre kartları; karta tıklayınca o kategorinin listesi modalda gösterilir.
 */
const STATUS_CARDS = [
  { bucket: "onTime", label: "Zamanında Teslim", Icon: CheckCircle2, cls: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200 hover:bg-emerald-100" },
  { bucket: "late", label: "Geç Teslim", Icon: Clock, cls: "text-amber-700", bg: "bg-amber-50 border-amber-200 hover:bg-amber-100" },
  { bucket: "notSubmitted", label: "Teslim Edilmeyen", Icon: XCircle, cls: "text-rose-700", bg: "bg-rose-50 border-rose-200 hover:bg-rose-100" },
];
const DURATION_CARDS = [
  { bucket: "withinTime", label: "Süre İçinde Bitirilen", Icon: Timer, cls: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200 hover:bg-emerald-100" },
  { bucket: "overflow", label: "Süre Aşımı", Icon: AlertTriangle, cls: "text-rose-700", bg: "bg-rose-50 border-rose-200 hover:bg-rose-100" },
];
const BUCKET_LABEL = {
  onTime: "Zamanında Teslim", late: "Geç Teslim", notSubmitted: "Teslim Edilmeyen",
  withinTime: "Süre İçinde Bitirilen", overflow: "Süre Aşımı",
};
const fmtDt = (s) => { try { return s ? format(new Date(s), "d MMM yyyy HH:mm", { locale: tr }) : "—"; } catch { return "—"; } };

function StatCard({ card, value, onClick }) {
  return (
    <button type="button" onClick={onClick}
      className={`text-left rounded-xl border p-4 transition-colors ${card.bg} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400`}
      aria-label={`${card.label}: ${value} (listele)`}>
      <div className="flex items-center justify-between">
        <card.Icon className={`h-5 w-5 ${card.cls}`} aria-hidden="true" />
        <span className={`text-2xl font-bold ${card.cls}`}>{value}</span>
      </div>
      <p className="mt-1 text-sm font-medium text-slate-700">{card.label}</p>
    </button>
  );
}

export function ComplianceReport() {
  const [bucket, setBucket] = useState(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["esinif", "compliance"],
    queryFn: () => schoolApi.reports.compliance(),
  });
  const { data: list, isLoading: listLoading } = useQuery({
    queryKey: ["esinif", "compliance", "list", bucket],
    queryFn: () => schoolApi.reports.complianceList(bucket),
    enabled: !!bucket,
  });

  const status = data?.status ?? { onTime: 0, late: 0, notSubmitted: 0 };
  const duration = data?.duration ?? { withinTime: 0, overflow: 0 };
  const isDurationBucket = bucket === "withinTime" || bucket === "overflow";
  const items = list?.items ?? [];

  if (isLoading) return <div className="h-28 rounded-xl bg-slate-100 animate-pulse" />;
  if (isError) return null;

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-700">Teslim Durumu</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {STATUS_CARDS.map((c) => <StatCard key={c.bucket} card={c} value={status[c.bucket] ?? 0} onClick={() => setBucket(c.bucket)} />)}
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-700">Ödev Süresi Kontrolü <span className="font-normal text-slate-400">(yalnız süreli sınavlar)</span></h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {DURATION_CARDS.map((c) => <StatCard key={c.bucket} card={c} value={duration[c.bucket] ?? 0} onClick={() => setBucket(c.bucket)} />)}
        </div>
      </section>

      <Dialog open={!!bucket} onOpenChange={(o) => !o && setBucket(null)}>
        <DialogContent className="max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{bucket ? BUCKET_LABEL[bucket] : ""}</DialogTitle></DialogHeader>
          {listLoading ? (
            <div className="py-10 text-center text-slate-400"><Loader2 className="h-6 w-6 mx-auto animate-spin" /></div>
          ) : items.length === 0 ? (
            <p className="py-8 text-center text-slate-500">Kayıt yok.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {items.map((it, i) => (
                <li key={i} className="py-2.5 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-slate-800 truncate">{it.studentName ? `${it.studentName} · ` : ""}{it.assignmentTitle}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {it.examTitle}
                    {isDurationBucket
                      ? <>{it.durationMin != null ? ` · süre ${it.durationMin} dk` : ""}{it.elapsedMin != null ? ` · geçen ${it.elapsedMin} dk` : (bucket === "overflow" ? " · zaman aşımı" : "")}</>
                      : <> · son teslim {fmtDt(it.dueDate)}{it.submittedAt ? ` · teslim ${fmtDt(it.submittedAt)}` : ""}</>}
                  </p>
                </li>
              ))}
            </ul>
          )}
          {list?.capped && <p className="pt-2 text-xs text-center text-slate-400">İlk 500 kayıt gösteriliyor.</p>}
        </DialogContent>
      </Dialog>
    </div>
  );
}
