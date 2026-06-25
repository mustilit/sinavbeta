import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { studentAssignments } from "@/api/dalClient";
import { useAuth } from "@/lib/AuthContext";
import { useAppNavigate, buildPageUrl } from "@/lib/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { BookOpen, Clock, CheckCircle2, Play, Eye, ListChecks, ArrowDownUp, FileText, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { tr } from "date-fns/locale";

const TYPE_META = {
  TEST: { label: "Test", Icon: ListChecks },
  TUNNEL: { label: "Tünel", Icon: ArrowDownUp },
  WRITTEN: { label: "Yazılı", Icon: FileText },
};

/** E-Sınıf — Öğrenci ödev listesi. */
export default function StudentAssignments() {
  const { user } = useAuth();
  const navigate = useAppNavigate();
  const [tab, setTab] = useState("pending");
  const isStudent = user?.school?.schoolRole === "STUDENT";

  const { data, isLoading } = useQuery({
    queryKey: ["esinif", "student-assignments", tab],
    queryFn: () => studentAssignments.list({ filter: tab }),
    enabled: isStudent,
  });
  const items = data?.items ?? [];

  if (!isStudent) return <div className="max-w-lg mx-auto text-center py-20"><AlertCircle className="w-12 h-12 mx-auto mb-3 text-slate-300" /><h2 className="text-xl font-semibold text-slate-900">Erişim yok</h2></div>;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center"><BookOpen className="w-5 h-5 text-indigo-600" /></div>
        <div><h1 className="text-2xl font-bold text-slate-900">Ödevlerim</h1><p className="text-sm text-slate-500">{user?.school?.schoolName}</p></div>
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        {[{ k: "pending", l: "Bekleyen" }, { k: "submitted", l: "Teslim Edilen" }, { k: "all", l: "Tümü" }].map((t) => (
          <button key={t.k} type="button" onClick={() => setTab(t.k)} className={`px-4 py-2.5 min-h-10 text-sm font-medium border-b-2 -mb-px ${tab === t.k ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-600 hover:text-slate-900"}`}>{t.l}</button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-2">{[0, 1].map((i) => <div key={i} className="h-20 bg-slate-100 rounded-xl animate-pulse" />)}</div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-slate-500"><CheckCircle2 className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>Bu sekmede ödev yok.</p></div>
      ) : (
        <div className="space-y-3">
          {items.map((a) => {
            const m = TYPE_META[a.examType] ?? TYPE_META.TEST;
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
