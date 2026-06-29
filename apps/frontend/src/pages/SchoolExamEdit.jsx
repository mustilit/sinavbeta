import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useAutoSave } from "@/lib/useAutoSave";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { school as schoolApi } from "@/api/dalClient";
import { useAuth } from "@/lib/AuthContext";
import { useAppNavigate, buildPageUrl } from "@/lib/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Save, ArrowLeft, ListChecks, ArrowDownUp, FileText, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { SchoolExamQuestionsEditor, toLocalQuestions } from "@/components/school/SchoolExamQuestionsEditor";
import { SchoolTunnelEditor, toLocalTunnelQuestions, uploadPendingTunnelImages } from "@/components/school/SchoolTunnelEditor";

const TYPE_META = {
  TEST: { label: "Test", Icon: ListChecks, choice: true },
  TUNNEL: { label: "Tünel", Icon: ArrowDownUp, choice: true },
  WRITTEN: { label: "Yazılı", Icon: FileText, choice: false },
};

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
  // Referans listeleri: Ders (okul dersleri), Sınıf seviyesi (okul seviyeleri), Konu (admin)
  const { data: subjects = [] } = useQuery({ queryKey: ["esinif", "subjects"], queryFn: schoolApi.listSubjects, enabled: !!role });
  const { data: levels = [] } = useQuery({ queryKey: ["esinif", "levels"], queryFn: schoolApi.listLevels, enabled: !!role });
  const { data: topics = [] } = useQuery({ queryKey: ["esinif", "topics"], queryFn: schoolApi.listTopics, enabled: !!role });
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
    if (exam.examType === "TUNNEL") setQuestions(toLocalTunnelQuestions(exam.questions, exam.optionsPerQuestion ?? 10));
    else setQuestions(toLocalQuestions(exam.questions, exam.examType === "TEST"));
  }, [exam]);

  // ── Veri kaybı önleme: soru/meta taslağı (localStorage + beforeunload/visibility) ──
  // Kaydedilmemiş sorular yalnız React state'inde; ekran kapanınca/yenilenince kaybolmasın.
  const draftKey = examId
    ? `schoolExam_${examId}`
    : (user?.id ? `schoolExamNew_${user.id}_${type}` : null);
  const [draftReady, setDraftReady] = useState(false);
  const restoredRef = useRef(false);
  const { scheduleSave, loadDraft, clearDraft } = useAutoSave(
    draftKey ?? "__noop__",
    () => ({ form, questions }),
    { enabled: draftReady && !!draftKey, serverKey: null },
  );

  // Mount'ta taslağı geri yükle (edit modunda önce sunucu verisi yüklensin).
  useEffect(() => {
    if (restoredRef.current || !draftKey) return;
    if (examId && !exam) return; // edit: sunucu sınavı gelene kadar bekle
    restoredRef.current = true;
    (async () => {
      try {
        const draft = await loadDraft();
        if (draft && (Array.isArray(draft.questions) && draft.questions.length || draft.form?.title)) {
          if (draft.form) setForm((f) => ({ ...f, ...draft.form }));
          if (Array.isArray(draft.questions)) setQuestions(draft.questions);
          toast.info("Kaydedilmemiş taslağın geri yüklendi.");
        }
      } finally {
        setDraftReady(true);
      }
    })();
  }, [draftKey, examId, exam, loadDraft]);

  // Form/soru değişince taslağı kaydet (yalnız restore tamamlandıktan sonra).
  useEffect(() => {
    if (!draftReady || !draftKey) return;
    scheduleSave();
  }, [form, questions, draftReady, draftKey, scheduleSave]);

  const createMeta = useMutation({
    mutationFn: () => schoolApi.exams.create({
      examType: type, title: form.title, subject: form.subject || undefined,
      gradeLevel: form.gradeLevel ? Number(form.gradeLevel) : undefined, topic: form.topic || undefined,
      durationMinutes: form.durationMinutes ? Number(form.durationMinutes) : undefined, poolVisibility: form.poolVisibility,
    }),
    onSuccess: (res) => { toast.success("Sınav oluşturuldu — şimdi soru ekleyin"); clearDraft(); setExamId(res.id); navigate(buildPageUrl("SchoolExamEdit", { id: res.id }), { replace: true }); qc.invalidateQueries({ queryKey: ["esinif", "exam-pool"] }); },
    onError: (e) => toast.error(e?.response?.data?.message ?? "Oluşturulamadı"),
  });
  const updateMeta = useMutation({
    mutationFn: () => schoolApi.exams.update(examId, {
      title: form.title, subject: form.subject || undefined,
      gradeLevel: form.gradeLevel ? Number(form.gradeLevel) : null, topic: form.topic || null,
      durationMinutes: form.durationMinutes ? Number(form.durationMinutes) : null, poolVisibility: form.poolVisibility,
    }),
    onSuccess: () => { toast.success("Bilgiler kaydedildi"); clearDraft(); qc.invalidateQueries({ queryKey: ["esinif", "exam", examId] }); },
    onError: (e) => toast.error(e?.response?.data?.message ?? "Kaydedilemedi"),
  });
  const saveQuestions = useMutation({
    mutationFn: async () => {
      const payload = type === "TUNNEL" ? await uploadPendingTunnelImages(questions) : questions;
      return schoolApi.exams.saveQuestions(examId, payload);
    },
    onSuccess: (res) => { toast.success(`${res.saved} soru kaydedildi (${res.totalPoints} puan)`); clearDraft(); qc.invalidateQueries({ queryKey: ["esinif", "exam", examId] }); qc.invalidateQueries({ queryKey: ["esinif", "exam-pool"] }); },
    onError: (e) => toast.error(e?.response?.data?.message ?? "Sorular kaydedilemedi"),
  });

  if (!role) return <div className="max-w-lg mx-auto text-center py-20"><AlertCircle className="w-12 h-12 mx-auto mb-3 text-slate-300" /><h2 className="text-xl font-semibold text-slate-900">Erişim yok</h2></div>;
  if (examId && isLoading) return <div className="max-w-3xl mx-auto py-20 text-center text-slate-400">Yükleniyor…</div>;
  if (exam && !exam.editable) return <div className="max-w-lg mx-auto text-center py-20"><AlertCircle className="w-12 h-12 mx-auto mb-3 text-slate-300" /><h2 className="text-xl font-semibold text-slate-900">Salt görüntüleme</h2><p className="text-slate-500 mt-2">Bu sınavı düzenleme yetkiniz yok.</p></div>;

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
            <div>
              <Label>Ders</Label>
              <Select value={form.subject || undefined} onValueChange={(v) => setForm((f) => ({ ...f, subject: v }))}>
                <SelectTrigger><SelectValue placeholder="Ders seçin" /></SelectTrigger>
                <SelectContent>
                  {form.subject && !subjects.some((s) => s.name === form.subject) && <SelectItem value={form.subject}>{form.subject}</SelectItem>}
                  {subjects.map((s) => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Sınıf seviyesi</Label>
              <Select value={form.gradeLevel ? String(form.gradeLevel) : undefined} onValueChange={(v) => setForm((f) => ({ ...f, gradeLevel: v }))}>
                <SelectTrigger><SelectValue placeholder="Seviye seçin" /></SelectTrigger>
                <SelectContent>
                  {form.gradeLevel && !levels.some((l) => String(l.gradeLevel) === String(form.gradeLevel)) && <SelectItem value={String(form.gradeLevel)}>{form.gradeLevel}. Sınıf</SelectItem>}
                  {levels.map((l) => <SelectItem key={l.gradeLevel} value={String(l.gradeLevel)}>{l.gradeLevel}. Sınıf</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Konu</Label>
              <Select value={form.topic || undefined} onValueChange={(v) => setForm((f) => ({ ...f, topic: v }))}>
                <SelectTrigger><SelectValue placeholder="Konu seçin" /></SelectTrigger>
                <SelectContent>
                  {form.topic && !topics.some((t) => t.name === form.topic) && <SelectItem value={form.topic}>{form.topic}</SelectItem>}
                  {topics.map((t) => <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label htmlFor="e-dur">Süre (dk, boş=süresiz)</Label><Input id="e-dur" type="number" min={0} value={form.durationMinutes} onChange={(e) => setForm((f) => ({ ...f, durationMinutes: e.target.value }))} /></div>
          </div>
          <div>
            <Label>Havuz görünürlüğü</Label>
            <Select value={form.poolVisibility} onValueChange={(v) => setForm((f) => ({ ...f, poolVisibility: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="DEPARTMENT">Ders Zümresi</SelectItem>
                <SelectItem value="SCHOOL">Tüm okul</SelectItem>
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
          {type === "TUNNEL" ? (
            <SchoolTunnelEditor questions={questions} setQuestions={setQuestions} layerCount={exam?.layerCount ?? 7} optionCount={exam?.optionsPerQuestion ?? 10} />
          ) : (
            <SchoolExamQuestionsEditor questions={questions} setQuestions={setQuestions} choice={meta.choice} />
          )}

          <div className="flex justify-end sticky bottom-4">
            <Button onClick={() => saveQuestions.mutate()} disabled={saveQuestions.isPending || questions.length === 0} className="bg-emerald-600 hover:bg-emerald-700 gap-2 shadow-lg"><Save className="w-4 h-4" /> {saveQuestions.isPending ? "Kaydediliyor…" : "Soruları Kaydet"}</Button>
          </div>
        </div>
      )}
    </div>
  );
}
