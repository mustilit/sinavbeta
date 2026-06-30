import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { studentAssignments } from "@/api/dalClient";
import { useAuth } from "@/lib/AuthContext";
import { useAppNavigate, buildPageUrl } from "@/lib/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BookOpen, Clock, CheckCircle2, Play, Eye, ListChecks, ArrowDownUp, FileText, AlertCircle, Search, ChevronLeft, ChevronRight, CalendarRange, ChevronDown } from "lucide-react";
import { AssignmentTimeline } from "@/components/school/AssignmentTimeline";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import OnboardingTour from "@/components/onboarding/OnboardingTour";
import { SCHOOL_STUDENT_STEPS } from "@/components/onboarding/tourSteps";
import { useShouldShowTour, useCompleteTour, TOUR_KEYS } from "@/lib/useOnboarding";
import { useTranslation } from "react-i18next";

const TYPE_ICON = { TEST: ListChecks, TUNNEL: ArrowDownUp, WRITTEN: FileText };
const TYPE_FILTERS = ["ALL", "TEST", "TUNNEL", "WRITTEN"];
const PAGE_SIZE = 8;

/** E-Sınıf — Öğrenci ödev listesi. Durum sekmesi + metin/tür filtresi + sayfalama. */
export default function StudentAssignments() {
  const { user } = useAuth();
  const { t } = useTranslation("school");
  const navigate = useAppNavigate();
  const [tab, setTab] = useState("pending");
  const [q, setQ] = useState("");
  const [type, setType] = useState("ALL");
  const [page, setPage] = useState(1);
  const [showTimeline, setShowTimeline] = useState(true);
  const isStudent = user?.school?.schoolRole === "STUDENT";
  // İlk girişte öğrenciye E-Sınıf bilgilendirme turu (rol bazlı).
  const showTour = useShouldShowTour(TOUR_KEYS.SCHOOL_STUDENT) && isStudent;
  const completeTour = useCompleteTour();

  const { data, isLoading } = useQuery({
    queryKey: ["esinif", "student-assignments", tab],
    queryFn: () => studentAssignments.list({ filter: tab }),
    enabled: isStudent,
  });
  const items = useMemo(() => data?.items ?? [], [data]);
  const filtered = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase("tr");
    return items.filter((a) =>
      (type === "ALL" || a.examType === type) &&
      (!needle || (a.title ?? "").toLocaleLowerCase("tr").includes(needle)),
    );
  }, [items, type, q]);

  useEffect(() => { setPage(1); }, [tab, q, type]);

  if (!isStudent) return <div className="max-w-lg mx-auto text-center py-20"><AlertCircle className="w-12 h-12 mx-auto mb-3 text-slate-300" /><h2 className="text-xl font-semibold text-slate-900">{t("common.accessDenied")}</h2></div>;

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageItems = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {showTour && (
        <OnboardingTour
          steps={SCHOOL_STUDENT_STEPS}
          tourKey={TOUR_KEYS.SCHOOL_STUDENT}
          persona="school_student"
          onComplete={() => completeTour(TOUR_KEYS.SCHOOL_STUDENT)}
          onSkip={() => completeTour(TOUR_KEYS.SCHOOL_STUDENT)}
        />
      )}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center"><BookOpen className="w-5 h-5 text-indigo-600" /></div>
        <div><h1 className="text-2xl font-bold text-slate-900">{t("assignments.title")}</h1><p className="text-sm text-slate-500">{user?.school?.schoolName}</p></div>
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        {["pending", "submitted", "all"].map((k) => (
          <button key={k} type="button" onClick={() => setTab(k)} className={`px-4 py-2.5 min-h-10 text-sm font-medium border-b-2 -mb-px ${tab === k ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-600 hover:text-slate-900"}`}>{t(`assignments.tabs.${k}`)}</button>
        ))}
      </div>

      {/* Filtre satırı — metin + tür */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("assignments.search")} className="pl-9" aria-label={t("assignments.searchAria")} />
        </div>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder={t("common.types.all")} /></SelectTrigger>
          <SelectContent>
            {TYPE_FILTERS.map((k) => <SelectItem key={k} value={k}>{k === "ALL" ? t("common.types.all") : t(`common.types.${k}`)}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Ödev takvimi (Gantt tarzı) — her ödevin tarih aralığı; üzerine gelince adı */}
      {filtered.length > 0 && (
        <div className="space-y-2">
          <button type="button" onClick={() => setShowTimeline((v) => !v)} className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-700 min-h-10">
            <CalendarRange className="w-4 h-4 text-indigo-600" /> {t("assignments.timelineTitle")}
            <ChevronDown className={`w-4 h-4 transition-transform ${showTimeline ? "" : "-rotate-90"}`} />
          </button>
          {showTimeline && <AssignmentTimeline items={filtered} />}
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">{[0, 1].map((i) => <div key={i} className="h-20 bg-slate-100 rounded-xl animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-500"><CheckCircle2 className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>{q.trim() || type !== "ALL" ? t("assignments.emptyFiltered") : t("assignments.empty")}</p></div>
      ) : (
        <>
          <div className="space-y-3">
            {pageItems.map((a) => {
              const Icon = TYPE_ICON[a.examType] ?? TYPE_ICON.TEST;
              const overdue = !a.submitted && !a.open;
              return (
                <Card key={a.id}>
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className="w-11 h-11 rounded-xl bg-slate-50 flex items-center justify-center shrink-0"><Icon className="w-5 h-5 text-indigo-600" /></div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-slate-900 truncate">{a.title}</span>
                        <Badge className="bg-slate-100 text-slate-600">{t(`common.types.${a.examType}`)}</Badge>
                        {a.submitted && a.score != null && <Badge className="bg-emerald-100 text-emerald-700">{a.score}/{a.maxScore}</Badge>}
                      </div>
                      <p className={`text-xs mt-1 flex items-center gap-1 ${overdue ? "text-rose-600" : "text-slate-500"}`}>
                        <Clock className="w-3 h-3" /> {t("assignments.dueDate", { date: format(new Date(a.dueDate), "d MMM yyyy HH:mm", { locale: tr }) })}
                        {a.durationMinutes ? ` · ${t("common.durationMin", { count: a.durationMinutes })}` : ""}{overdue ? ` · ${t("assignments.overdue")}` : ""}
                      </p>
                    </div>
                    {a.submitted ? (
                      <Button size="sm" variant="outline" className="gap-1" onClick={() => navigate(buildPageUrl("StudentResult", { id: a.id }))}><Eye className="w-4 h-4" /> {t("common.result")}</Button>
                    ) : a.open ? (
                      <Button size="sm" className={`gap-1 ${a.submissionStatus === "IN_PROGRESS" ? "bg-amber-500 hover:bg-amber-600" : "bg-indigo-600 hover:bg-indigo-700"}`} onClick={() => navigate(buildPageUrl("StudentSolve", { id: a.id }))}><Play className="w-4 h-4" /> {a.submissionStatus === "IN_PROGRESS" ? t("common.continue") : t("common.start")}</Button>
                    ) : (
                      <Badge className="bg-slate-200 text-slate-600">{t("assignments.closed")}</Badge>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {pageCount > 1 && (
            <div className="flex items-center justify-center gap-3 pt-1">
              <Button variant="outline" size="sm" disabled={safePage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}><ChevronLeft className="w-4 h-4" /> {t("common.prev")}</Button>
              <span className="text-sm text-slate-500">{t("common.page", { page: safePage, total: pageCount })}</span>
              <Button variant="outline" size="sm" disabled={safePage >= pageCount} onClick={() => setPage((p) => Math.min(pageCount, p + 1))}>{t("common.next")} <ChevronRight className="w-4 h-4" /></Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
