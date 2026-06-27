import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { school as schoolApi } from "@/api/dalClient";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Upload, Download, KeyRound, Copy, Check } from "lucide-react";
import { toast } from "sonner";

/** Excel (Ad + Soyad + opsiyonel No) → [{firstName, lastName, studentNo?}]. */
export async function parseStudentRows(file) {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return [];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: "" });
  if (!rows.length) return [];
  const norm = (v) => String(v ?? "").trim().toLocaleLowerCase("tr");
  const header = (rows[0] || []).map(norm);
  const AD = ["ad", "adı", "isim", "öğrenci adı", "first name", "firstname", "name"];
  const SOYAD = ["soyad", "soyadı", "öğrenci soyadı", "surname", "last name", "lastname"];
  const NO = ["no", "numara", "öğrenci no", "öğrenci numarası", "okul no", "number", "studentno", "öğrenci numara"];
  const adIdx = header.findIndex((h) => AD.includes(h));
  const soyadIdx = header.findIndex((h) => SOYAD.includes(h));
  const noIdx = header.findIndex((h) => NO.includes(h));
  const out = [];
  if (adIdx !== -1 || soyadIdx !== -1) {
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i] || [];
      const fn = adIdx !== -1 ? String(r[adIdx] ?? "").trim() : "";
      const ln = soyadIdx !== -1 ? String(r[soyadIdx] ?? "").trim() : "";
      const no = noIdx !== -1 ? String(r[noIdx] ?? "").trim() : "";
      if (fn || ln) out.push({ firstName: fn, lastName: ln, studentNo: no || undefined });
    }
    return out;
  }
  const looksHeader = header.some((h) => /ad|soyad|isim|name|surname|no|numara/.test(h));
  const dataRows = looksHeader ? rows.slice(1) : rows;
  for (const r of dataRows) {
    const c0 = String(r?.[0] ?? "").trim();
    const c1 = String(r?.[1] ?? "").trim();
    const c2 = String(r?.[2] ?? "").trim();
    if (c1) out.push({ firstName: c0, lastName: c1, studentNo: c2 || undefined });
    else if (c0) {
      const parts = c0.split(/\s+/);
      const lastName = parts.length > 1 ? parts.pop() : "";
      out.push({ firstName: parts.join(" "), lastName });
    }
  }
  return out;
}

export async function downloadStudentTemplate() {
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.aoa_to_sheet([["Ad", "Soyad", "Öğrenci No"], ["Ahmet", "Yılmaz", "101"], ["Ayşe", "Demir", "102"]]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Öğrenciler");
  XLSX.writeFile(wb, "ogrenci-sablonu.xlsx");
}

/** Toplu oluşturulan öğrenci kimlik bilgileri (tek sefer görünür). */
export function BulkCredentialsDialog({ creds, onClose }) {
  const [copied, setCopied] = useState(false);
  if (!creds) return null;

  const copyAll = async () => {
    const text = creds.map((c) => `${c.name}\t${c.studentNo ?? ""}\t${c.username}\t${c.tempPassword}`).join("\n");
    try { await navigator.clipboard.writeText(`Ad Soyad\tÖğrenci No\tKullanıcı adı\tŞifre\n${text}`); setCopied(true); toast.success("Panoya kopyalandı"); setTimeout(() => setCopied(false), 1500); }
    catch { toast.error("Kopyalanamadı"); }
  };
  const exportExcel = async () => {
    try {
      const XLSX = await import("xlsx");
      const ws = XLSX.utils.aoa_to_sheet([["Ad Soyad", "Öğrenci No", "Kullanıcı adı", "Şifre"], ...creds.map((c) => [c.name, c.studentNo ?? "", c.username, c.tempPassword])]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Öğrenciler");
      XLSX.writeFile(wb, `ogrenci-sifreleri-${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch { toast.error("Excel oluşturulamadı"); }
  };

  return (
    <Dialog open={!!creds} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700"><KeyRound className="h-4 w-4" /></span>
            Oluşturulan Öğrenciler ({creds.length})
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
          Geçici şifreler yalnızca şimdi görünür. İndirin veya kopyalayın; öğrencilere güvenli şekilde iletin.
        </p>
        <div className="flex gap-2">
          <Button onClick={exportExcel} className="bg-indigo-600 hover:bg-indigo-700 gap-2"><Download className="w-4 h-4" /> Excel indir</Button>
          <Button variant="outline" onClick={copyAll} className="gap-2">{copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />} Kopyala</Button>
        </div>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs"><tr><th className="px-3 py-2 text-left">Ad Soyad</th><th className="px-3 py-2 text-left">No</th><th className="px-3 py-2 text-left">Kullanıcı adı</th><th className="px-3 py-2 text-left">Şifre</th></tr></thead>
            <tbody>
              {creds.map((c, i) => (
                <tr key={i} className="border-t border-slate-100">
                  <td className="px-3 py-2">{c.name || "—"}</td>
                  <td className="px-3 py-2 text-slate-500">{c.studentNo || "—"}</td>
                  <td className="px-3 py-2 font-mono">{c.username}</td>
                  <td className="px-3 py-2 font-mono font-semibold text-slate-900">{c.tempPassword}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <DialogFooter><Button onClick={onClose} className="bg-indigo-600 hover:bg-indigo-700">Tamam</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Sınıf seçip Excel ile toplu öğrenci ekleme diyaloğu (okul-geneli ekranlar için). */
export function StudentImportDialog({ open, onClose, onCreated }) {
  const [classroomId, setClassroomId] = useState("");
  const fileRef = useRef(null);
  const { data: classrooms = [] } = useQuery({
    queryKey: ["esinif", "classrooms", "import-pick"],
    queryFn: () => schoolApi.listClassrooms(),
    enabled: open,
  });
  const bulk = useMutation({
    mutationFn: (rows) => schoolApi.bulkCreateStudents(classroomId, rows),
    onSuccess: (res) => { toast.success(`${res?.count ?? 0} öğrenci oluşturuldu`); onCreated(res?.created ?? []); setClassroomId(""); onClose(); },
    onError: (e) => toast.error(e?.response?.data?.message ?? "Öğrenciler eklenemedi"),
  });

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!classroomId) { toast.error("Önce sınıf seçin"); return; }
    try {
      const rows = await parseStudentRows(file);
      if (!rows.length) { toast.error("Geçerli Ad/Soyad satırı bulunamadı"); return; }
      bulk.mutate(rows);
    } catch {
      toast.error("Excel okunamadı");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Öğrenci Ekle (Excel ile toplu)</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Sınıf</Label>
            <Select value={classroomId} onValueChange={setClassroomId}>
              <SelectTrigger><SelectValue placeholder="Öğrencilerin ekleneceği sınıfı seçin" /></SelectTrigger>
              <SelectContent>
                {classrooms.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}{c.gradeLevel ? ` · ${c.gradeLevel}. sınıf` : ""}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-3 space-y-2">
            <p className="text-xs text-slate-500">Ad, Soyad (ve opsiyonel Öğrenci No) sütunlu dosya yükleyin; sistem her öğrenci için kullanıcı adı + geçici şifre üretir, seçilen sınıfa ekler.</p>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={handleFile} />
            <div className="flex gap-2">
              <Button type="button" size="sm" onClick={() => { if (!classroomId) { toast.error("Önce sınıf seçin"); return; } fileRef.current?.click(); }} disabled={bulk.isPending} className="bg-indigo-600 hover:bg-indigo-700 gap-1.5">
                <Upload className="w-3.5 h-3.5" /> {bulk.isPending ? "Yükleniyor…" : "Excel Seç"}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={downloadStudentTemplate} className="text-slate-500 gap-1.5">
                <Download className="w-3.5 h-3.5" /> Şablon indir
              </Button>
            </div>
          </div>
        </div>
        <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Kapat</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
