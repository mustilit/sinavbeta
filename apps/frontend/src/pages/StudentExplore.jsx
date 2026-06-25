import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { studentAssignments } from "@/api/dalClient";
import { useAuth } from "@/lib/AuthContext";
import { useAppNavigate, buildPageUrl } from "@/lib/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Compass, Clock, Play, Eye, ListChecks, ArrowDownUp, FileText, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { tr } from "date-fns/locale";

const TABS = [
  { type: "TEST", label: "Test", Icon: ListChecks },
  { type: "TUNNEL", label: "Tünel", Icon: ArrowDownUp },
  { type: "WRITTEN", label: "Yazılı", Icon: FileText },
];

/** E-Sınıf — Öğrenci Keşfet: kendi seviyesindeki sınavlar, türüne göre 3 sekmede. */
export default function StudentExplore() {
  const { user } = useAuth();
  const navigate = useAppNavigate();
  const isStudent = user?.school?.schoolRole === "STUDENT";
  const [tab, setTab] = useState("TEST");

  const { data, isLoading } = useQuery({
    queryKey: ["esinif", "student-explore"],
    queryFn: () => studentAssignments.list({ filter: "all" }),
    enabled: isStudent,
  });

  if (!isStudent) return <div className="max-w-lg mx-auto text-center py-20"><AlertCircle className="w-12 h-12 mx-auto mb-3 text-slate-300" /><h2 className="text-xl font-semibold text-slate-900">Erişim yok</h2></div>;

  const all = data?.items ?? [];
  const counts = Object.fromEntries(TABS.map((t) => [t.type, all.filter((a) => a.examType === t.type).length]));
  const items = all.filter((a) => a.examType === tab);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center"><Compass className="w-5 h-5 text-indigo-600" /></div>
        <div><h1 className="text-2xl font-bold text-slate-900">Keşfet</h1><p className="text-sm text-slate-500">Seviyendeki sınavlar — türüne göre</p></div>
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
            const overdue = !a.submitted && !a.open;
            return (
              <Card key={a.id}>
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="w-11 h-11 rounded-xl bg-slate-50 flex items-center justify-center shrink-0"><m.Icon className="w-5 h-5 text-indigo-600" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-slate-900 truncate">{a.title}</span>
                      <Badge className="bg-slate-100 text-slate-600">{m.label}</Badge>
                      {a.submitted && a.score != null && <Badge className="bg-emerald-100 text-emerald-700">{a.score}/{a.maxScore}</Badge>}
                    </div>
                    <p className={`text-xs mt-1 flex items-center gap-1 ${overdue ? "text-rose-600" : "text-slate-500"}`}>
                      <Clock className="w-3 h-3" /> Son teslim: {format(new Date(a.dueDate), "d MMM yyyy HH:mm", { locale: tr })}
                      {a.durationMinutes ? ` · ${a.durationMinutes} dk` : ""}{overdue ? " · süresi geçti" : ""}
                    </p>
                  </div>
                  {a.submitted ? (
                    <Button size="sm" variant="outline" className="gap-1" onClick={() => navigate(buildPageUrl("StudentResult", { id: a.id }))}><Eye className="w-4 h-4" /> Sonuç</Button>
                  ) : a.open ? (
                    <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 gap-1" onClick={() => navigate(buildPageUrl("StudentSolve", { id: a.id }))}><Play className="w-4 h-4" /> {a.submissionStatus === "IN_PROGRESS" ? "Devam Et" : "Başla"}</Button>
                  ) : (
                    <Badge className="bg-slate-200 text-slate-600">Kapalı</Badge>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
