import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { school as schoolApi } from "@/api/dalClient";
import { useAuth } from "@/lib/AuthContext";
import { useAppNavigate, buildPageUrl } from "@/lib/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { FileQuestion, Plus, Search, Archive, Pencil, ListChecks, ArrowDownUp, FileText, AlertCircle } from "lucide-react";
import { toast } from "sonner";

const TYPE_META = {
  TEST: { label: "Test", color: "bg-indigo-100 text-indigo-700", Icon: ListChecks },
  TUNNEL: { label: "Tünel", color: "bg-violet-100 text-violet-700", Icon: ArrowDownUp },
  WRITTEN: { label: "Yazılı", color: "bg-amber-100 text-amber-700", Icon: FileText },
};

/** E-Sınıf — sınav havuzu (öğretmen/zümre başkanı; yönetici salt-okur). */
export default function SchoolExamPool() {
  const { user } = useAuth();
  const navigate = useAppNavigate();
  const qc = useQueryClient();
  const role = user?.school?.schoolRole;
  const canCreate = role === "TEACHER" || role === "DEPT_HEAD";
  const [examType, setExamType] = useState("all");
  const [q, setQ] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [dept, setDept] = useState("all");   // Zümre filtresi (departmentName)
  const [grade, setGrade] = useState("all"); // Seviye filtresi (gradeLevel)

  const { data: exams = [], isLoading } = useQuery({
    queryKey: ["esinif", "exam-pool", examType, q, includeArchived],
    queryFn: () => schoolApi.exams.list({ examType: examType === "all" ? undefined : examType, q: q || undefined, includeArchived }),
    enabled: !!role,
  });

  const archive = useMutation({
    mutationFn: ({ id, isArchived }) => schoolApi.exams.archive(id, isArchived),
    onSuccess: () => { toast.success("Güncellendi"); qc.invalidateQueries({ queryKey: ["esinif", "exam-pool"] }); },
    onError: (e) => toast.error(e?.response?.data?.message ?? "Güncellenemedi"),
  });

  // Filtre seçenekleri sınav listesinden türetilir (Zümre + Seviye)
  const deptOptions = [...new Set(exams.map((e) => e.departmentName).filter(Boolean))].sort((a, b) => a.localeCompare(b, "tr"));
  const gradeOptions = [...new Set(exams.map((e) => e.gradeLevel).filter((g) => g != null))].sort((a, b) => a - b);
  const visible = exams.filter(
    (e) => (dept === "all" || e.departmentName === dept) && (grade === "all" || String(e.gradeLevel) === grade),
  );

  if (!role) {
    return <div className="max-w-lg mx-auto text-center py-20"><AlertCircle className="w-12 h-12 mx-auto mb-3 text-slate-300" /><h2 className="text-xl font-semibold text-slate-900">Erişim yok</h2></div>;
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center"><FileQuestion className="w-5 h-5 text-indigo-600" /></div>
          <div><h1 className="text-2xl font-bold text-slate-900">Sınav Havuzu</h1><p className="text-sm text-slate-500">Test, Tünel ve Yazılı sınavlar</p></div>
        </div>
        {canCreate && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button className="bg-indigo-600 hover:bg-indigo-700 gap-2"><Plus className="w-4 h-4" /> Yeni Sınav</Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {Object.entries(TYPE_META).map(([t, m]) => (
                <DropdownMenuItem key={t} onClick={() => navigate(buildPageUrl("SchoolExamEdit", { type: t }))}>
                  <m.Icon className="w-4 h-4 mr-2" /> {m.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[200px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Sınav ara…" className="pl-10" />
        </div>
        <Select value={examType} onValueChange={setExamType}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tüm türler</SelectItem>
            {Object.entries(TYPE_META).map(([t, m]) => <SelectItem key={t} value={t}>{m.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={dept} onValueChange={setDept}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Zümre" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tüm zümreler</SelectItem>
            {deptOptions.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={grade} onValueChange={setGrade}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Seviye" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tüm seviyeler</SelectItem>
            {gradeOptions.map((g) => <SelectItem key={g} value={String(g)}>{g}. sınıf</SelectItem>)}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={includeArchived} onChange={(e) => setIncludeArchived(e.target.checked)} className="rounded" /> Pasifleri göster</label>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-16 bg-slate-100 rounded-lg animate-pulse" />)}</div>
      ) : visible.length === 0 ? (
        <div className="text-center py-16 text-slate-500"><FileQuestion className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>Sınav bulunamadı.</p></div>
      ) : (
        <div className="space-y-2">
          {visible.map((e) => {
            const m = TYPE_META[e.examType] ?? TYPE_META.TEST;
            return (
              <div key={e.id} className={`flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 ${e.isArchived ? "opacity-60 bg-slate-50" : "bg-white"}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className={`${m.color} gap-1`}><m.Icon className="w-3 h-3" /> {m.label}</Badge>
                    <span className="font-medium text-slate-900 truncate">{e.title}</span>
                    {e.poolVisibility === "SCHOOL" && <Badge className="bg-emerald-50 text-emerald-700">Tüm okul</Badge>}
                    {e.isArchived && <Badge className="bg-slate-200 text-slate-600">Pasif</Badge>}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    {e.subject}{e.gradeLevel ? ` · ${e.gradeLevel}. sınıf` : ""} · {e.questionCount} soru · {e.totalPoints} puan
                    {e.departmentName ? ` · ${e.departmentName}` : ""}{e.createdByUsername ? ` · ${e.createdByUsername}` : ""}
                  </p>
                </div>
                {e.canManage && (
                  <div className="flex gap-1 shrink-0">
                    <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={() => navigate(buildPageUrl("SchoolExamEdit", { id: e.id }))}><Pencil className="w-3.5 h-3.5" /> Düzenle</Button>
                    <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={() => archive.mutate({ id: e.id, isArchived: !e.isArchived })}><Archive className="w-3.5 h-3.5" /> {e.isArchived ? "Aktife al" : "Pasife al"}</Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
