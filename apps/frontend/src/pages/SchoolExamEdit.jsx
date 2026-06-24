import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { school as schoolApi } from "@/api/dalClient";
import { useAuth } from "@/lib/AuthContext";
import { useAppNavigate, buildPageUrl } from "@/lib/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Save, ArrowLeft, ListChecks, ArrowDownUp, FileText, AlertCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

const TYPE_META = {
  TEST: { label: "Test", Icon: ListChecks, choice: true },
  TUNNEL: { label: "Tünel", Icon: ArrowDownUp, choice: true },
  WRITTEN: { label: "Yazılı", Icon: FileText, choice: false },
};
const emptyChoiceQ = () => ({ content: "", points: 1, options: [{ content: "", isCorrect: true }, { content: "", isCorrect: false }] });
const emptyWrittenQ = () => ({ content: "", points: 1, solutionText: "" });

/** E-Sınıf — sınav oluştur/düzenle (meta + soru editörü; TEST/TUNNEL şıklı, WRITTEN açık uçlu). */
export default function SchoolExamEdit() {
  const [params] = useSearchParams();
  const navigate = useAppNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const role = user?.school?.schoolRole;
  const urlId = params.get("id");
  const urlType = params.get("type");
  const [examId, setExamId] = useState(urlId || null);
  const examType = (urlType || "TEST").toUpperCase();

  const { data: exam, isLoading } = useQuery({
    queryKey: ["esinif", "exam", examId],
    queryFn: () => schoolApi.exams.get(examId),
    enabled: !!examId,
  });
  const type = exam?.examType || examType;
  const meta = TYPE_META[type] ?? TYPE_META.TEST;

  const [form, setForm] = useState({ title: "", subject: "", gradeLevel: "", topic: "", durationMinutes: "", poolVisibility: "DEPARTMENT" });
  const [questions, setQuestions] = useState([]);

  // Edit modunda yüklenince state'i doldur
  useEffect(() => {
    if (!exam) return;
    setForm({
      title: exam.title ?? "", subject: exam.subject ?? "", gradeLevel: exam.gradeLevel ?? "",
      topic: exam.topic ?? "", durationMinutes: exam.durationMinutes ?? "", poolVisibility: exam.poolVisibility ?? "DEPARTMENT",
    });
    setQuestions((exam.questions ?? []).map((q) => ({
      content: q.content, points: q.points ?? 1, mediaUrl: q.mediaUrl ?? "", solutionText: q.solutionText ?? "",
      options: (q.options ?? []).map((o) => ({ content: o.content, isCorrect: o.isCorrect })),
    })));
  }, [exam]);

  const createMeta = useMutation({
    mutationFn: () => schoolApi.exams.create({
      examType: type, title: form.title, subject: form.subject || undefined,
      gradeLevel: form.gradeLevel ? Number(form.gradeLevel) : undefined, topic: form.topic || undefined,
      durationMinutes: form.durationMinutes ? Number(form.durationMinutes) : undefined, poolVisibility: form.poolVisibility,
    }),
    onSuccess: (res) => { toast.success("Sınav oluşturuldu — şimdi soru ekleyin"); setExamId(res.id); navigate(buildPageUrl("SchoolExamEdit", { id: res.id }), { replace: true }); qc.invalidateQueries({ queryKey: ["esinif", "exam-pool"] }); },
    onError: (e) => toast.error(e?.response?.data?.message ?? "Oluşturulamadı"),
  });
  const updateMeta = useMutation({
    mutationFn: () => schoolApi.exams.update(examId, {
      title: form.title, subject: form.subject || undefined,
      gradeLevel: form.gradeLevel ? Number(form.gradeLevel) : null, topic: form.topic || null,
      durationMinutes: form.durationMinutes ? Number(form.durationMinutes) : null, poolVisibility: form.poolVisibility,
    }),
    onSuccess: () => { toast.success("Bilgiler kaydedildi"); qc.invalidateQueries({ queryKey: ["esinif", "exam", examId] }); },
    onError: (e) => toast.error(e?.response?.data?.message ?? "Kaydedilemedi"),
  });
  const saveQuestions = useMutation({
    mutationFn: () => schoolApi.exams.saveQuestions(examId, questions),
    onSuccess: (res) => { toast.success(`${res.saved} soru kaydedildi (${res.totalPoints} puan)`); qc.invalidateQueries({ queryKey: ["esinif", "exam", examId] }); qc.invalidateQueries({ queryKey: ["esinif", "exam-pool"] }); },
    onError: (e) => toast.error(e?.response?.data?.message ?? "Sorular kaydedilemedi"),
  });

  if (!role) return <div className="max-w-lg mx-auto text-center py-20"><AlertCircle className="w-12 h-12 mx-auto mb-3 text-slate-300" /><h2 className="text-xl font-semibold text-slate-900">Erişim yok</h2></div>;
  if (examId && isLoading) return <div className="max-w-3xl mx-auto py-20 text-center text-slate-400">Yükleniyor…</div>;
  if (exam && !exam.editable) return <div className="max-w-lg mx-auto text-center py-20"><AlertCircle className="w-12 h-12 mx-auto mb-3 text-slate-300" /><h2 className="text-xl font-semibold text-slate-900">Salt görüntüleme</h2><p className="text-slate-500 mt-2">Bu sınavı düzenleme yetkiniz yok.</p></div>;

  // Soru editörü yardımcıları
  const addQuestion = () => setQuestions((qs) => [...qs, meta.choice ? emptyChoiceQ() : emptyWrittenQ()]);
  const removeQuestion = (i) => setQuestions((qs) => qs.filter((_, idx) => idx !== i));
  const setQ = (i, patch) => setQuestions((qs) => qs.map((q, idx) => (idx === i ? { ...q, ...patch } : q)));
  const addOption = (i) => setQ(i, { options: [...questions[i].options, { content: "", isCorrect: false }] });
  const removeOption = (i, j) => setQ(i, { options: questions[i].options.filter((_, idx) => idx !== j) });
  const setOption = (i, j, patch) => setQ(i, { options: questions[i].options.map((o, idx) => (idx === j ? { ...o, ...patch } : o)) });
  const setCorrect = (i, j) => setQ(i, { options: questions[i].options.map((o, idx) => ({ ...o, isCorrect: idx === j })) });

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(buildPageUrl("SchoolExamPool"))} aria-label="Geri"><ArrowLeft className="w-5 h-5" /></Button>
        <div className="flex items-center gap-2">
          <Badge className="bg-indigo-100 text-indigo-700 gap-1"><meta.Icon className="w-3 h-3" /> {meta.label}</Badge>
          <h1 className="text-xl font-bold text-slate-900">{examId ? "Sınavı Düzenle" : "Yeni Sınav"}</h1>
        </div>
      </div>

      {/* Meta */}
      <Card>
        <CardContent className="p-5 space-y-3">
          <div><Label htmlFor="e-title">Başlık</Label><Input id="e-title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} maxLength={200} placeholder="Örn. 1. Ünite Değerlendirme" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label htmlFor="e-subject">Ders</Label><Input id="e-subject" value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} placeholder="(zümreden)" /></div>
            <div><Label htmlFor="e-grade">Sınıf seviyesi</Label><Input id="e-grade" type="number" min={1} max={12} value={form.gradeLevel} onChange={(e) => setForm((f) => ({ ...f, gradeLevel: e.target.value }))} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label htmlFor="e-topic">Konu</Label><Input id="e-topic" value={form.topic} onChange={(e) => setForm((f) => ({ ...f, topic: e.target.value }))} maxLength={120} /></div>
            <div><Label htmlFor="e-dur">Süre (dk, boş=süresiz)</Label><Input id="e-dur" type="number" min={0} value={form.durationMinutes} onChange={(e) => setForm((f) => ({ ...f, durationMinutes: e.target.value }))} /></div>
          </div>
          <div>
            <Label>Havuz görünürlüğü</Label>
            <Select value={form.poolVisibility} onValueChange={(v) => setForm((f) => ({ ...f, poolVisibility: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="DEPARTMENT">Sadece zümrem</SelectItem>
                <SelectItem value="SCHOOL">Tüm okul öğretmenleri</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end">
            {examId ? (
              <Button onClick={() => updateMeta.mutate()} disabled={updateMeta.isPending || !form.title.trim()} className="bg-indigo-600 hover:bg-indigo-700 gap-2"><Save className="w-4 h-4" /> Bilgileri Kaydet</Button>
            ) : (
              <Button onClick={() => createMeta.mutate()} disabled={createMeta.isPending || !form.title.trim()} className="bg-indigo-600 hover:bg-indigo-700 gap-2"><Plus className="w-4 h-4" /> Oluştur ve Soru Ekle</Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Soru editörü — yalnız sınav oluşturulduktan sonra */}
      {examId && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Sorular ({questions.length})</h2>
            <Button variant="outline" onClick={addQuestion} className="gap-1"><Plus className="w-4 h-4" /> Soru Ekle</Button>
          </div>

          {questions.length === 0 ? (
            <div className="text-center py-12 text-slate-400 border border-dashed border-slate-200 rounded-xl">Henüz soru yok. "Soru Ekle" ile başlayın.</div>
          ) : questions.map((q, i) => (
            <Card key={i}>
              <CardContent className="p-5 space-y-3">
                <div className="flex items-start gap-3">
                  <span className="mt-2 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-indigo-700 text-sm font-semibold">{i + 1}</span>
                  <div className="flex-1 space-y-3">
                    <Textarea value={q.content} onChange={(e) => setQ(i, { content: e.target.value })} rows={2} placeholder="Soru metni" maxLength={4000} />
                    <div className="flex items-center gap-3">
                      <Label className="text-xs text-slate-500">Puan</Label>
                      <Input type="number" min={1} value={q.points} onChange={(e) => setQ(i, { points: Number(e.target.value) || 1 })} className="w-20 h-8" />
                      <Button variant="ghost" size="sm" className="ml-auto text-rose-600 hover:bg-rose-50 gap-1" onClick={() => removeQuestion(i)}><Trash2 className="w-4 h-4" /> Soruyu sil</Button>
                    </div>

                    {meta.choice ? (
                      <div className="space-y-2">
                        {q.options.map((o, j) => (
                          <div key={j} className="flex items-center gap-2">
                            <button type="button" onClick={() => setCorrect(i, j)} aria-label="Doğru şık" className={`shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-full border ${o.isCorrect ? "bg-emerald-500 border-emerald-500 text-white" : "border-slate-300 text-transparent hover:border-emerald-400"}`}><CheckCircle2 className="w-4 h-4" /></button>
                            <Input value={o.content} onChange={(e) => setOption(i, j, { content: e.target.value })} placeholder={`${String.fromCharCode(65 + j)} şıkkı`} className="h-9" />
                            {q.options.length > 2 && <Button variant="ghost" size="icon" className="h-9 w-9 text-slate-400 hover:text-rose-600" onClick={() => removeOption(i, j)} aria-label="Şıkkı sil"><Trash2 className="w-4 h-4" /></Button>}
                          </div>
                        ))}
                        <Button variant="ghost" size="sm" className="gap-1 text-indigo-600" onClick={() => addOption(i)}><Plus className="w-3.5 h-3.5" /> Şık ekle</Button>
                        <p className="text-[11px] text-slate-400">Yeşil daire = doğru şık.</p>
                      </div>
                    ) : (
                      <div><Label className="text-xs text-slate-500">Çözüm / referans cevap (zorunlu)</Label><Textarea value={q.solutionText} onChange={(e) => setQ(i, { solutionText: e.target.value })} rows={2} placeholder="Öğretmen referans çözümü" maxLength={4000} /></div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          <div className="flex justify-end sticky bottom-4">
            <Button onClick={() => saveQuestions.mutate()} disabled={saveQuestions.isPending || questions.length === 0} className="bg-emerald-600 hover:bg-emerald-700 gap-2 shadow-lg"><Save className="w-4 h-4" /> {saveQuestions.isPending ? "Kaydediliyor…" : "Soruları Kaydet"}</Button>
          </div>
        </div>
      )}
    </div>
  );
}
