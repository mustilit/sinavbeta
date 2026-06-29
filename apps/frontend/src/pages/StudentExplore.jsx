import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { studentPractice } from "@/api/dalClient";
import { useAuth } from "@/lib/AuthContext";
import { useAppNavigate, buildPageUrl } from "@/lib/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Compass, Play, RotateCcw, Eye, ListChecks, ArrowDownUp, FileText, AlertCircle, Trophy, Search, ChevronLeft, ChevronRight, HelpCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { TunnelInfoModal, useTunnelIntro } from "@/components/tunnel/TunnelInfoModal";

const TABS = [
  { type: "TEST", label: "Test", Icon: ListChecks },
  { type: "TUNNEL", label: "Tünel", Icon: ArrowDownUp },
  { type: "WRITTEN", label: "Yazılı", Icon: FileText },
];
const PAGE_SIZE = 8;

/**
 * E-Sınıf — Öğrenci Keşfet: kendi seviyesindeki TÜM sınavlar (öğretmen atamasa bile).
 * Serbest alıştırma. Türüne göre 3 sekme; her sekmede metin + ders filtresi ve sayfalama.
 */
export default function StudentExplore() {
  const { user } = useAuth();
  const { t } = useTranslation(["pages"]);
  const navigate = useAppNavigate();
  const isStudent = user?.school?.schoolRole === "STUDENT";
  const [tab, setTab] = useState("TEST");
  // "Tünel Nedir?" — Tünel sekmesi ilk açıldığında otomatik, butonla tekrar (market deseni).
  const tunnelIntro = useTunnelIntro(tab === "TUNNEL");
  const [q, setQ] = useState("");
  const [subject, setSubject] = useState("ALL");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["esinif", "practice-exams"],
    queryFn: () => studentPractice.listExams(),
    enabled: isStudent,
  });

  const all = useMemo(() => data?.items ?? [], [data]);
  const gradeLevel = data?.gradeLevel ?? null;
  const counts = Object.fromEntries(TABS.map((t) => [t.type, all.filter((a) => a.examType === t.type).length]));
  const byType = useMemo(() => all.filter((a) => a.examType === tab), [all, tab]);
  // Ders (subject) seçenekleri — aktif sekmedeki sınavlardan türetilir
  const subjects = useMemo(() => [...new Set(byType.map((a) => a.subject).filter(Boolean))].sort((a, b) => a.localeCompare(b, "tr")), [byType]);
  const filtered = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase("tr");
    return byType.filter((a) =>
      (subject === "ALL" || a.subject === subject) &&
      (!needle || (a.title ?? "").toLocaleLowerCase("tr").includes(needle)),
    );
  }, [byType, subject, q]);

  // Sekme/filtre değişince sayfayı başa al
  useEffect(() => { setPage(1); }, [tab, q, subject]);

  if (!isStudent) return <div className="max-w-lg mx-auto text-center py-20"><AlertCircle className="w-12 h-12 mx-auto mb-3 text-slate-300" /><h2 className="text-xl font-semibold text-slate-900">Erişim yok</h2></div>;

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageItems = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const solve = (e) => navigate(buildPageUrl("StudentSolve", { practice: e.id }));
  const seeResult = (e) => navigate(buildPageUrl("StudentResult", { practice: e.id }));

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center"><Compass className="w-5 h-5 text-indigo-600" /></div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Keşfet</h1>
          <p className="text-sm text-slate-500">{gradeLevel ? `${gradeLevel}. sınıf seviyendeki tüm sınavlar — serbest alıştırma` : "Seviyendeki sınavlar — serbest alıştırma"}</p>
        </div>
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        {TABS.map((tb) => (
          <button key={tb.type} type="button" onClick={() => setTab(tb.type)} className={`px-4 py-2.5 min-h-10 text-sm font-medium border-b-2 -mb-px inline-flex items-center gap-1.5 ${tab === tb.type ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-600 hover:text-slate-900"}`}>
            <tb.Icon className="w-4 h-4" /> {tb.label} ({counts[tb.type] ?? 0})
          </button>
        ))}
        {tab === "TUNNEL" && (
          <button type="button" onClick={() => tunnelIntro.setOpen(true)} className="ml-auto inline-flex items-center gap-1 px-2 py-1 min-h-10 text-xs font-medium text-indigo-600 hover:text-indigo-700">
            <HelpCircle className="h-4 w-4" aria-hidden="true" /> {t("pages:tunnelInfo.trigger")}
          </button>
        )}
      </div>
      <TunnelInfoModal open={tunnelIntro.open} onClose={() => tunnelIntro.setOpen(false)} />

      {/* Filtre satırı — metin + ders */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Sınav ara…" className="pl-9" aria-label="Sınav ara" />
        </div>
        <Select value={subject} onValueChange={setSubject}>
          <SelectTrigger className="w-full sm:w-56"><SelectValue placeholder="Ders" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tüm dersler</SelectItem>
            {subjects.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[0, 1].map((i) => <div key={i} className="h-20 bg-slate-100 rounded-xl animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-500"><Compass className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>{q.trim() || subject !== "ALL" ? "Filtreye uygun sınav yok." : "Bu türde sınav yok."}</p></div>
      ) : (
        <>
          <div className="space-y-3">
            {pageItems.map((a) => {
              const m = TABS.find((t) => t.type === a.examType) ?? TABS[0];
              const inProgress = a.status === "IN_PROGRESS";
              const done = a.status === "SUBMITTED" || a.status === "GRADED" || a.status === "COMPLETED";
              const isTunnel = a.examType === "TUNNEL";
              return (
                <Card key={a.id}>
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className="w-11 h-11 rounded-xl bg-slate-50 flex items-center justify-center shrink-0"><m.Icon className="w-5 h-5 text-indigo-600" /></div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-slate-900 truncate">{a.title}</span>
                        <Badge className="bg-slate-100 text-slate-600">{m.label}</Badge>
                        {a.examType === "TEST" && done && a.score != null && <Badge className="bg-emerald-100 text-emerald-700">{a.score}/{a.maxScore}</Badge>}
                        {isTunnel && a.status === "COMPLETED" && <Badge className="bg-amber-100 text-amber-700 gap-1"><Trophy className="w-3 h-3" /> Tamamlandı</Badge>}
                      </div>
                      <p className="text-xs mt-1 text-slate-500">
                        {a.subject ? `${a.subject} · ` : ""}{a.questionCount} soru{a.durationMinutes ? ` · ${a.durationMinutes} dk` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {!isTunnel && done && (
                        <Button size="sm" variant="outline" className="gap-1" onClick={() => seeResult(a)}><Eye className="w-4 h-4" /> Sonuç</Button>
                      )}
                      <Button size="sm" className={`gap-1 ${inProgress ? "bg-amber-500 hover:bg-amber-600" : "bg-indigo-600 hover:bg-indigo-700"}`} onClick={() => solve(a)}>
                        {done ? <><RotateCcw className="w-4 h-4" /> Tekrar</> : inProgress ? <><Play className="w-4 h-4" /> Devam Et</> : <><Play className="w-4 h-4" /> Başla</>}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Sayfalama */}
          {pageCount > 1 && (
            <div className="flex items-center justify-center gap-3 pt-1">
              <Button variant="outline" size="sm" disabled={safePage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}><ChevronLeft className="w-4 h-4" /> Önceki</Button>
              <span className="text-sm text-slate-500">Sayfa {safePage} / {pageCount}</span>
              <Button variant="outline" size="sm" disabled={safePage >= pageCount} onClick={() => setPage((p) => Math.min(pageCount, p + 1))}>Sonraki <ChevronRight className="w-4 h-4" /></Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
