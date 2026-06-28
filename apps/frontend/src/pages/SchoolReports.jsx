import { useState, useMemo, lazy, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { school as schoolApi } from "@/api/dalClient";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BarChart3, Download, Building2, Layers, GraduationCap, AlertCircle, Trophy, Award, X } from "lucide-react";
import { toast } from "sonner";
import { PeriodSelect } from "@/components/school/PeriodSelect";

const fmtPct = (p) => (p == null ? "—" : `%${p}`);

// recharts ağır lib → yalnız Raporlar dashboard'u render edilince yüklenir
const ReportCharts = lazy(() => import("@/components/school/ReportCharts"));

const RANGES = [
  { value: "all", label: "Tüm zamanlar", days: null },
  { value: "7", label: "Son 7 gün", days: 7 },
  { value: "30", label: "Son 30 gün", days: 30 },
  { value: "90", label: "Son 90 gün", days: 90 },
];

function avgClass(p) {
  if (p == null) return "text-slate-400";
  if (p >= 70) return "text-emerald-600";
  if (p >= 50) return "text-amber-600";
  return "text-rose-600";
}

/** E-Sınıf — Raporlar: Şubeler / Seviyeler / Sınıflar sekmeleri + filtre satırı. */
export default function SchoolReports() {
  const { user } = useAuth();
  const role = user?.school?.schoolRole;
  const isManager = role === "SCHOOL_ADMIN" || role === "BRANCH_ADMIN";
  // Alt roller (seviye sorumlusu / sınıf öğretmeni / zümre başkanı) kapsamı kadar görür.
  const canView = !!role && (isManager || user?.school?.canViewStructure);

  const [tab, setTab] = useState("branches"); // branches | levels | classrooms
  const [range, setRange] = useState("all");
  const [gradeLevel, setGradeLevel] = useState("ALL");
  const [classroomId, setClassroomId] = useState("ALL");
  const [departmentId, setDepartmentId] = useState("ALL");
  const [periodId, setPeriodId] = useState("");
  const [detailFor, setDetailFor] = useState(null); // classroom row

  // Filtre seçenekleri — yönetici tüm okuldan; alt roller kapsam (breakdown) verisinden türetir.
  const { data: allClasses = [] } = useQuery({ queryKey: ["esinif", "classrooms", "all"], queryFn: () => schoolApi.listClassrooms(), enabled: isManager });
  const { data: departments = [] } = useQuery({ queryKey: ["esinif", "departments"], queryFn: schoolApi.listDepartments, enabled: isManager });

  const from = useMemo(() => {
    const r = RANGES.find((x) => x.value === range);
    return r?.days ? new Date(Date.now() - r.days * 86400000).toISOString() : undefined;
  }, [range]);

  const filters = {
    from,
    gradeLevel: gradeLevel === "ALL" ? undefined : Number(gradeLevel),
    classroomId: classroomId === "ALL" ? undefined : classroomId,
    departmentId: departmentId === "ALL" ? undefined : departmentId,
    periodId: periodId || undefined,
  };

  const { data, isLoading } = useQuery({
    queryKey: ["esinif", "report-breakdown", filters],
    queryFn: () => schoolApi.reports.breakdown(filters),
    enabled: canView && !!periodId,
  });

  if (!canView) {
    return <div className="max-w-lg mx-auto text-center py-20"><AlertCircle className="w-12 h-12 mx-auto mb-3 text-slate-300" /><h2 className="text-xl font-semibold text-slate-900">Erişim yok</h2></div>;
  }

  const branches = data?.branches ?? [];
  const levels = data?.levels ?? [];
  const classrooms = data?.classrooms ?? [];
  // Alt roller için filtre seçenekleri breakdown verisinden türetilir (kapsam dışını göstermez)
  const grades = isManager
    ? [...new Set(allClasses.map((c) => c.gradeLevel))].sort((a, b) => a - b)
    : [...new Set(levels.map((l) => l.gradeLevel))].sort((a, b) => a - b);
  const classOptions = (isManager ? allClasses : classrooms).filter((c) => gradeLevel === "ALL" || c.gradeLevel === Number(gradeLevel));
  const byDepartment = data?.byDepartment ?? [];
  const timeseries = data?.timeseries ?? [];
  const highlights = data?.highlights ?? { bestBranch: null, bestClassByLevel: [] };

  const onLevelChange = (v) => { setGradeLevel(v); setClassroomId("ALL"); };

  const exportExcel = async () => {
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(branches.map((b) => ({ Şube: b.name, Sınıf: b.classroomCount, Öğrenci: b.studentCount, Teslim: b.submissionCount, Ortalama: b.avgPercent ?? "-" }))), "Şubeler");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(levels.map((l) => ({ Seviye: `${l.gradeLevel}. Seviye`, Sınıf: l.classroomCount, Öğrenci: l.studentCount, Teslim: l.submissionCount, Ortalama: l.avgPercent ?? "-" }))), "Seviyeler");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(classrooms.map((c) => ({ Sınıf: c.name, Şube: c.branchName, Seviye: c.gradeLevel, Öğrenci: c.studentCount, Ödev: c.assignmentCount, Teslim: c.submissionCount, Ortalama: c.avgPercent ?? "-" }))), "Sınıflar");
      XLSX.writeFile(wb, `esinif-rapor-${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch { toast.error("Excel oluşturulamadı"); }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center"><BarChart3 className="w-5 h-5 text-indigo-600" /></div>
          <div><h1 className="text-2xl font-bold text-slate-900">Raporlar</h1><p className="text-sm text-slate-500">{user?.school?.schoolName}</p></div>
        </div>
        <div className="flex items-center gap-2">
          <PeriodSelect value={periodId} onChange={setPeriodId} />
          <Button variant="outline" onClick={exportExcel} className="gap-2"><Download className="w-4 h-4" /> Excel</Button>
        </div>
      </div>

      {/* Filtre satırı */}
      <div className="rounded-xl border border-slate-200 bg-white p-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className="text-xs text-slate-500 mb-1 block">Zaman aralığı</label>
          <Select value={range} onValueChange={setRange}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{RANGES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent></Select>
        </div>
        <div>
          <label className="text-xs text-slate-500 mb-1 block">Seviye</label>
          <Select value={gradeLevel} onValueChange={onLevelChange}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">Tüm seviyeler</SelectItem>{grades.map((g) => <SelectItem key={g} value={String(g)}>{g}. Seviye</SelectItem>)}</SelectContent></Select>
        </div>
        <div>
          <label className="text-xs text-slate-500 mb-1 block">Sınıf</label>
          <Select value={classroomId} onValueChange={setClassroomId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">Tüm sınıflar</SelectItem>{classOptions.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select>
        </div>
        {isManager && (
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Zümre</label>
            <Select value={departmentId} onValueChange={setDepartmentId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">Tüm zümreler</SelectItem>{departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent></Select>
          </div>
        )}
      </div>

      {/* Sekmeler */}
      <div className="flex gap-1 border-b border-slate-200">
        {[
          { id: "branches", label: "Şubeler", icon: Building2 },
          { id: "levels", label: "Seviyeler", icon: Layers },
          { id: "classrooms", label: "Sınıflar", icon: GraduationCap },
        ].map((t) => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)} className={`px-4 py-2.5 min-h-10 text-sm font-medium border-b-2 -mb-px inline-flex items-center gap-1.5 ${tab === t.id ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-600 hover:text-slate-900"}`}>
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-14 bg-slate-100 rounded-xl animate-pulse" />)}</div>
      ) : (
        <>
          {/* Görsel dashboard — seçilen sekmeye uygun birim + konu + takvim grafikleri */}
          <Suspense fallback={<div className="h-64 bg-slate-100 rounded-xl animate-pulse" />}>
            <ReportCharts tab={tab} branches={branches} levels={levels} classrooms={classrooms} byDepartment={byDepartment} timeseries={timeseries} />
          </Suspense>

          {/* ŞUBELER */}
          {tab === "branches" && (
            <div className="space-y-5">
              {/* Highlights */}
              <div className="grid gap-4 md:grid-cols-2">
                <Card className="border-amber-200 bg-amber-50/40">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 text-amber-700 mb-2"><Trophy className="w-4 h-4" /><span className="text-sm font-semibold">En İyi Şube</span></div>
                    {highlights.bestBranch ? (
                      <div className="flex items-baseline justify-between">
                        <span className="font-semibold text-slate-900">{highlights.bestBranch.name}</span>
                        <span className={`text-xl font-bold ${avgClass(highlights.bestBranch.avgPercent)}`}>{fmtPct(highlights.bestBranch.avgPercent)}</span>
                      </div>
                    ) : <p className="text-sm text-slate-400">Veri yok</p>}
                  </CardContent>
                </Card>
                <Card className="border-indigo-200 bg-indigo-50/40">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 text-indigo-700 mb-2"><Award className="w-4 h-4" /><span className="text-sm font-semibold">Her Seviyede En İyi Sınıf</span></div>
                    {highlights.bestClassByLevel.length === 0 ? <p className="text-sm text-slate-400">Veri yok</p> : (
                      <div className="space-y-1">
                        {highlights.bestClassByLevel.map((x) => (
                          <div key={x.gradeLevel} className="flex items-center justify-between text-sm">
                            <span className="text-slate-500">{x.gradeLevel}. Seviye</span>
                            <span className="font-medium text-slate-800">{x.classroom.name} <span className="text-xs text-slate-400">({x.classroom.branchName})</span></span>
                            <span className={`font-semibold ${avgClass(x.classroom.avgPercent)}`}>{fmtPct(x.classroom.avgPercent)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
              <ReportTable
                cols={["Şube", "Sınıf", "Öğrenci", "Teslim", "Ortalama"]}
                rows={branches}
                empty="Şube verisi yok."
                render={(b) => [b.name, b.classroomCount, b.studentCount, b.submissionCount, <span className={`font-semibold ${avgClass(b.avgPercent)}`}>{fmtPct(b.avgPercent)}</span>]}
                keyOf={(b) => b.id}
              />
            </div>
          )}

          {/* SEVİYELER */}
          {tab === "levels" && (
            <ReportTable
              cols={["Seviye", "Sınıf", "Öğrenci", "Teslim", "Ortalama"]}
              rows={levels}
              empty="Seviye verisi yok."
              render={(l) => [`${l.gradeLevel}. Seviye`, l.classroomCount, l.studentCount, l.submissionCount, <span className={`font-semibold ${avgClass(l.avgPercent)}`}>{fmtPct(l.avgPercent)}</span>]}
              keyOf={(l) => l.gradeLevel}
            />
          )}

          {/* SINIFLAR */}
          {tab === "classrooms" && (
            <ReportTable
              cols={["Sınıf", "Şube", "Seviye", "Öğrenci", "Ödev", "Teslim", "Ortalama"]}
              rows={classrooms}
              empty="Sınıf verisi yok."
              onRowClick={(c) => setDetailFor(c)}
              render={(c) => [
                <span className="font-medium text-indigo-700 hover:underline">{c.name}</span>,
                c.branchName, `${c.gradeLevel}. Seviye`, c.studentCount, c.assignmentCount, c.submissionCount,
                <span className={`font-semibold ${avgClass(c.avgPercent)}`}>{fmtPct(c.avgPercent)}</span>,
              ]}
              keyOf={(c) => c.id}
            />
          )}
        </>
      )}

      {/* Sınıf detay */}
      <ClassroomDetailDialog classroom={detailFor} from={from} departmentId={filters.departmentId} onClose={() => setDetailFor(null)} />
    </div>
  );
}

// ── Ortak tablo ───────────────────────────────────────────────────────────────
function ReportTable({ cols, rows, render, keyOf, empty, onRowClick }) {
  if (!rows.length) return <p className="text-sm text-slate-400 py-8 text-center">{empty}</p>;
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-slate-600 text-xs">
          <tr>{cols.map((c, i) => <th key={c} className={`px-3 py-2 ${i === 0 ? "text-left" : "text-right"}`}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const cells = render(r);
            return (
              <tr key={keyOf(r)} className={`border-t border-slate-100 ${onRowClick ? "cursor-pointer hover:bg-slate-50" : ""}`} onClick={onRowClick ? () => onRowClick(r) : undefined}>
                {cells.map((cell, i) => <td key={i} className={`px-3 py-2 ${i === 0 ? "text-left" : "text-right"}`}>{cell}</td>)}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Sınıf detay diyaloğu ──────────────────────────────────────────────────────
function ClassroomDetailDialog({ classroom, from, departmentId, onClose }) {
  const { data, isLoading } = useQuery({
    queryKey: ["esinif", "report-classroom", classroom?.id, from, departmentId],
    queryFn: () => schoolApi.reports.classroom(classroom.id, { from, departmentId }),
    enabled: !!classroom,
  });
  return (
    <Dialog open={!!classroom} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><GraduationCap className="w-5 h-5 text-emerald-500" /> {classroom?.name} <span className="text-sm font-normal text-slate-400">· {classroom?.branchName} · {classroom?.gradeLevel}. Seviye</span></DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-10 bg-slate-100 rounded animate-pulse" />)}</div>
        ) : data ? (
          <div className="space-y-5">
            <div className="grid grid-cols-3 gap-3">
              {[
                { l: "Öğrenci", v: data.classroom.studentCount },
                { l: "Teslim", v: data.summary.submissionCount },
                { l: "Ortalama", v: fmtPct(data.summary.avgPercent), cls: avgClass(data.summary.avgPercent) },
              ].map((s) => <div key={s.l} className="rounded-lg border border-slate-200 p-3"><p className={`text-xl font-bold ${s.cls ?? "text-slate-900"}`}>{s.v}</p><p className="text-xs text-slate-500">{s.l}</p></div>)}
            </div>

            <DetailTable title="Öğrenci başarısı" cols={["Öğrenci", "Teslim", "Ortalama"]} rows={data.students} render={(s) => [s.name, s.submissionCount, fmtPct(s.avgPercent)]} empty="Bu aralıkta teslim yok." />
            <DetailTable title="Ödev bazında" cols={["Ödev", "Zümre", "Teslim", "Ortalama"]} rows={data.assignments} render={(a) => [a.title, a.department ?? "—", a.submissionCount, fmtPct(a.avgPercent)]} empty="Ödev yok." />
            <DetailTable title="Zümre bazında" cols={["Zümre", "Teslim", "Ortalama"]} rows={data.departments} render={(d) => [d.name, d.submissionCount, fmtPct(d.avgPercent)]} empty="Zümre verisi yok." />
          </div>
        ) : (
          <p className="text-sm text-slate-400 py-6 text-center flex items-center justify-center gap-2"><X className="w-4 h-4" /> Rapor yüklenemedi.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DetailTable({ title, cols, rows, render, empty }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-700 mb-1.5">{title}</h3>
      {rows.length === 0 ? <p className="text-xs text-slate-400 py-2">{empty}</p> : (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs"><tr>{cols.map((c, i) => <th key={c} className={`px-3 py-1.5 ${i === 0 ? "text-left" : "text-right"}`}>{c}</th>)}</tr></thead>
            <tbody>{rows.map((r, ri) => { const cells = render(r); return <tr key={ri} className="border-t border-slate-100">{cells.map((cell, i) => <td key={i} className={`px-3 py-1.5 ${i === 0 ? "text-left" : "text-right"}`}>{cell}</td>)}</tr>; })}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
