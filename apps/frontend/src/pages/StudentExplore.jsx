import { useState, useEffect, useDeferredValue } from "react";
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
  { type: "TEST", Icon: ListChecks },
  { type: "TUNNEL", Icon: ArrowDownUp },
  { type: "WRITTEN", Icon: FileText },
];
const PAGE_SIZE = 8;

/**
 * E-Sınıf — Öğrenci Keşfet: kendi seviyesindeki TÜM sınavlar (öğretmen atamasa bile).
 * Serbest alıştırma. Türüne göre 3 sekme; her sekmede metin + ders filtresi ve sayfalama.
 */
export default function StudentExplore() {
  const { user } = useAuth();
  const { t } = useTranslation(["school", "pages"]);
  const navigate = useAppNavigate();
  const isStudent = user?.school?.schoolRole === "STUDENT";
  const [tab, setTab] = useState("TEST");
  // "Tünel Nedir?" — Tünel sekmesi ilk açıldığında otomatik, butonla tekrar (market deseni).
  const tunnelIntro = useTunnelIntro(tab === "TUNNEL");
  const [q, setQ] = useState("");
  const [subject, setSubject] = useState("ALL");
  const [page, setPage] = useState(1);
  const deferredQ = useDeferredValue(q);

  // Server-side: tür sekmesi + ders + arama + sayfalama backend'de (büyüyebilen liste).
  // Yanıt facet'leri de döndürür: counts (sekme rozetleri) + subjects (ders seçeneği) + total.
  const { data, isLoading } = useQuery({
    queryKey: ["esinif", "practice-exams", tab, subject, deferredQ.trim(), page],
    queryFn: () => studentPractice.listExams({
      examType: tab,
      subject: subject === "ALL" ? undefined : subject,
      q: deferredQ.trim() || undefined,
      page,
      pageSize: PAGE_SIZE,
    }),
    enabled: isStudent,
  });

  const gradeLevel = data?.gradeLevel ?? null;
  const counts = data?.counts ?? { TEST: 0, TUNNEL: 0, WRITTEN: 0 };
  const subjects = data?.subjects ?? [];
  const pageItems = data?.items ?? [];
  const total = data?.total ?? 0;

  // Sekme değişince ders + sayfayı sıfırla; ders/arama değişince sayfayı başa al.
  useEffect(() => { setSubject("ALL"); setPage(1); }, [tab]);
  useEffect(() => { setPage(1); }, [subject, deferredQ]);

  if (!isStudent) return <div className="max-w-lg mx-auto text-center py-20"><AlertCircle className="w-12 h-12 mx-auto mb-3 text-slate-300" /><h2 className="text-xl font-semibold text-slate-900">{t("school:common.accessDenied")}</h2></div>;

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);

  const solve = (e) => navigate(buildPageUrl("StudentSolve", { practice: e.id }));
  const seeResult = (e) => navigate(buildPageUrl("StudentResult", { practice: e.id }));

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center"><Compass className="w-5 h-5 text-indigo-600" /></div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t("school:explore.title")}</h1>
          <p className="text-sm text-slate-500">{gradeLevel ? t("school:explore.subtitleGrade", { grade: gradeLevel }) : t("school:explore.subtitle")}</p>
        </div>
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        {TABS.map((tb) => (
          <button key={tb.type} type="button" onClick={() => setTab(tb.type)} className={`px-4 py-2.5 min-h-10 text-sm font-medium border-b-2 -mb-px inline-flex items-center gap-1.5 ${tab === tb.type ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-600 hover:text-slate-900"}`}>
            <tb.Icon className="w-4 h-4" /> {t(`school:common.types.${tb.type}`)} ({counts[tb.type] ?? 0})
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
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("school:explore.search")} className="pl-9" aria-label={t("school:explore.searchAria")} />
        </div>
        <Select value={subject} onValueChange={setSubject}>
          <SelectTrigger className="w-full sm:w-56"><SelectValue placeholder={t("school:explore.subjectPlaceholder")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t("school:explore.allSubjects")}</SelectItem>
            {subjects.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[0, 1].map((i) => <div key={i} className="h-20 bg-slate-100 rounded-xl animate-pulse" />)}</div>
      ) : pageItems.length === 0 ? (
        <div className="text-center py-16 text-slate-500"><Compass className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>{q.trim() || subject !== "ALL" ? t("school:explore.emptyFiltered") : t("school:explore.empty")}</p></div>
      ) : (
        <>
          <div className="space-y-3">
            {pageItems.map((a) => {
              const m = TABS.find((x) => x.type === a.examType) ?? TABS[0];
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
                        <Badge className="bg-slate-100 text-slate-600">{t(`school:common.types.${a.examType}`)}</Badge>
                        {a.examType === "TEST" && done && a.score != null && <Badge className="bg-emerald-100 text-emerald-700">{a.score}/{a.maxScore}</Badge>}
                        {isTunnel && a.status === "COMPLETED" && <Badge className="bg-amber-100 text-amber-700 gap-1"><Trophy className="w-3 h-3" /> {t("school:explore.completed")}</Badge>}
                      </div>
                      <p className="text-xs mt-1 text-slate-500">
                        {a.subject ? `${a.subject} · ` : ""}{t("school:common.questionsCount", { count: a.questionCount })}{a.durationMinutes ? ` · ${t("school:common.durationMin", { count: a.durationMinutes })}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {!isTunnel && done && (
                        <Button size="sm" variant="outline" className="gap-1" onClick={() => seeResult(a)}><Eye className="w-4 h-4" /> {t("school:common.result")}</Button>
                      )}
                      <Button size="sm" className={`gap-1 ${inProgress ? "bg-amber-500 hover:bg-amber-600" : "bg-indigo-600 hover:bg-indigo-700"}`} onClick={() => solve(a)}>
                        {done ? <><RotateCcw className="w-4 h-4" /> {t("school:common.retry")}</> : inProgress ? <><Play className="w-4 h-4" /> {t("school:common.continue")}</> : <><Play className="w-4 h-4" /> {t("school:common.start")}</>}
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
              <Button variant="outline" size="sm" disabled={safePage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}><ChevronLeft className="w-4 h-4" /> {t("school:common.prev")}</Button>
              <span className="text-sm text-slate-500">{t("school:common.page", { page: safePage, total: pageCount })}</span>
              <Button variant="outline" size="sm" disabled={safePage >= pageCount} onClick={() => setPage((p) => Math.min(pageCount, p + 1))}>{t("school:common.next")} <ChevronRight className="w-4 h-4" /></Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
