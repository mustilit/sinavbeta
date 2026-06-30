import { useState, useMemo, useRef, lazy, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { school as schoolApi } from "@/api/dalClient";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { BarChart3, Download, FileDown, Loader2, Building2, Layers, GraduationCap, Users, Search, Eye, AlertCircle, Trophy, Award, X } from "lucide-react";
import { toast } from "sonner";
import { PeriodSelect } from "@/components/school/PeriodSelect";
import { ComplianceReport } from "@/components/school/ComplianceReport";
import { exportElementToPdf } from "@/lib/reportPdf";

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

  const [mainTab, setMainTab] = useState("genel"); // genel | students (ana sekme)
  const [tab, setTab] = useState("branches"); // Genel alt sekmesi: branches | levels | classrooms
  const [range, setRange] = useState("all");
  const [gradeLevel, setGradeLevel] = useState("ALL");
  const [classroomId, setClassroomId] = useState("ALL");
  const [departmentId, setDepartmentId] = useState("ALL");
  const [subject, setSubject] = useState("ALL");
  const [periodId, setPeriodId] = useState("");
  const [detailFor, setDetailFor] = useState(null); // classroom row
  const [detailStudent, setDetailStudent] = useState(null); // Öğrenciler sekmesi detay pop-up
  const [studentQ, setStudentQ] = useState(""); // Öğrenciler sekmesi metin filtresi (no/ad)
  const [studentStatus, setStudentStatus] = useState("ALL"); // Öğrenci teslim durumu filtresi
  const [exporting, setExporting] = useState(false);
  const pageRef = useRef(null);

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
    subject: subject === "ALL" ? undefined : subject,
    periodId: periodId || undefined,
  };
  // Öğrenci sekmesi zümre filtresi kullanmaz — departmentId hariç tutulur.
  const studentFilters = { ...filters, departmentId: undefined };

  const { data, isLoading } = useQuery({
    queryKey: ["esinif", "report-breakdown", filters],
    queryFn: () => schoolApi.reports.breakdown(filters),
    enabled: canView && !!periodId,
  });

  // Öğrenciler sekmesi — öğrenci bazlı teslim durumu (yalnız sekme açıkken çekilir).
  const { data: studentsData, isLoading: studentsLoading } = useQuery({
    queryKey: ["esinif", "report-students", studentFilters],
    queryFn: () => schoolApi.reports.students(studentFilters),
    enabled: canView && !!periodId && mainTab === "students",
  });
  // Öğrenciler sekmesi satırları + client-side no/ad araması + teslim durumu filtresi (hook'lar erken return'den ÖNCE).
  const studentRows = useMemo(() => {
    let list = studentsData?.students ?? [];
    const needle = studentQ.trim().toLocaleLowerCase("tr");
    if (needle) list = list.filter((s) => `${s.studentNo} ${s.name}`.toLocaleLowerCase("tr").includes(needle));
    if (studentStatus === "onTime") list = list.filter((s) => (s.onTimeCount ?? 0) > 0);
    else if (studentStatus === "late") list = list.filter((s) => (s.lateCount ?? 0) > 0);
    else if (studentStatus === "notDone") list = list.filter((s) => (s.notDoneCount ?? 0) > 0);
    return list;
  }, [studentsData, studentQ, studentStatus]);

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
  const subjects = data?.subjects ?? [];
  // Sınıf öğretmeninin sorumlu olduğu sınıf(lar) — başlıkta gösterilir.
  const homeroomClassrooms = data?.homeroomClassrooms ?? [];
  const homeroomLabel = homeroomClassrooms.map((c) => c.name).join(", ");

  const onLevelChange = (v) => { setGradeLevel(v); setClassroomId("ALL"); };

  const exportPdf = async () => {
    if (!pageRef.current) return;
    setExporting(true);
    try {
      await exportElementToPdf(pageRef.current, { fileName: `esinif-rapor-${new Date().toISOString().slice(0, 10)}.pdf` });
    } catch (e) {
      console.error("Raporlar PDF export hatası:", e);
      toast.error("PDF oluşturulamadı");
    } finally {
      setExporting(false);
    }
  };

  // Excel — yalnız o an GÖRÜNEN listeyi indirir (açık ana/alt sekmeye göre).
  const exportExcel = async () => {
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();
      const stamp = new Date().toISOString().slice(0, 10);
      if (mainTab === "students") {
        const rows = studentRows.map((s) => ({
          "Öğrenci No": s.studentNo, "Ad Soyad": s.name, Sınıf: s.classroomName,
          Seviye: s.gradeLevel != null ? `${s.gradeLevel}. Seviye` : "-",
          Zamanında: s.onTimeCount ?? 0, Geç: s.lateCount ?? 0, Yapılmadı: s.notDoneCount ?? 0,
        }));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Öğrenciler");
        XLSX.writeFile(wb, `esinif-ogrenciler-${stamp}.xlsx`);
        return;
      }
      if (tab === "levels") {
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(levels.map((l) => ({ Seviye: `${l.gradeLevel}. Seviye`, Sınıf: l.classroomCount, Öğrenci: l.studentCount, Zamanında: l.onTimeCount ?? 0, Geç: l.lateCount ?? 0, Yapılmadı: l.notDoneCount ?? 0, Ortalama: l.avgPercent ?? "-" }))), "Seviyeler");
        XLSX.writeFile(wb, `esinif-seviyeler-${stamp}.xlsx`);
      } else if (tab === "classrooms") {
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(classrooms.map((c) => ({ Sınıf: c.name, Şube: c.branchName, Seviye: c.gradeLevel, Öğrenci: c.studentCount, Ödev: c.assignmentCount, Zamanında: c.onTimeCount ?? 0, Geç: c.lateCount ?? 0, Yapılmadı: c.notDoneCount ?? 0, Ortalama: c.avgPercent ?? "-" }))), "Sınıflar");
        XLSX.writeFile(wb, `esinif-siniflar-${stamp}.xlsx`);
      } else {
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(branches.map((b) => ({ Şube: b.name, Sınıf: b.classroomCount, Öğrenci: b.studentCount, Zamanında: b.onTimeCount ?? 0, Geç: b.lateCount ?? 0, Yapılmadı: b.notDoneCount ?? 0, Ortalama: b.avgPercent ?? "-" }))), "Şubeler");
        XLSX.writeFile(wb, `esinif-subeler-${stamp}.xlsx`);
      }
    } catch { toast.error("Excel oluşturulamadı"); }
  };

  return (
    <div ref={pageRef} className="max-w-5xl mx-auto space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center"><BarChart3 className="w-5 h-5 text-indigo-600" /></div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Raporlar{homeroomLabel ? ` · ${homeroomLabel}` : ""}</h1>
            <p className="text-sm text-slate-500">{user?.school?.schoolName}{homeroomLabel ? ` · Sınıf Öğretmeni (${homeroomLabel})` : ""}</p>
          </div>
        </div>
        <div className="flex items-center gap-2" data-html2canvas-ignore="true">
          <PeriodSelect value={periodId} onChange={setPeriodId} />
          <Button variant="outline" onClick={exportExcel} className="gap-2"><Download className="w-4 h-4" /> Excel</Button>
          <Button variant="outline" onClick={exportPdf} disabled={exporting} className="gap-2">{exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />} PDF</Button>
        </div>
      </div>

      {/* Ana sekmeler — Genel / Öğrenci (filtreler ortak) */}
      <div className="flex gap-1 border-b border-slate-200">
        {[
          { id: "genel", label: "Genel", icon: BarChart3 },
          { id: "students", label: "Öğrenci", icon: Users },
        ].map((t) => (
          <button key={t.id} type="button" onClick={() => setMainTab(t.id)} className={`px-4 py-2.5 min-h-10 text-sm font-semibold border-b-2 -mb-px inline-flex items-center gap-1.5 ${mainTab === t.id ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-600 hover:text-slate-900"}`}>
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {/* Filtre satırı — PDF çıktısına dahil edilmez */}
      <div className="rounded-xl border border-slate-200 bg-white p-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-html2canvas-ignore="true">
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
        <div>
          <label className="text-xs text-slate-500 mb-1 block">Ders</label>
          <Select value={subject} onValueChange={setSubject}><SelectTrigger><SelectValue placeholder="Ders" /></SelectTrigger><SelectContent><SelectItem value="ALL">Tüm dersler</SelectItem>{subjects.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
        </div>
        {isManager && mainTab !== "students" && (
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Zümre</label>
            <Select value={departmentId} onValueChange={setDepartmentId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">Tüm zümreler</SelectItem>{departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent></Select>
          </div>
        )}
      </div>

      {mainTab === "students" ? (
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-2" data-html2canvas-ignore="true">
            <div className="relative flex-1 sm:max-w-xs">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <Input value={studentQ} onChange={(e) => setStudentQ(e.target.value)} placeholder="Öğrenci no veya ad ara…" className="pl-9" aria-label="Öğrenci ara" />
            </div>
            <Select value={studentStatus} onValueChange={setStudentStatus}>
              <SelectTrigger className="w-full sm:w-56"><SelectValue placeholder="Teslim durumu" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Tüm teslim durumları</SelectItem>
                <SelectItem value="onTime">Zamanında teslim edenler</SelectItem>
                <SelectItem value="late">Geç teslim edenler</SelectItem>
                <SelectItem value="notDone">Yapmayanlar (süresi geçen)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {studentsLoading ? (
            <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-12 bg-slate-100 rounded-xl animate-pulse" />)}</div>
          ) : studentRows.length === 0 ? (
            <p className="text-sm text-slate-400 py-8 text-center">{studentQ.trim() || studentStatus !== "ALL" ? "Aramaya/filtreye uygun öğrenci yok." : "Bu filtrede öğrenci bulunamadı."}</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-600 text-xs">
                  <tr>
                    {["Öğrenci No", "Ad Soyad", "Sınıf", "Seviye"].map((c) => <th key={c} className="px-3 py-2 text-left">{c}</th>)}
                    {["Zamanında", "Geç", "Yapılmadı"].map((c) => <th key={c} className="px-3 py-2 text-right">{c}</th>)}
                    <th className="px-3 py-2 text-right">Detay</th>
                  </tr>
                </thead>
                <tbody>
                  {studentRows.map((s) => (
                    <tr key={s.studentNo} className="border-t border-slate-100">
                      <td className="px-3 py-2 font-mono text-slate-700">{s.studentNo}</td>
                      <td className="px-3 py-2 text-slate-800">{s.name}</td>
                      <td className="px-3 py-2 text-slate-600">{s.classroomName}</td>
                      <td className="px-3 py-2 text-slate-600">{s.gradeLevel != null ? `${s.gradeLevel}. Seviye` : "—"}</td>
                      <td className="px-3 py-2 text-right font-medium text-emerald-600">{s.onTimeCount}</td>
                      <td className="px-3 py-2 text-right font-medium text-amber-600">{s.lateCount}</td>
                      <td className="px-3 py-2 text-right font-medium text-rose-600">{s.notDoneCount}</td>
                      <td className="px-3 py-2 text-right">
                        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`${s.name} detay`} title="Detaylı inceleme" onClick={() => setDetailStudent(s)}>
                          <Eye className="w-4 h-4 text-indigo-600" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {studentsData?.capped && <p className="text-xs text-amber-600">İlk 1000 öğrenci gösteriliyor — listeyi daraltmak için filtre kullanın.</p>}
        </div>
      ) : (
        <>
          {/* Ödev uyumu — teslim durumu + süre kontrolü (yetki alanına göre) */}
          <ComplianceReport />

          {/* Genel alt sekmeleri */}
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
                cols={["Şube", "Sınıf", "Öğrenci", "Zamanında", "Geç", "Yapılmadı", "Ortalama"]}
                rows={branches}
                empty="Şube verisi yok."
                render={(b) => [b.name, b.classroomCount, b.studentCount,
                  <span className="font-medium text-emerald-600">{b.onTimeCount ?? 0}</span>,
                  <span className="font-medium text-amber-600">{b.lateCount ?? 0}</span>,
                  <span className="font-medium text-rose-600">{b.notDoneCount ?? 0}</span>,
                  <span className={`font-semibold ${avgClass(b.avgPercent)}`}>{fmtPct(b.avgPercent)}</span>]}
                keyOf={(b) => b.id}
              />
            </div>
          )}

          {/* SEVİYELER */}
          {tab === "levels" && (
            <ReportTable
              cols={["Seviye", "Sınıf", "Öğrenci", "Zamanında", "Geç", "Yapılmadı", "Ortalama"]}
              rows={levels}
              empty="Seviye verisi yok."
              render={(l) => [`${l.gradeLevel}. Seviye`, l.classroomCount, l.studentCount,
                <span className="font-medium text-emerald-600">{l.onTimeCount ?? 0}</span>,
                <span className="font-medium text-amber-600">{l.lateCount ?? 0}</span>,
                <span className="font-medium text-rose-600">{l.notDoneCount ?? 0}</span>,
                <span className={`font-semibold ${avgClass(l.avgPercent)}`}>{fmtPct(l.avgPercent)}</span>]}
              keyOf={(l) => l.gradeLevel}
            />
          )}

          {/* SINIFLAR */}
          {tab === "classrooms" && (
            <ReportTable
              cols={["Sınıf", "Şube", "Seviye", "Öğrenci", "Ödev", "Zamanında", "Geç", "Yapılmadı", "Ortalama"]}
              rows={classrooms}
              empty="Sınıf verisi yok."
              onRowClick={(c) => setDetailFor(c)}
              render={(c) => [
                <span className="font-medium text-indigo-700 hover:underline">{c.name}</span>,
                c.branchName, `${c.gradeLevel}. Seviye`, c.studentCount, c.assignmentCount,
                <span className="font-medium text-emerald-600">{c.onTimeCount ?? 0}</span>,
                <span className="font-medium text-amber-600">{c.lateCount ?? 0}</span>,
                <span className="font-medium text-rose-600">{c.notDoneCount ?? 0}</span>,
                <span className={`font-semibold ${avgClass(c.avgPercent)}`}>{fmtPct(c.avgPercent)}</span>,
              ]}
              keyOf={(c) => c.id}
            />
          )}
            </>
          )}
        </>
      )}

      {/* Sınıf detay */}
      <ClassroomDetailDialog classroom={detailFor} from={from} departmentId={filters.departmentId} subject={filters.subject} onClose={() => setDetailFor(null)} />
      {/* Öğrenci detay (ödev-ödev) — zümre filtresi uygulanmaz */}
      <StudentDetailDialog student={detailStudent} filters={studentFilters} onClose={() => setDetailStudent(null)} />
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
function ClassroomDetailDialog({ classroom, from, departmentId, subject, onClose }) {
  const { data, isLoading } = useQuery({
    queryKey: ["esinif", "report-classroom", classroom?.id, from, departmentId, subject],
    queryFn: () => schoolApi.reports.classroom(classroom.id, { from, departmentId, subject }),
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

// ── Öğrenci detay diyaloğu (ödev-ödev başarım/teslim) ─────────────────────────
const SD_STATUS = {
  onTime: { label: "Zamanında", cls: "bg-emerald-100 text-emerald-700" },
  late: { label: "Geç", cls: "bg-amber-100 text-amber-700" },
  notDone: { label: "Yapılmadı", cls: "bg-rose-100 text-rose-700" },
  inProgress: { label: "Devam ediyor", cls: "bg-blue-100 text-blue-700" },
  pending: { label: "Bekliyor", cls: "bg-slate-100 text-slate-600" },
};
const fmtDateTime = (iso) => { try { return new Date(iso).toLocaleString("tr-TR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); } catch { return "—"; } };

function StudentDetailDialog({ student, filters, onClose }) {
  const detailRef = useRef(null);
  const [exporting, setExporting] = useState(false);
  const sid = student?.studentUserId;
  const { data, isLoading } = useQuery({
    queryKey: ["esinif", "report-student-detail", sid, filters],
    queryFn: () => schoolApi.reports.studentDetail(sid, { from: filters.from, departmentId: filters.departmentId, periodId: filters.periodId, subject: filters.subject }),
    enabled: !!sid,
  });
  const exportPdf = async () => {
    if (!detailRef.current) return;
    setExporting(true);
    try {
      await exportElementToPdf(detailRef.current, { fileName: `ogrenci-${student?.studentNo || "rapor"}.pdf` });
    } catch (e) {
      console.error("Öğrenci detay PDF export hatası:", e);
      toast.error("PDF oluşturulamadı");
    } finally {
      setExporting(false);
    }
  };
  return (
    <Dialog open={!!student} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-2 pr-6">
            <span className="flex items-center gap-2"><Users className="w-5 h-5 text-indigo-500" /> {student?.name} <span className="text-sm font-normal text-slate-400">· {student?.studentNo} · {student?.classroomName}</span></span>
            <Button variant="outline" size="sm" className="gap-1.5" disabled={exporting || isLoading} onClick={exportPdf} data-html2canvas-ignore="true">
              {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />} PDF
            </Button>
          </DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-10 bg-slate-100 rounded animate-pulse" />)}</div>
        ) : data ? (
          <div ref={detailRef} className="space-y-4 bg-white p-1">
            {/* PDF'e de girsin: öğrenci kimliği (isim · no · sınıf · seviye) */}
            <div className="border-b border-slate-200 pb-2">
              <p className="text-base font-semibold text-slate-900">{data.student?.name ?? student?.name}</p>
              <p className="text-xs text-slate-500">
                {data.student?.studentNo ?? student?.studentNo}
                {(data.student?.classroomName ?? student?.classroomName) ? ` · ${data.student?.classroomName ?? student?.classroomName}` : ""}
                {(data.student?.gradeLevel ?? student?.gradeLevel) != null ? ` · ${data.student?.gradeLevel ?? student?.gradeLevel}. Seviye` : ""}
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[
                { l: "Zamanında", v: data.summary.onTime, cls: "text-emerald-600" },
                { l: "Geç", v: data.summary.late, cls: "text-amber-600" },
                { l: "Yapılmadı", v: data.summary.notDone, cls: "text-rose-600" },
              ].map((s) => <div key={s.l} className="rounded-lg border border-slate-200 p-3 text-center"><p className={`text-xl font-bold ${s.cls}`}>{s.v}</p><p className="text-xs text-slate-500">{s.l}</p></div>)}
            </div>
            {data.assignments.length === 0 ? (
              <p className="text-sm text-slate-400 py-6 text-center">Bu filtrede ödev yok.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-600 text-xs">
                    <tr>
                      <th className="px-3 py-1.5 text-left">Ödev</th>
                      <th className="px-3 py-1.5 text-left">Ders</th>
                      <th className="px-3 py-1.5 text-left">Son Teslim</th>
                      <th className="px-3 py-1.5 text-left">Teslim</th>
                      <th className="px-3 py-1.5 text-left">Durum</th>
                      <th className="px-3 py-1.5 text-right">Puan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.assignments.map((a, i) => {
                      const st = SD_STATUS[a.status] ?? SD_STATUS.pending;
                      return (
                        <tr key={i} className="border-t border-slate-100">
                          <td className="px-3 py-1.5 text-slate-800">{a.assignmentTitle}</td>
                          <td className="px-3 py-1.5 text-slate-600">{a.subject ?? "—"}</td>
                          <td className="px-3 py-1.5 text-slate-600">{a.dueDate ? fmtDateTime(a.dueDate) : "—"}</td>
                          <td className="px-3 py-1.5 text-slate-600">{a.submittedAt ? fmtDateTime(a.submittedAt) : "—"}</td>
                          <td className="px-3 py-1.5"><span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${st.cls}`}>{st.label}</span></td>
                          <td className="px-3 py-1.5 text-right text-slate-700">{a.score != null ? `${a.score}/${a.maxScore ?? "—"}` : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-slate-400 py-6 text-center flex items-center justify-center gap-2"><X className="w-4 h-4" /> Detay yüklenemedi.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
