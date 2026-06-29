import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { studentPractice } from "@/api/dalClient";
import { useAuth } from "@/lib/AuthContext";
import { useAppNavigate, buildPageUrl } from "@/lib/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Compass, Play, RotateCcw, Eye, ListChecks, ArrowDownUp, FileText, AlertCircle, Trophy } from "lucide-react";

const TABS = [
  { type: "TEST", label: "Test", Icon: ListChecks },
  { type: "TUNNEL", label: "Tünel", Icon: ArrowDownUp },
  { type: "WRITTEN", label: "Yazılı", Icon: FileText },
];

/**
 * E-Sınıf — Öğrenci Keşfet: kendi seviyesindeki TÜM sınavlar (öğretmen atamasa bile).
 * Serbest alıştırma — ödevden bağımsız, istediğin kadar çöz. Türüne göre 3 sekmede.
 */
export default function StudentExplore() {
  const { user } = useAuth();
  const navigate = useAppNavigate();
  const isStudent = user?.school?.schoolRole === "STUDENT";
  const [tab, setTab] = useState("TEST");

  const { data, isLoading } = useQuery({
    queryKey: ["esinif", "practice-exams"],
    queryFn: () => studentPractice.listExams(),
    enabled: isStudent,
  });

  if (!isStudent) return <div className="max-w-lg mx-auto text-center py-20"><AlertCircle className="w-12 h-12 mx-auto mb-3 text-slate-300" /><h2 className="text-xl font-semibold text-slate-900">Erişim yok</h2></div>;

  const all = data?.items ?? [];
  const gradeLevel = data?.gradeLevel ?? null;
  const counts = Object.fromEntries(TABS.map((t) => [t.type, all.filter((a) => a.examType === t.type).length]));
  const items = all.filter((a) => a.examType === tab);

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
        {TABS.map((t) => (
          <button key={t.type} type="button" onClick={() => setTab(t.type)} className={`px-4 py-2.5 min-h-10 text-sm font-medium border-b-2 -mb-px inline-flex items-center gap-1.5 ${tab === t.type ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-600 hover:text-slate-900"}`}>
            <t.Icon className="w-4 h-4" /> {t.label} ({counts[t.type] ?? 0})
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-2">{[0, 1].map((i) => <div key={i} className="h-20 bg-slate-100 rounded-xl animate-pulse" />)}</div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-slate-500"><Compass className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>Bu türde sınav yok.</p></div>
      ) : (
        <div className="space-y-3">
          {items.map((a) => {
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
                    {/* TEST/WRITTEN teslim edildiyse sonuç + tekrar; tünelde sadece çöz/devam */}
                    {!isTunnel && done && (
                      <Button size="sm" variant="outline" className="gap-1" onClick={() => seeResult(a)}><Eye className="w-4 h-4" /> Sonuç</Button>
                    )}
                    <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 gap-1" onClick={() => solve(a)}>
                      {done ? <><RotateCcw className="w-4 h-4" /> Tekrar</> : inProgress ? <><Play className="w-4 h-4" /> Devam Et</> : <><Play className="w-4 h-4" /> Başla</>}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
