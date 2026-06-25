import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { school as schoolApi } from "@/api/dalClient";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart3, Download, Building2, BookOpen, AlertCircle } from "lucide-react";
import { toast } from "sonner";

const fmtPct = (p) => (p == null ? "—" : `%${p}`);

/** E-Sınıf — Raporlar (okul geneli + şube kırılımı). Excel dışa aktarım. */
export default function SchoolReports() {
  const { user } = useAuth();
  const role = user?.school?.schoolRole;
  const isSchoolAdmin = role === "SCHOOL_ADMIN";
  const isBranchAdmin = role === "BRANCH_ADMIN";
  const [branchId, setBranchId] = useState(isBranchAdmin ? user?.school?.branchId ?? "" : "");

  const { data: overview } = useQuery({ queryKey: ["esinif", "report-overview"], queryFn: schoolApi.reports.overview, enabled: isSchoolAdmin });
  const { data: branches = [] } = useQuery({ queryKey: ["esinif", "branches"], queryFn: schoolApi.listBranches, enabled: isSchoolAdmin });
  const { data: branchReport } = useQuery({ queryKey: ["esinif", "report-branch", branchId], queryFn: () => schoolApi.reports.branch(branchId), enabled: !!branchId });

  if (!isSchoolAdmin && !isBranchAdmin) {
    return <div className="max-w-lg mx-auto text-center py-20"><AlertCircle className="w-12 h-12 mx-auto mb-3 text-slate-300" /><h2 className="text-xl font-semibold text-slate-900">Erişim yok</h2></div>;
  }

  const exportExcel = async () => {
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();
      if (overview) {
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(overview.branches.map((b) => ({ Şube: b.name, Sınıf: b.classroomCount, Öğrenci: b.studentCount, Ödev: b.assignmentCount, Ortalama: b.avgPercent ?? "-" }))), "Şubeler");
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(overview.departments.map((d) => ({ Zümre: d.name, Sınav: d.examCount, Ödev: d.assignmentCount, Ortalama: d.avgPercent ?? "-" }))), "Zümreler");
      }
      if (branchReport) {
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(branchReport.classrooms.map((c) => ({ Sınıf: c.name, Seviye: c.gradeLevel, Öğrenci: c.studentCount, Ödev: c.assignmentCount, Teslim: c.submissionCount, Ortalama: c.avgPercent ?? "-" }))), branchReport.branchName.slice(0, 28));
      }
      XLSX.writeFile(wb, `esinif-rapor-${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch { toast.error("Excel oluşturulamadı"); }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center"><BarChart3 className="w-5 h-5 text-indigo-600" /></div>
          <div><h1 className="text-2xl font-bold text-slate-900">Raporlar</h1><p className="text-sm text-slate-500">{user?.school?.schoolName}</p></div>
        </div>
        <Button variant="outline" onClick={exportExcel} className="gap-2"><Download className="w-4 h-4" /> Excel</Button>
      </div>

      {isSchoolAdmin && overview && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { l: "Şube", v: overview.overall.branchCount },
              { l: "Sınıf", v: overview.overall.classroomCount },
              { l: "Ödev", v: overview.overall.assignmentCount },
              { l: "Genel ortalama", v: fmtPct(overview.overall.avgPercent) },
            ].map((s) => <Card key={s.l}><CardContent className="p-4"><p className="text-2xl font-bold text-slate-900">{s.v}</p><p className="text-xs text-slate-500">{s.l}</p></CardContent></Card>)}
          </div>

          <div>
            <h2 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-1.5"><Building2 className="w-4 h-4" /> Şube performansı</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-600 text-xs"><tr><th className="px-3 py-2 text-left">Şube</th><th className="px-3 py-2 text-right">Sınıf</th><th className="px-3 py-2 text-right">Öğrenci</th><th className="px-3 py-2 text-right">Ödev</th><th className="px-3 py-2 text-right">Ortalama</th></tr></thead>
                <tbody>{overview.branches.map((b) => <tr key={b.id} className="border-t border-slate-100"><td className="px-3 py-2 font-medium text-slate-900">{b.name}</td><td className="px-3 py-2 text-right">{b.classroomCount}</td><td className="px-3 py-2 text-right">{b.studentCount}</td><td className="px-3 py-2 text-right">{b.assignmentCount}</td><td className="px-3 py-2 text-right font-medium">{fmtPct(b.avgPercent)}</td></tr>)}</tbody>
              </table>
            </div>
          </div>

          <div>
            <h2 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-1.5"><BookOpen className="w-4 h-4" /> Zümre performansı</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-600 text-xs"><tr><th className="px-3 py-2 text-left">Zümre</th><th className="px-3 py-2 text-right">Sınav</th><th className="px-3 py-2 text-right">Ödev</th><th className="px-3 py-2 text-right">Ortalama</th></tr></thead>
                <tbody>{overview.departments.map((d) => <tr key={d.id} className="border-t border-slate-100"><td className="px-3 py-2 font-medium text-slate-900">{d.name}</td><td className="px-3 py-2 text-right">{d.examCount}</td><td className="px-3 py-2 text-right">{d.assignmentCount}</td><td className="px-3 py-2 text-right font-medium">{fmtPct(d.avgPercent)}</td></tr>)}</tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Şube detay (okul yöneticisi seçer; şube yöneticisi otomatik kendi) */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-slate-700">Sınıf bazlı rapor</h2>
          {isSchoolAdmin && (
            <Select value={branchId} onValueChange={setBranchId}>
              <SelectTrigger className="w-56"><SelectValue placeholder="Şube seç" /></SelectTrigger>
              <SelectContent>{branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
            </Select>
          )}
        </div>
        {branchReport ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600 text-xs"><tr><th className="px-3 py-2 text-left">Sınıf</th><th className="px-3 py-2 text-right">Seviye</th><th className="px-3 py-2 text-right">Öğrenci</th><th className="px-3 py-2 text-right">Ödev</th><th className="px-3 py-2 text-right">Teslim</th><th className="px-3 py-2 text-right">Ortalama</th></tr></thead>
              <tbody>{branchReport.classrooms.map((c) => <tr key={c.id} className="border-t border-slate-100"><td className="px-3 py-2 font-medium text-slate-900">{c.name}</td><td className="px-3 py-2 text-right">{c.gradeLevel}</td><td className="px-3 py-2 text-right">{c.studentCount}</td><td className="px-3 py-2 text-right">{c.assignmentCount}</td><td className="px-3 py-2 text-right">{c.submissionCount}</td><td className="px-3 py-2 text-right font-medium">{fmtPct(c.avgPercent)}</td></tr>)}</tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-slate-400 py-4">{isSchoolAdmin ? "Detay için bir şube seçin." : "Rapor yükleniyor…"}</p>
        )}
      </div>
    </div>
  );
}
