import { useState, useEffect } from "react";
import { createPageUrl } from "@/utils";
import { entities, topics as topicsApi } from "@/api/dalClient";
import { useQuery, useMutation } from "@tanstack/react-query";
import api from "@/lib/api/apiClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import {
  ArrowLeft, Plus, Package, BookOpen, Eye, CheckCircle2,
  Trash2, AlertTriangle, X, Loader2, ImagePlus, Save,
} from "lucide-react";
import { Link } from "react-router-dom";
import { buildPageUrl, useAppNavigate } from "@/lib/navigation";
import { useServiceStatus } from "@/lib/useServiceStatus";
import { TestPreviewModal } from "@/components/TestPreviewModal";
import { ModerationStatusBadge } from "@/components/test/ModerationStatusBadge";

const STEPS = [
  { id: 1, label: "Paket",    icon: Package  },
  { id: 2, label: "Testler",  icon: BookOpen },
  { id: 3, label: "Önizleme", icon: Eye      },
];
const LETTERS = ["A", "B", "C", "D", "E"];
const uid = () => Math.random().toString(36).slice(2);

function emptyOption() {
  return { _k: uid(), id: null, content: "", mediaUrl: "", isCorrect: false };
}
function emptyQuestion() {
  return {
    _k: uid(), id: null, content: "", mediaUrl: "",
    topicId: null, duplicateWarning: null,
    options: [emptyOption(), emptyOption(), emptyOption(), emptyOption(), emptyOption()],
  };
}
function emptyTest() {
  return { _k: uid(), id: null, title: "", examTypeId: "", isTimed: false, duration: 30, questions: [emptyQuestion()] };
}
function apiQToLocal(q) {
  const opts = (q.options ?? []).map(o => ({
    _k: uid(), id: o.id, content: o.content ?? "", mediaUrl: o.mediaUrl ?? "", isCorrect: !!o.isCorrect,
  }));
  while (opts.length < 5) opts.push(emptyOption());
  return {
    _k: uid(), id: q.id, content: q.content ?? "", mediaUrl: q.mediaUrl ?? "",
    topicId: q.topicId ?? null, duplicateWarning: null, options: opts,
  };
}
async function doUpload(file) {
  const fd = new FormData(); fd.append("file", file);
  const { data } = await api.post("/upload/image", fd);
  return data.url || data.fileUrl || data.file_url || "";
}
function isQComplete(q) {
  const f = q.options.filter(o => o.content.trim() || o.mediaUrl);
  return (q.content.trim() || q.mediaUrl) && f.length >= 2 && q.options.some(o => o.isCorrect);
}

function StepIndicator({ current }) {
  return (
    <div className="flex items-center justify-center mb-8">
      {STEPS.map((step, i) => {
        const Icon = step.icon; const done = current > step.id; const active = current === step.id;
        return (
          <div key={step.id} className="flex items-center">
            <div className="flex flex-col items-center gap-1">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-colors ${done ? "bg-indigo-600 border-indigo-600 text-white" : active ? "bg-white border-indigo-600 text-indigo-600" : "bg-white border-slate-200 text-slate-400"}`}>
                {done ? <CheckCircle2 className="w-5 h-5" /> : <Icon className="w-4 h-4" />}
              </div>
              <span className={`text-xs font-medium ${active ? "text-indigo-600" : done ? "text-slate-600" : "text-slate-400"}`}>{step.label}</span>
            </div>
            {i < STEPS.length - 1 && <div className={`w-16 h-0.5 mx-1 mb-5 transition-colors ${current > step.id ? "bg-indigo-600" : "bg-slate-200"}`} />}
          </div>
        );
      })}
    </div>
  );
}

function QuestionEditDialog({ question, questionIndex, topicList, onSave, onSaveAndNew, onClose }) {
  const mk = (q) => ({ ...q, _imgFile: null, _imgPreview: null, options: q.options.map(o => ({ ...o, _imgFile: null, _imgPreview: null })) });
  const [local, setLocal] = useState(() => mk(question));
  const [dispIdx, setDispIdx] = useState(questionIndex);
  const [submitting, setSubmitting] = useState(false);
  const [dupLoading, setDupLoading] = useState(false);

  const handleBlur = async () => {
    const text = local.content.trim();
    if (text.length >= 15 && !local.duplicateWarning) {
      setDupLoading(true);
      try {
        const { data } = await api.post("/educators/me/questions/check-duplicate", { content: text, excludeQuestionId: local.id ?? null });
        if (data?.isDuplicate) { setLocal(p => ({ ...p, duplicateWarning: data })); toast.warning("Benzer bir soru bulundu."); }
      } catch { /* sessiz */ } finally { setDupLoading(false); }
    }
  };

  const prepareUpload = async () => {
    let mediaUrl = local.mediaUrl || "";
    if (local._imgFile) mediaUrl = await doUpload(local._imgFile);
    const options = await Promise.all(local.options.map(async opt => {
      let url = opt.mediaUrl || ""; if (opt._imgFile) url = await doUpload(opt._imgFile);
      const { _imgFile, _imgPreview, ...rest } = opt; return { ...rest, mediaUrl: url };
    }));
    if (local._imgPreview) URL.revokeObjectURL(local._imgPreview);
    local.options.forEach(o => { if (o._imgPreview) URL.revokeObjectURL(o._imgPreview); });
    const { _imgFile, _imgPreview, ...rest } = local;
    return { ...rest, mediaUrl, options };
  };

  const validate = () => { if (!local.options.some(o => o.isCorrect)) { toast.error("Doğru seçeneği işaretleyin"); return false; } return true; };

  const handleSave = async () => {
    if (!validate()) return; setSubmitting(true);
    try { const saved = await prepareUpload(); onSave(saved); onClose(); }
    catch (e) { toast.error(e?.message || "Hata"); setSubmitting(false); }
  };

  const handleSaveNew = async () => {
    if (!validate()) return; setSubmitting(true);
    try { const saved = await prepareUpload(); onSaveAndNew(saved); setDispIdx(p => p + 1); setLocal(mk(emptyQuestion())); }
    catch (e) { toast.error(e?.message || "Hata"); }
    finally { setSubmitting(false); }
  };

  const qImg = local._imgPreview || local.mediaUrl || null;
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-screen overflow-y-auto">
        <DialogHeader><DialogTitle>Soru {dispIdx + 1} Düzenle</DialogTitle></DialogHeader>
        <div className="space-y-5 py-2">
          <div className="space-y-2">
            <Label>Soru Metni</Label>
            <textarea className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500" rows={3} placeholder="Soru metnini giriniz..."
              value={local.content} onChange={e => setLocal(p => ({ ...p, content: e.target.value, duplicateWarning: null }))} onBlur={handleBlur} disabled={dupLoading} />
            {dupLoading && <p className="text-xs text-slate-500 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" />Kontrol ediliyor...</p>}
            {local.duplicateWarning && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
                <p className="font-medium text-amber-900 flex items-center gap-1"><AlertTriangle className="w-4 h-4" />Benzer soru</p>
                <p className="text-amber-700 mt-1 text-xs">Benzerlik: {Math.round(local.duplicateWarning.similarity * 100)}%</p>
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Label>Görsel (İsteğe Bağlı)</Label>
            <div className="flex items-center gap-3 flex-wrap">
              <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-slate-200 bg-white hover:bg-slate-50 text-slate-600">
                <ImagePlus className="w-4 h-4" />Görsel Seç
                <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (!f) return; if (local._imgPreview) URL.revokeObjectURL(local._imgPreview); setLocal(p => ({ ...p, _imgFile: f, _imgPreview: URL.createObjectURL(f), mediaUrl: "" })); }} />
              </label>
              {qImg && (
                <>
                  <div className="w-16 h-12 rounded-lg overflow-hidden bg-slate-100 border border-slate-200"><img src={qImg} alt="" className="w-full h-full object-cover" /></div>
                  <button type="button" onClick={() => { if (local._imgPreview) URL.revokeObjectURL(local._imgPreview); setLocal(p => ({ ...p, _imgFile: null, _imgPreview: null, mediaUrl: "" })); }} className="inline-flex items-center gap-1 px-2 py-1.5 rounded text-sm border border-rose-200 hover:bg-rose-50 text-rose-600"><X className="w-4 h-4" />Temizle</button>
                </>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Konu (İsteğe Bağlı)</Label>
            <Select value={local.topicId || "none"} onValueChange={v => setLocal(p => ({ ...p, topicId: v === "none" ? null : v }))}>
              <SelectTrigger><SelectValue placeholder="Konu seçin" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Seçilmedi —</SelectItem>
                {topicList.map(t => <SelectItem key={t.id} value={t.id}>{t.parentName ? `${t.parentName} / ${t.name}` : t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-3">
            <Label>Seçenekler</Label>
            {local.options.map((opt, oi) => {
              const oImg = opt._imgPreview || opt.mediaUrl || null;
              return (
                <div key={opt._k} className="p-3 rounded-lg bg-slate-50 space-y-2">
                  <div className="flex items-start gap-3">
                    <RadioGroup value={local.options.find(o => o.isCorrect)?._k || ""} onValueChange={v => setLocal(p => ({ ...p, options: p.options.map(o => ({ ...o, isCorrect: o._k === v })) }))}>
                      <div className="flex items-center space-x-2 pt-1">
                        <RadioGroupItem value={opt._k} id={`opt-${question._k}-${oi}`} disabled={!opt.content.trim() && !opt.mediaUrl && !opt._imgFile} />
                        <label htmlFor={`opt-${question._k}-${oi}`} className="text-sm font-semibold cursor-pointer">{LETTERS[oi]}</label>
                      </div>
                    </RadioGroup>
                    <div className="flex-1 space-y-2">
                      <Input placeholder={`Seçenek ${LETTERS[oi]}`} value={opt.content} onChange={e => setLocal(p => ({ ...p, options: p.options.map((o, i) => i === oi ? { ...o, content: e.target.value } : o) }))} />
                      <div className="flex items-center gap-2">
                        <label className="cursor-pointer inline-flex items-center gap-1 px-2 py-1 rounded text-xs border border-slate-200 hover:bg-slate-50 text-slate-600">
                          <ImagePlus className="w-3 h-3" />Görsel
                          <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (!f) return; if (opt._imgPreview) URL.revokeObjectURL(opt._imgPreview); setLocal(p => ({ ...p, options: p.options.map((o, i) => i === oi ? { ...o, _imgFile: f, _imgPreview: URL.createObjectURL(f), mediaUrl: "" } : o) })); }} />
                        </label>
                        {oImg && (<><div className="w-8 h-8 rounded bg-slate-100 overflow-hidden border border-slate-200"><img src={oImg} alt="" className="w-full h-full object-cover" /></div><button type="button" onClick={() => { if (opt._imgPreview) URL.revokeObjectURL(opt._imgPreview); setLocal(p => ({ ...p, options: p.options.map((o, i) => i === oi ? { ...o, _imgFile: null, _imgPreview: null, mediaUrl: "" } : o) })); }} className="p-1 rounded text-xs border hover:bg-rose-50 text-rose-500"><X className="w-3 h-3" /></button></>)}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="flex justify-end gap-3 pt-4 border-t flex-wrap">
          <Button variant="outline" onClick={onClose} disabled={submitting}>İptal</Button>
          {onSaveAndNew && (
            <Button variant="outline" className="border-indigo-300 text-indigo-600 hover:bg-indigo-50" onClick={handleSaveNew} disabled={submitting}>
              {submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Kaydediliyor...</> : <><Plus className="w-4 h-4 mr-1" />Yeni Soru</>}
            </Button>
          )}
          <Button className="bg-indigo-600 hover:bg-indigo-700" onClick={handleSave} disabled={submitting}>
            {submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Kaydediliyor...</> : "Tamamla"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function QuestionItem({ questionIndex, question, topicList, onUpdate, onDelete, onAddNew }) {
  const [editOpen, setEditOpen] = useState(false);
  const complete = isQComplete(question);
  return (
    <>
      <AccordionItem value={question._k}>
        <AccordionTrigger className="hover:no-underline">
          <div className="flex items-center gap-3 text-left flex-1">
            <span className="text-sm font-semibold text-slate-600">Soru {questionIndex + 1}</span>
            {complete ? <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" /> : <div className="w-4 h-4 rounded-full border-2 border-slate-300 flex-shrink-0" />}
            {question.duplicateWarning && <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />}
            {question.content && <span className="text-xs text-slate-400 truncate max-w-xs">{question.content}</span>}
            {question.moderationStatus && <ModerationStatusBadge status={question.moderationStatus} />}
          </div>
        </AccordionTrigger>
        <AccordionContent className="pt-2 pb-1">
          {question.moderationStatus === 'REJECTED' && (
            <div className="mb-3 px-3 py-2 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700">
              Bu soru içerik politikasına aykırı bulundu.
            </div>
          )}
          <p className="text-xs text-slate-500 mb-3">
            {question.options.filter(o => o.content.trim()).length}/5 seçenek
            {question.options.find(o => o.isCorrect) ? " • Doğru: " + LETTERS[question.options.findIndex(o => o.isCorrect)] : " • Doğru seçilmedi"}
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>Düzenle</Button>
            <Button size="sm" variant="ghost" className="text-rose-600 hover:bg-rose-50" onClick={() => onDelete(questionIndex)}><Trash2 className="w-4 h-4 mr-1" />Sil</Button>
          </div>
        </AccordionContent>
      </AccordionItem>
      {editOpen && <QuestionEditDialog question={question} questionIndex={questionIndex} topicList={topicList} onSave={u => onUpdate(u)} onSaveAndNew={u => { onUpdate(u); onAddNew?.(); }} onClose={() => setEditOpen(false)} />}
    </>
  );
}

function TestCard({ test, testIndex, examTypes, topicList, onTestUpdate, onTestDelete, totalTests }) {
  const completedCount = test.questions.filter(isQComplete).length;
  return (
    <Card className="mb-4">
      <CardHeader>
        <div className="flex items-start gap-4">
          <div className="flex-1 space-y-3">
            <div className="space-y-2">
              <Label>Test Başlığı *</Label>
              <Input placeholder="Örn: YKS Matematik" value={test.title} onChange={e => onTestUpdate({ ...test, title: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Sınav Türü (İsteğe Bağlı)</Label>
              <Select value={test.examTypeId || "none"} onValueChange={v => onTestUpdate({ ...test, examTypeId: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="Seçin" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Seçilmedi —</SelectItem>
                  {(examTypes || []).map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-3 flex-shrink-0">
            <div className="flex items-center gap-2">
              <Switch checked={test.isTimed} onCheckedChange={v => onTestUpdate({ ...test, isTimed: v })} />
              <Label className="cursor-pointer text-sm">Süreli</Label>
            </div>
            {test.isTimed && (
              <div className="space-y-1">
                <Label className="text-xs">Süre (dk)</Label>
                <Input type="number" min="1" className="w-24" value={test.duration} onChange={e => onTestUpdate({ ...test, duration: Number(e.target.value) })} />
              </div>
            )}
            {totalTests > 1 && (
              <Button size="sm" variant="ghost" className="text-rose-600 hover:bg-rose-50 w-full" onClick={() => onTestDelete(testIndex)}>
                <Trash2 className="w-4 h-4 mr-1" />Testi Sil
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-slate-700">{test.questions.length} soru <span className="text-slate-400 font-normal">({completedCount} tamamlanmış)</span></p>
          <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700" onClick={() => onTestUpdate({ ...test, questions: [...test.questions, emptyQuestion()] })}>
            <Plus className="w-4 h-4 mr-1" />Soru Ekle
          </Button>
        </div>
        <Accordion type="single" collapsible className="space-y-2">
          {test.questions.map((q, qi) => (
            <QuestionItem key={q._k} questionIndex={qi} question={q} topicList={topicList}
              onUpdate={u => onTestUpdate({ ...test, questions: test.questions.map((x, i) => i === qi ? u : x) })}
              onDelete={idx => onTestUpdate({ ...test, questions: test.questions.filter((_, i) => i !== idx) })}
              onAddNew={() => onTestUpdate({ ...test, questions: [...test.questions, emptyQuestion()] })}
            />
          ))}
        </Accordion>
      </CardContent>
    </Card>
  );
}

export default function EditTest() {
  const navigate   = useAppNavigate();
  const urlParams  = new URLSearchParams(window.location.search);
  const packageId  = urlParams.get("id");
  const { minPackagePriceCents = 100 } = useServiceStatus();
  const minPriceTL = minPackagePriceCents / 100;

  const [step, setStep]               = useState(1);
  const [pkgData, setPkgData]         = useState(null);
  const [tests, setTests]             = useState([]);
  const [previewIdx, setPreviewIdx]   = useState(null);
  const [initialized, setInitialized] = useState(false);

  const { data: pkgDetail, isLoading, isError } = useQuery({
    queryKey: ["editPackage", packageId],
    queryFn:  async () => { const { data } = await api.get(`/packages/${packageId}`); return data; },
    enabled:  !!packageId, retry: 1,
  });

  const { data: examTypes = [] } = useQuery({
    queryKey: ["examTypes"],
    queryFn:  () => entities.ExamType.filter({ is_active: true }),
  });

  const { data: topicList = [] } = useQuery({
    queryKey: ["topicsFlat"],
    queryFn:  async () => { try { return await topicsApi.flat(undefined); } catch { return []; } },
    enabled:  step >= 2, staleTime: 60_000,
  });

  useEffect(() => {
    if (!pkgDetail || initialized) return;
    setPkgData({
      title:       pkgDetail.title        ?? "",
      description: pkgDetail.description  ?? "",
      priceCents:  pkgDetail.priceCents != null ? pkgDetail.priceCents / 100 : 0,
      examTypeId:  pkgDetail.examTypeId   ?? "",
      difficulty:  pkgDetail.difficulty   ?? "medium",
    });
    const mapped = (pkgDetail.tests ?? []).map(t => ({
      _k: uid(), id: t.id, title: t.title ?? "", examTypeId: t.examTypeId ?? "",
      isTimed: t.isTimed ?? false, duration: t.duration ?? 30,
      questions: (t.questions ?? []).map(apiQToLocal),
    }));
    setTests(mapped.length > 0 ? mapped : [emptyTest()]);
    setInitialized(true);
  }, [pkgDetail, initialized]);

  const saveMutation = useMutation({
    mutationFn: async ({ publish }) => {
      await api.patch(`/packages/${packageId}`, {
        title: pkgData.title, description: pkgData.description || null,
        priceCents: Math.round((pkgData.priceCents || 0) * 100), difficulty: pkgData.difficulty,
      });

      const origTests   = pkgDetail?.tests ?? [];
      const origTestMap = Object.fromEntries(origTests.map(t => [t.id, t]));

      for (const testData of tests) {
        if (!testData.title.trim()) continue;
        let examTestId = testData.id;

        if (examTestId) {
          await api.patch(`/tests/${examTestId}`, {
            title: testData.title, isTimed: testData.isTimed,
            duration: testData.isTimed ? testData.duration : undefined,
          });
        } else {
          const { data: created } = await api.post("/tests", {
            title: testData.title, examTypeId: testData.examTypeId || undefined,
            price: 0, isTimed: testData.isTimed, duration: testData.isTimed ? testData.duration : undefined,
          });
          await api.post(`/packages/${packageId}/tests`, { testId: created.id });
          examTestId = created.id;
        }

        const origQIds = new Set((origTestMap[testData.id]?.questions ?? []).map(q => q.id));
        const curQIds  = new Set(testData.questions.filter(q => q.id).map(q => q.id));

        for (const oldId of origQIds) {
          if (!curQIds.has(oldId)) {
            try {
              await api.delete(`/tests/${examTestId}/questions/${oldId}`);
            } catch (e) {
              // 409: soru cevaplanmış, silinemez — kullanıcıya bildir ama işleme devam et
              if (e?.response?.status === 409) {
                toast.warning("Cevaplanmış soru atlandı: silinemiyor.");
              }
              // diğer hatalar throw edilir
              else throw e;
            }
          }
        }

        for (let qi = 0; qi < testData.questions.length; qi++) {
          const q = testData.questions[qi];
          if (!isQComplete(q)) continue;
          if (q.id && origQIds.has(q.id)) {
            await api.patch(`/tests/${examTestId}/questions/${q.id}`, { content: q.content, mediaUrl: q.mediaUrl || undefined, order: qi });
            for (const opt of q.options) {
              if (opt.id) await api.patch(`/tests/${examTestId}/questions/${q.id}/options/${opt.id}`, { content: opt.content, isCorrect: opt.isCorrect });
            }
          } else {
            const filledOpts = q.options.filter(o => o.content.trim() || o.mediaUrl);
            await api.post(`/tests/${examTestId}/questions`, {
              content: q.content, mediaUrl: q.mediaUrl || undefined, topicId: q.topicId || undefined, order: qi,
              options: filledOpts.map(o => ({ content: o.content, mediaUrl: o.mediaUrl || undefined, isCorrect: o.isCorrect })),
            });
          }
        }
      }

      if (publish === true)  await api.put(`/packages/${packageId}/publish`);
      if (publish === false) await api.put(`/packages/${packageId}/unpublish`);
      return { publish };
    },
    onSuccess: ({ publish }) => {
      if (publish === true)       toast.success("Paket güncellendi ve yayınlandı!");
      else if (publish === false) toast.success("Paket yayından kaldırıldı.");
      else                        toast.success("Değişiklikler kaydedildi.");
      navigate(buildPageUrl("MyTestPackages"), { replace: true });
    },
    onError: (err) => {
      const code = err?.response?.data?.code || err?.response?.data?.error;
      if (code === 'MODERATION_PENDING') {
        toast.error("Bu testin bazı soruları moderasyon onayı bekliyor. Onaylanmadan yayımlayamazsınız.");
      } else {
        toast.error(err?.response?.data?.message || err?.message || "Kaydetme başarısız");
      }
    },
  });

  if (!packageId) return (
    <div className="max-w-2xl mx-auto text-center py-20">
      <p className="text-slate-500 mb-4">Paket ID bulunamadı</p>
      <Link to={createPageUrl("MyTestPackages")}><Button>Test Paketlerim</Button></Link>
    </div>
  );

  if (isLoading || !initialized) return (
    <div className="max-w-4xl mx-auto animate-pulse">
      <div className="h-8 bg-slate-200 rounded w-40 mb-6" />
      <div className="flex justify-center gap-6 mb-8">{[1,2,3].map(i => <div key={i} className="w-10 h-10 bg-slate-200 rounded-full" />)}</div>
      <div className="h-64 bg-slate-200 rounded-2xl" />
    </div>
  );

  if (isError || !pkgData) return (
    <div className="max-w-2xl mx-auto text-center py-20">
      <p className="text-slate-500 mb-4">Paket yüklenemedi</p>
      <Link to={createPageUrl("MyTestPackages")}><Button>Test Paketlerim</Button></Link>
    </div>
  );

  const goToTests = () => {
    if (!pkgData.title.trim()) { toast.error("Paket başlığı zorunlu"); return; }
    if (!pkgData.priceCents || pkgData.priceCents < minPriceTL) { toast.error(`Fiyat en az ${minPriceTL} ₺ olmalı`); return; }
    setStep(2);
  };
  const goToPreview = () => {
    if (!tests.some(t => t.title.trim() && t.questions.some(isQComplete))) { toast.error("En az bir tamamlanmış test ve soru gerekli"); return; }
    setStep(3);
  };

  const isPublished = !!pkgDetail?.publishedAt;
  const totalValid  = tests.reduce((s, t) => s + t.questions.filter(isQComplete).length, 0);

  return (
    <div className="max-w-4xl mx-auto">
      <Link to={createPageUrl("MyTestPackages")} className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-6">
        <ArrowLeft className="w-4 h-4" />Test Paketlerim
      </Link>

      <div className="flex items-center gap-3 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Paketi Düzenle</h1>
          <p className="text-sm text-slate-500 mt-0.5">{pkgDetail?.title}</p>
        </div>
        {isPublished
          ? <Badge className="bg-emerald-100 text-emerald-700 border-0">Yayında</Badge>
          : <Badge className="bg-slate-100 text-slate-600 border-0">Taslak</Badge>}
      </div>

      <StepIndicator current={step} />

      {/* ADIM 1: Paket */}
      {step === 1 && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Package className="w-5 h-5 text-indigo-600" />Paket Bilgileri</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label>Paket Başlığı *</Label>
              <Input placeholder="Örn: KPSS Genel Yetenek" value={pkgData.title} onChange={e => setPkgData({ ...pkgData, title: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Açıklama</Label>
              <Textarea placeholder="Paket hakkında kısa bilgi..." rows={3} value={pkgData.description} onChange={e => setPkgData({ ...pkgData, description: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Sınav Türü (İsteğe Bağlı)</Label>
              <Select value={pkgData.examTypeId || "none"} onValueChange={v => setPkgData({ ...pkgData, examTypeId: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="Seçin" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Seçilmedi —</SelectItem>
                  {examTypes.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Fiyat (₺) *</Label>
              <Input type="number" min="1" step="1" placeholder="Örn: 49" value={pkgData.priceCents || ""} onChange={e => setPkgData({ ...pkgData, priceCents: Number(e.target.value) })} />
              <p className="text-xs text-slate-500">Minimum: {minPriceTL} ₺</p>
            </div>
            <div className="space-y-2">
              <Label>Zorluk Seviyesi</Label>
              <Select value={pkgData.difficulty} onValueChange={v => setPkgData({ ...pkgData, difficulty: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="easy">🟢 Kolay</SelectItem>
                  <SelectItem value="medium">🟡 Orta</SelectItem>
                  <SelectItem value="hard">🔴 Zor</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end pt-2">
              <Button onClick={goToTests} className="bg-indigo-600 hover:bg-indigo-700">İleri →</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ADIM 2: Testler */}
      {step === 2 && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Testler & Sorular</h2>
              <p className="text-sm text-slate-500 mt-1">Mevcut soruları düzenleyin veya yeni ekleyin</p>
            </div>
            <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700" onClick={() => setTests([...tests, emptyTest()])}>
              <Plus className="w-4 h-4 mr-1" />Test Ekle
            </Button>
          </div>
          {tests.map((t, ti) => (
            <TestCard key={t._k} test={t} testIndex={ti} examTypes={examTypes} topicList={topicList}
              totalTests={tests.length}
              onTestUpdate={u => setTests(tests.map((x, i) => i === ti ? u : x))}
              onTestDelete={idx => setTests(tests.filter((_, i) => i !== idx))}
            />
          ))}
          <div className="flex justify-between pt-2">
            <Button variant="outline" onClick={() => setStep(1)}>← Geri</Button>
            <Button onClick={goToPreview} className="bg-indigo-600 hover:bg-indigo-700">Önizleme →</Button>
          </div>
        </div>
      )}

      {/* ADIM 3: Önizleme & Kaydet */}
      {step === 3 && (
        <div className="space-y-5">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Eye className="w-5 h-5 text-indigo-600" />Paket Özeti</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-slate-50 rounded-xl p-4 space-y-3">
                <div>
                  <p className="text-xs text-slate-500">Paket Başlığı</p>
                  <p className="text-lg font-semibold text-slate-900">{pkgData.title}</p>
                </div>
                {pkgData.description && <div><p className="text-xs text-slate-500">Açıklama</p><p className="text-sm text-slate-700">{pkgData.description}</p></div>}
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">{tests.length} test</Badge>
                  <Badge variant="outline">{totalValid} geçerli soru</Badge>
                  <Badge variant="outline">{pkgData.priceCents === 0 ? "Ücretsiz" : `₺${pkgData.priceCents}`}</Badge>
                  {examTypes.find(e => e.id === pkgData.examTypeId)?.name && (
                    <Badge variant="outline" className="border-indigo-200 text-indigo-700 bg-indigo-50">{examTypes.find(e => e.id === pkgData.examTypeId)?.name}</Badge>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-semibold text-slate-700">Testler</p>
                {tests.map((t, ti) => (
                  <div key={t._k} className="p-3 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-slate-900">{t.title || "Başlıksız"}</p>
                      <p className="text-sm text-slate-500">{t.questions.filter(isQComplete).length} geçerli soru</p>
                    </div>
                    <Button size="sm" variant="ghost" className="text-indigo-600" onClick={() => setPreviewIdx(ti)}><Eye className="w-4 h-4" /></Button>
                  </div>
                ))}
              </div>
              <div className="border-t pt-4">
                <div className="flex gap-3 flex-wrap">
                  <Button variant="outline" className="flex-1" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate({ publish: null })}>
                    <Save className="w-4 h-4 mr-2" />{saveMutation.isPending ? "Kaydediliyor..." : "Değişiklikleri Kaydet"}
                  </Button>
                  {!isPublished ? (
                    <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700 gap-2" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate({ publish: true })}>
                      <CheckCircle2 className="w-4 h-4" />{saveMutation.isPending ? "Yayınlanıyor..." : "Kaydet & Yayınla"}
                    </Button>
                  ) : (
                    <Button variant="outline" className="flex-1 border-amber-200 text-amber-700 hover:bg-amber-50" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate({ publish: false })}>
                      {saveMutation.isPending ? "İşleniyor..." : "Yayından Kaldır"}
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
          <Button variant="outline" onClick={() => setStep(2)}>← Geri (Testler)</Button>
        </div>
      )}

      {previewIdx !== null && tests[previewIdx] && (
        <TestPreviewModal isOpen questions={tests[previewIdx].questions.filter(isQComplete)} title={tests[previewIdx].title} onClose={() => setPreviewIdx(null)} />
      )}
    </div>
  );
}
