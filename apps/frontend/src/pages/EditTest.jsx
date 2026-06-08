import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { createPageUrl } from "@/utils";
import { entities, topics as topicsApi } from "@/api/dalClient";
import { useAuth } from "@/lib/AuthContext";
import { useAutoSave } from "@/lib/useAutoSave";
import { useQuery, useMutation } from "@tanstack/react-query";
import api from "@/lib/api/apiClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { TopicCombobox } from "@/components/ui/TopicCombobox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import {
  ArrowLeft, Plus, Package, BookOpen, Eye, CheckCircle2,
  Trash2, AlertTriangle, X, Loader2, ImagePlus, Save,
  ChevronDown, ChevronUp, Pencil, Upload,
} from "lucide-react";
import { Link } from "react-router-dom";
import { buildPageUrl, useAppNavigate } from "@/lib/navigation";
import { useServiceStatus } from "@/lib/useServiceStatus";
import { parseDocxToQuestions, parsePdfToQuestions } from "@/lib/importQuestions";
import { TestPreviewModal } from "@/components/TestPreviewModal";
import { ModerationStatusBadge } from "@/components/test/ModerationStatusBadge";
import PackageCoverUpload from "@/components/test/PackageCoverUpload";

const LETTERS = ["A", "B", "C", "D", "E"];
const uid = () => Math.random().toString(36).slice(2);

function emptyOption() {
  return { _k: uid(), id: null, content: "", mediaUrl: "", isCorrect: false };
}
function emptyQuestion() {
  return {
    _k: uid(), id: null, content: "", mediaUrl: "",
    topicId: null, duplicateWarning: null,
    // Çözüm (opsiyonel) — bkz. CreateTest.emptyQuestion yorumu.
    solutionText: "", solutionMediaUrl: "",
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
    topicId: q.topicId ?? null, duplicateWarning: null,
    solutionText: q.solutionText ?? "", solutionMediaUrl: q.solutionMediaUrl ?? "",
    options: opts,
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
  const { t } = useTranslation(["pages"]);
  const STEPS = [
    { id: 1, label: t("pages:testForm.steps.package"),  icon: Package  },
    { id: 2, label: t("pages:testForm.steps.tests"),    icon: BookOpen },
    { id: 3, label: t("pages:testForm.steps.preview"),  icon: Eye      },
  ];
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
  const { t } = useTranslation(["pages"]);
  const mk = (q) => ({
    ...q,
    _imgFile: null, _imgPreview: null,
    _solutionImgFile: null, _solutionImgPreview: null,
    options: q.options.map(o => ({ ...o, _imgFile: null, _imgPreview: null })),
  });
  const [local, setLocal] = useState(() => mk(question));
  const [dispIdx] = useState(questionIndex);
  const [submitting, setSubmitting] = useState(false);
  const [dupLoading, setDupLoading] = useState(false);

  const handleBlur = async () => {
    const text = local.content.trim();
    if (text.length >= 15 && !local.duplicateWarning) {
      setDupLoading(true);
      try {
        const { data } = await api.post("/educators/me/questions/check-duplicate", { content: text, excludeQuestionId: local.id ?? null });
        if (data?.isDuplicate) { setLocal(p => ({ ...p, duplicateWarning: data })); toast.warning(t("pages:testForm.question.duplicateToast")); }
      } catch { /* sessiz */ } finally { setDupLoading(false); }
    }
  };

  const prepareUpload = async () => {
    let mediaUrl = local.mediaUrl || "";
    if (local._imgFile) mediaUrl = await doUpload(local._imgFile);
    let solutionMediaUrl = local.solutionMediaUrl || "";
    if (local._solutionImgFile) solutionMediaUrl = await doUpload(local._solutionImgFile);
    const options = await Promise.all(local.options.map(async opt => {
      let url = opt.mediaUrl || ""; if (opt._imgFile) url = await doUpload(opt._imgFile);
      const { _imgFile, _imgPreview, ...rest } = opt; return { ...rest, mediaUrl: url };
    }));
    if (local._imgPreview) URL.revokeObjectURL(local._imgPreview);
    if (local._solutionImgPreview) URL.revokeObjectURL(local._solutionImgPreview);
    local.options.forEach(o => { if (o._imgPreview) URL.revokeObjectURL(o._imgPreview); });
    const { _imgFile, _imgPreview, _solutionImgFile, _solutionImgPreview, ...rest } = local;
    return { ...rest, mediaUrl, solutionMediaUrl, options };
  };

  const validate = () => { if (!local.options.some(o => o.isCorrect)) { toast.error(t("pages:testForm.dialog.validateNoCorrect")); return false; } return true; };

  const handleSave = async () => {
    if (!validate()) return; setSubmitting(true);
    try { const saved = await prepareUpload(); onSave(saved); onClose(); }
    catch (e) { toast.error(e?.message || t("pages:testForm.dialog.genericError")); setSubmitting(false); }
  };

  const handleSaveNew = async () => {
    if (!validate()) return; setSubmitting(true);
    try {
      const saved = await prepareUpload();
      // Mevcut soruyu kaydet + yeni soru ekle (atomik) ve BU dialog'u kapat — yeni
      // eklenen soru kendi editörünü autoOpen ile açar. Böylece çift dialog olmaz ve
      // bu dialog'tan yapılacak sonraki kayıt yanlışlıkla mevcut soruyu ezmez.
      onSaveAndNew(saved);
      onClose();
    } catch (e) {
      toast.error(e?.message || t("pages:testForm.dialog.genericError"));
      setSubmitting(false);
    }
  };

  const qImg = local._imgPreview || local.mediaUrl || null;
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-screen overflow-y-auto">
        <DialogHeader><DialogTitle>{t("pages:testForm.question.editDialogTitle", { n: dispIdx + 1 })}</DialogTitle></DialogHeader>
        {/* 2-sütun düzeni: sol metadata, sağ seçenekler. lg altı tek sütun. */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-5 py-2">
          <div className="space-y-5">
          <div className="space-y-2">
            <Label>{t("pages:testForm.question.contentLabel")}</Label>
            <textarea className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500" rows={3} placeholder={t("pages:testForm.question.contentPlaceholder")}
              value={local.content} onChange={e => setLocal(p => ({ ...p, content: e.target.value, duplicateWarning: null }))} onBlur={handleBlur} disabled={dupLoading} />
            {dupLoading && <p className="text-xs text-slate-500 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" />{t("pages:testForm.question.duplicateCheck")}</p>}
            {local.duplicateWarning && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
                <p className="font-medium text-amber-900 flex items-center gap-1"><AlertTriangle className="w-4 h-4" />{t("pages:testForm.question.duplicateTitle")}</p>
                <p className="text-amber-700 mt-1 text-xs">{t("pages:testForm.question.duplicateSimilarity", { pct: Math.round(local.duplicateWarning.similarity * 100) })}</p>
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Label>{t("pages:testForm.question.imageLabel")}</Label>
            <div className="flex items-center gap-3 flex-wrap">
              <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-slate-200 bg-white hover:bg-slate-50 text-slate-600">
                <ImagePlus className="w-4 h-4" />{t("pages:testForm.question.selectImage")}
                <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (!f) return; if (local._imgPreview) URL.revokeObjectURL(local._imgPreview); setLocal(p => ({ ...p, _imgFile: f, _imgPreview: URL.createObjectURL(f), mediaUrl: "" })); }} />
              </label>
              {qImg && (
                <>
                  <div className="w-16 h-12 rounded-lg overflow-hidden bg-slate-100 border border-slate-200"><img src={qImg} alt="" className="w-full h-full object-cover" /></div>
                  <button type="button" onClick={() => { if (local._imgPreview) URL.revokeObjectURL(local._imgPreview); setLocal(p => ({ ...p, _imgFile: null, _imgPreview: null, mediaUrl: "" })); }} className="inline-flex items-center gap-1 px-2 py-1.5 rounded text-sm border border-rose-200 hover:bg-rose-50 text-rose-600"><X className="w-4 h-4" />{t("pages:testForm.question.clearImage")}</button>
                </>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t("pages:testForm.question.topicLabel")}</Label>
            <TopicCombobox
              value={local.topicId ?? null}
              onChange={(id) => setLocal(p => ({ ...p, topicId: id }))}
              topics={topicList}
              placeholder={t("pages:testForm.question.topicPlaceholder")}
              emptyLabel={t("pages:testForm.question.topicNone")}
              searchPlaceholder={t("pages:testForm.question.topicSearchPlaceholder", "Konu ara...")}
              emptyText={t("pages:testForm.question.topicEmpty", "Konu bulunamadı")}
            />
          </div>
          <div className="space-y-2">
            <Label>
              {t("pages:testForm.question.solutionLabel", "Çözüm")}{" "}
              <span className="text-slate-400 font-normal">{t("pages:testForm.question.solutionOptional", "(opsiyonel)")}</span>
            </Label>
            <p className="text-xs text-slate-500">
              {t("pages:testForm.question.solutionHelp", "Aday testi tamamladıktan sonra 'Çözümü Göster' ile görür. Canlı oturumda gösterilmez.")}
            </p>
            <textarea
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
              rows={3}
              placeholder={t("pages:testForm.question.solutionPlaceholder", "Çözüm metnini buraya yazın...")}
              value={local.solutionText ?? ""}
              onChange={e => setLocal(p => ({ ...p, solutionText: e.target.value }))}
            />
            <div className="flex items-center gap-3 flex-wrap">
              <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-slate-200 bg-white hover:bg-slate-50 text-slate-600">
                <ImagePlus className="w-4 h-4" />
                {t("pages:testForm.question.solutionImageSelect", "Çözüm görseli seç")}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => {
                    const f = e.target.files?.[0]; e.target.value = "";
                    if (!f) return;
                    if (local._solutionImgPreview) URL.revokeObjectURL(local._solutionImgPreview);
                    setLocal(p => ({ ...p, _solutionImgFile: f, _solutionImgPreview: URL.createObjectURL(f), solutionMediaUrl: "" }));
                  }}
                />
              </label>
              {(local._solutionImgPreview || local.solutionMediaUrl) && (
                <>
                  <div className="w-16 h-12 rounded-lg overflow-hidden bg-slate-100 border border-slate-200">
                    <img src={local._solutionImgPreview || local.solutionMediaUrl} alt="" className="w-full h-full object-cover" />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (local._solutionImgPreview) URL.revokeObjectURL(local._solutionImgPreview);
                      setLocal(p => ({ ...p, _solutionImgFile: null, _solutionImgPreview: null, solutionMediaUrl: "" }));
                    }}
                    className="inline-flex items-center gap-1 px-2 py-1.5 rounded text-sm border border-rose-200 hover:bg-rose-50 text-rose-600"
                  >
                    <X className="w-4 h-4" />{t("pages:testForm.question.clearImage")}
                  </button>
                </>
              )}
            </div>
          </div>
          </div>{/* /sol sütun */}

          {/* Seçenekler — sağ sütun */}
          <div className="space-y-3">
            <Label>{t("pages:testForm.question.optionsLabel")}</Label>
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
                      <Input placeholder={t("pages:testForm.question.optionPlaceholder", { letter: LETTERS[oi] })} value={opt.content} onChange={e => setLocal(p => ({ ...p, options: p.options.map((o, i) => i === oi ? { ...o, content: e.target.value } : o) }))} />
                      <div className="flex items-center gap-2">
                        <label className="cursor-pointer inline-flex items-center gap-1 px-2 py-1 rounded text-xs border border-slate-200 hover:bg-slate-50 text-slate-600">
                          <ImagePlus className="w-3 h-3" />{t("pages:testForm.question.optionImage")}
                          {/* multiple: A'ya tıklayıp 5 dosya seçersen A→E doluverir.
                              LiveSessionCreate + CreateTest ile aynı pattern. */}
                          <input type="file" accept="image/*" multiple className="hidden" onChange={e => {
                            const files = Array.from(e.target.files ?? []);
                            e.target.value = "";
                            if (files.length === 0) return;
                            setLocal(p => {
                              const next = [...p.options];
                              let filled = 0;
                              for (let k = 0; k < files.length && (oi + k) < next.length; k++) {
                                const idx = oi + k;
                                const target = next[idx];
                                if (target._imgPreview) URL.revokeObjectURL(target._imgPreview);
                                next[idx] = { ...target, _imgFile: files[k], _imgPreview: URL.createObjectURL(files[k]), mediaUrl: "" };
                                filled++;
                              }
                              if (files.length > 1) {
                                toast.success(t("pages:testForm.question.multiImageAssigned", { count: filled }));
                              }
                              if (files.length > filled) {
                                toast.warning(t("pages:testForm.question.multiImageSkipped", { count: files.length - filled }));
                              }
                              return { ...p, options: next };
                            });
                          }} />
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
          <Button variant="outline" onClick={onClose} disabled={submitting}>{t("pages:testForm.dialog.cancel")}</Button>
          {onSaveAndNew && (
            <Button variant="outline" className="border-indigo-300 text-indigo-600 hover:bg-indigo-50" onClick={handleSaveNew} disabled={submitting}>
              {submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{t("pages:testForm.dialog.saving")}</> : <><Plus className="w-4 h-4 mr-1" />{t("pages:testForm.dialog.newQuestion")}</>}
            </Button>
          )}
          <Button className="bg-indigo-600 hover:bg-indigo-700" onClick={handleSave} disabled={submitting}>
            {submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{t("pages:testForm.dialog.saving")}</> : t("pages:testForm.dialog.complete")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function QuestionItem({ questionIndex, question, topicList, onUpdate, onDelete, onAddNew, onSaveAndAddNew, validationAttempted, autoOpen, onAutoOpenConsumed }) {
  const { t } = useTranslation(["pages"]);
  // Soru Ekle akışında mount olur olmaz dialog'u aç; parent'a bilgi geç (key sıfırlansın).
  const [editOpen, setEditOpen] = useState(!!autoOpen);
  useEffect(() => {
    if (autoOpen) onAutoOpenConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const complete = isQComplete(question);
  const filledOpts = question.options.filter(o => o.content.trim()).length;
  const correctIdx = question.options.findIndex(o => o.isCorrect);
  const correctText = correctIdx >= 0
    ? t("pages:testForm.question.correctIs", { letter: LETTERS[correctIdx] })
    : t("pages:testForm.question.correctMissing");
  // Kullanıcı "Önizleme →" denemiş ve bu soru hâlâ eksik mi?
  // İçerik dokunulmuş ama tamamlanmamış soruları yakalar (boş satır = atılabilir taslak).
  const touched =
    (question.content && question.content.trim()) ||
    question.mediaUrl ||
    question.options.some(o => (o.content && o.content.trim()) || o.mediaUrl || o.isCorrect);
  const showError = validationAttempted && touched && !complete;
  return (
    <>
      {/* Hep görünür tek satır: numara + durum + içerik özet + seçenek/doğru cevap + butonlar.
          Accordion açma/kapama kaldırıldı; her şey aynı satırda, dar ekranda flex-wrap ile alt satıra düşer.
          showError → kırmızı çerçeve, eksik alan uyarısı. */}
      <div className={`rounded-lg px-3 py-2 hover:bg-slate-50/50 border ${showError ? 'border-rose-400 bg-rose-50/40' : 'border-slate-200'}`}>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm font-semibold text-slate-600 flex-shrink-0">
            {t("pages:testForm.question.label", { n: questionIndex + 1 })}
          </span>
          {complete
            ? <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            : <div className="w-4 h-4 rounded-full border-2 border-slate-300 flex-shrink-0" />}
          {question.duplicateWarning && <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />}
          {/* Soru içeriği önizleme metni yerine sabit etiketler: tür + çözümlü işareti.
              Metni gizlemek için min-w-0 flex-1'lik bir spacer var (sağ blokları sağa iter). */}
          {(question.content?.trim() || question.mediaUrl) && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium text-slate-600 flex-shrink-0">
              {question.mediaUrl
                ? t("pages:testForm.question.typeImage")
                : t("pages:testForm.question.typeText")}
            </span>
          )}
          {(question.solutionText?.trim() || question.solutionMediaUrl) && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium text-emerald-700 flex-shrink-0">
              {t("pages:testForm.question.hasSolution")}
            </span>
          )}
          {question.moderationStatus && <ModerationStatusBadge status={question.moderationStatus} />}
          <span className="text-xs text-slate-500 flex-shrink-0 ml-auto">
            {t("pages:testForm.question.selectedCount", { filled: filledOpts })} {correctText}
          </span>
          <div className="flex gap-1 flex-shrink-0">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setEditOpen(true)}
              aria-label={t("pages:testForm.question.edit")}
              title={t("pages:testForm.question.edit")}
              className="h-8 w-8 p-0 text-slate-600 hover:bg-slate-100"
            >
              <Pencil className="w-4 h-4" aria-hidden="true" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0 text-rose-600 hover:bg-rose-50"
              onClick={() => onDelete(questionIndex)}
              aria-label={t("pages:testForm.question.delete")}
              title={t("pages:testForm.question.delete")}
            >
              <Trash2 className="w-4 h-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
        {question.moderationStatus === 'REJECTED' && (
          <div className="mt-2 px-3 py-2 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700">
            {t("pages:testForm.question.rejectedNotice")}
          </div>
        )}
        {showError && (
          <p className="mt-1 text-xs text-rose-600 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" aria-hidden="true" />
            {!question.content?.trim() && !question.mediaUrl
              ? t("pages:testForm.question.errorMissingContent", "Soru metni veya görseli eksik")
              : filledOpts < 2
                ? t("pages:testForm.question.errorMinOptions", "En az 2 seçenek dolu olmalı")
                : correctIdx < 0
                  ? t("pages:testForm.question.errorMissingCorrect", "Doğru cevap işaretlenmemiş")
                  : t("pages:testForm.question.errorIncomplete", "Eksik alan var")}
          </p>
        )}
      </div>
      {editOpen && <QuestionEditDialog question={question} questionIndex={questionIndex} topicList={topicList} onSave={u => onUpdate(u)} onSaveAndNew={u => (onSaveAndAddNew ? onSaveAndAddNew(u) : (onUpdate(u), onAddNew?.()))} onClose={() => setEditOpen(false)} />}
    </>
  );
}

function TestCard({ test, testIndex, examTypes, topicList, onTestUpdate, onTestDelete, totalTests, isExpanded, onToggleExpand, validationAttempted }) {
  const { t } = useTranslation(["pages"]);
  const completedCount = test.questions.filter(isQComplete).length;
  const [confirmDelete, setConfirmDelete] = useState(false);
  // "+ Soru Ekle" tıklandığında yeni eklenen sorunun _k'sini tutar; QuestionItem
  // mount olurken bu key eşleşirse Düzenle dialog'unu otomatik açar. Dialog
  // kapanınca null'a düşer (bir sonraki tıklamada tekrar tetiklenebilsin).
  const [autoOpenKey, setAutoOpenKey] = useState(null);
  const [importType, setImportType] = useState(null); // 'docx' | 'pdf' | null
  const [importLoading, setImportLoading] = useState(false);
  const { maxQuestionsPerTest = 100 } = useServiceStatus();

  // DOCX/PDF içe aktarma — parçalama mantığı lib/importQuestions'ta (ikisinde de aynı).
  // Parse edilen sorular BU testin soru listesine eklenir.
  const runImport = async (file, type) => {
    setImportLoading(true);
    try {
      const questions = type === "pdf"
        ? await parsePdfToQuestions(file, emptyQuestion)
        : await parseDocxToQuestions(file, emptyQuestion);
      if (questions.length === 0) {
        toast.error(t("pages:testForm.createPage.docx.parseError"));
      } else {
        onTestUpdate({ ...test, questions: [...test.questions, ...questions] });
        toast.success(t("pages:testForm.createPage.docx.added", { count: questions.length }));
      }
    } catch (err) {
      toast.error(t("pages:testForm.createPage.docx.importError", { msg: err?.message || t("pages:testForm.createPage.docx.unknownError") }));
    } finally {
      setImportLoading(false);
      setImportType(null);
    }
  };

  // İçeriği üreten render yardımcısı — collapsed iken sadece kısa özet satırı.
  if (!isExpanded) {
    return (
      <Card className="mb-3">
        <button
          type="button"
          onClick={onToggleExpand}
          className="w-full flex items-center justify-between gap-3 p-4 text-left hover:bg-slate-50 transition-colors rounded-xl"
          aria-expanded="false"
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-slate-500">
                {t("pages:testForm.testCard.indexLabel", { index: testIndex + 1 })}
              </span>
              {/* test.title user-generated — çevrilmez */}
              <span className="text-sm font-medium text-slate-900 truncate">
                {test.title?.trim() || t("pages:testForm.preview.untitled")}
              </span>
            </div>
            <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
              <span>
                {t("pages:testForm.testCard.questionCountStat", { count: test.questions.length })}
              </span>
              <span className="text-slate-400">·</span>
              <span>
                {t("pages:testForm.testCard.completedShort", { count: completedCount })}
              </span>
              {test.isTimed && (
                <>
                  <span className="text-slate-400">·</span>
                  <span>{test.duration} dk</span>
                </>
              )}
            </div>
          </div>
          <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" aria-hidden="true" />
        </button>
      </Card>
    );
  }

  return (
    <Card className="mb-4 ring-2 ring-indigo-200">
      <button
        type="button"
        onClick={onToggleExpand}
        className="w-full flex items-center justify-between gap-3 px-6 pt-4 -mb-2 text-left"
        aria-expanded="true"
        aria-label={t("pages:testForm.testCard.collapseAria")}
      >
        <div className="flex items-center gap-2 flex-wrap text-sm text-slate-600">
          <span className="text-xs font-semibold text-indigo-600">
            {t("pages:testForm.testCard.indexLabel", { index: testIndex + 1 })}
          </span>
          <span className="text-slate-300">·</span>
          <span className="text-xs text-slate-500">
            {t("pages:testForm.testCard.completedShort", { count: completedCount })} / {test.questions.length}
          </span>
        </div>
        <ChevronUp className="w-4 h-4 text-slate-400" aria-hidden="true" />
      </button>
      <CardHeader>
        <div className="flex items-start gap-4">
          <div className="flex-1 space-y-3">
            <div className="space-y-2">
              <Label>{t("pages:testForm.testCard.titleLabel")}</Label>
              <Input placeholder={t("pages:testForm.testCard.titlePlaceholder")} value={test.title} onChange={e => onTestUpdate({ ...test, title: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>{t("pages:testForm.package.examTypeLabel")}</Label>
              <Select value={test.examTypeId || "none"} onValueChange={v => onTestUpdate({ ...test, examTypeId: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder={t("pages:testForm.package.examTypePlaceholder")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("pages:testForm.package.examTypeNone")}</SelectItem>
                  {/* examType.name user-generated — çevrilmez */}
                  {(examTypes || []).map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-3 flex-shrink-0">
            {/* Testi Sil butonu süre input'tan ÖNCE — isTimed toggle olduğunda
                süre alanı görünüp kaybolurken bu buton sabit konumda kalır. */}
            {totalTests > 1 && (
              <Button
                size="sm"
                variant="ghost"
                className="text-rose-600 hover:bg-rose-50 w-full"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="w-4 h-4 mr-1" />{t("pages:testForm.testCard.deleteTest")}
              </Button>
            )}
            <div className="flex items-center gap-2">
              <Switch checked={test.isTimed} onCheckedChange={v => onTestUpdate({ ...test, isTimed: v })} />
              <Label className="cursor-pointer text-sm">{t("pages:testForm.testCard.timedToggle")}</Label>
            </div>
            {test.isTimed && (
              <div className="space-y-1">
                <Label className="text-xs">{t("pages:testForm.testCard.durationLabel")}</Label>
                <Input type="number" min="1" className="w-24" value={test.duration} onChange={e => onTestUpdate({ ...test, duration: Number(e.target.value) })} />
              </div>
            )}
          </div>
        </div>
      </CardHeader>

      {/* Testi tamamen silmeden önce onay dialog'u — yanlışlıkla tıklamayı engeller. */}
      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("pages:testForm.testCard.deleteConfirmTitle")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600">{t("pages:testForm.testCard.deleteConfirmBody")}</p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>
              {t("pages:testForm.testCard.deleteConfirmCancel")}
            </Button>
            <Button
              className="bg-rose-600 hover:bg-rose-700 text-white"
              onClick={() => { setConfirmDelete(false); onTestDelete(testIndex); }}
            >
              <Trash2 className="w-4 h-4 mr-1" />{t("pages:testForm.testCard.deleteConfirmConfirm")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <CardContent>
        <div className="mb-3">
          <p className="text-sm font-semibold text-slate-700">
            {t("pages:testForm.testCard.questionCountStat", { count: test.questions.length })}{' '}
            <span className="text-slate-400 font-normal">{t("pages:testForm.testCard.completedSuffix", { count: completedCount })}</span>
          </p>
        </div>
        {/* 10'dan fazla soruda liste sabit yükseklikte scroll olur (sayfa uzamasın;
            aynı anda ~10 soru görünür). 10 ve altında normal akış. */}
        <div className={`space-y-2 ${test.questions.length > 10 ? "max-h-[640px] overflow-y-auto pr-1" : ""}`}>
          {test.questions.map((q, qi) => (
            <QuestionItem key={q._k} questionIndex={qi} question={q} topicList={topicList}
              validationAttempted={validationAttempted}
              autoOpen={q._k === autoOpenKey}
              onAutoOpenConsumed={() => setAutoOpenKey(null)}
              onUpdate={u => onTestUpdate({ ...test, questions: test.questions.map((x, i) => i === qi ? u : x) })}
              onDelete={idx => onTestUpdate({ ...test, questions: test.questions.filter((_, i) => i !== idx) })}
              onAddNew={() => {
                const nq = emptyQuestion();
                setAutoOpenKey(nq._k);
                onTestUpdate({ ...test, questions: [...test.questions, nq] });
              }}
              // "Kaydet ve Yeni": düzenlenen soruyu güncelle + yeni soru ekle TEK state
              // güncellemesinde. Ayrı onUpdate+onAddNew çağrıları aynı stale `test`'ten
              // türetip birbirini eziyordu → düzenlenen soru kaybolurdu.
              onSaveAndAddNew={updatedQ => {
                const nq = emptyQuestion();
                setAutoOpenKey(nq._k);
                onTestUpdate({ ...test, questions: [...test.questions.map((x, i) => i === qi ? updatedQ : x), nq] });
              }}
            />
          ))}
        </div>

        {/* Alt aksiyonlar: Soru Ekle (Test Ekle ile aynı dashed tasarım) + DOCX (ikincil) */}
        <div className="border-t pt-4 mt-3 space-y-2">
          <Button variant="outline"
            className="w-full border-2 border-dashed border-slate-300 text-slate-600 hover:border-indigo-400 hover:bg-indigo-50/50 hover:text-indigo-700"
            onClick={() => {
              if (test.questions.length >= maxQuestionsPerTest) {
                toast.error(t("pages:testForm.testCard.maxQuestionsReached", { max: maxQuestionsPerTest }));
                return;
              }
              const nq = emptyQuestion();
              setAutoOpenKey(nq._k);
              onTestUpdate({ ...test, questions: [...test.questions, nq] });
            }}>
            <Plus className="w-4 h-4 mr-1" />{t("pages:testForm.testCard.addQuestion")}
          </Button>
          <div className="flex flex-wrap justify-center gap-2">
            <Button size="sm" variant="ghost" className="gap-2 text-slate-500 hover:text-slate-700" onClick={() => setImportType("docx")} disabled={importLoading}>
              <Upload className="w-4 h-4" />
              {importLoading && importType === "docx" ? t("pages:testForm.createPage.docx.loading") : t("pages:testForm.createPage.docx.button")}
            </Button>
            <Button size="sm" variant="ghost" className="gap-2 text-slate-500 hover:text-slate-700" onClick={() => setImportType("pdf")} disabled={importLoading}>
              <Upload className="w-4 h-4" />
              {importLoading && importType === "pdf" ? t("pages:testForm.createPage.docx.loading") : t("pages:testForm.createPage.docx.pdfButton")}
            </Button>
          </div>
        </div>

        {/* DOCX/PDF içe aktarma dialog'u (aynı parçalama mantığı) */}
        <Dialog open={!!importType} onOpenChange={(o) => { if (!o) setImportType(null); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>{t("pages:testForm.createPage.docx.dialogTitle")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-slate-600">{t("pages:testForm.createPage.docx.dialogDesc")}</p>
              <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center">
                <label className="cursor-pointer flex flex-col items-center gap-2">
                  <Upload className="w-6 h-6 text-slate-400" />
                  <span className="text-sm font-medium text-slate-600">{t("pages:testForm.createPage.docx.selectFile")}</span>
                  <input
                    type="file"
                    accept={importType === "pdf" ? ".pdf" : ".docx"}
                    className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) runImport(f, importType); e.target.value = ""; }}
                    disabled={importLoading}
                  />
                </label>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

export default function EditTest() {
  const { t } = useTranslation(["pages"]);
  const navigate   = useAppNavigate();
  const urlParams  = new URLSearchParams(window.location.search);
  const packageId  = urlParams.get("id");
  const { minPackagePriceCents = 100, maxTestsPerPackage = 10 } = useServiceStatus();
  const minPriceTL = minPackagePriceCents / 100;

  const { user } = useAuth();

  const [step, setStep]                       = useState(1);
  const [pkgData, setPkgData]                 = useState(null);
  const [tests, setTests]                     = useState([]);
  const [previewIdx, setPreviewIdx]           = useState(null);
  const [initialized, setInitialized]         = useState(false);
  const [expandedTestKey, setExpandedTestKey] = useState(null);
  // Önizleme denenince true olur — eksik sorular kırmızı çerçeveyle vurgulanır.
  // Soru içeriği değişince tekrar false'a çekilir (kullanıcı düzelttiyse uyarı kalkar).
  const [validationAttempted, setValidationAttempted] = useState(false);
  const [showDraftDialog, setShowDraftDialog] = useState(false);
  const [draftInfo, setDraftInfo]             = useState(null);

  // Auto-save: paket + testler editör state'i her değişimde debounce'lu olarak
  // localStorage'a + sunucu DraftSnapshot'a yedeklenir. Cihaz değişse veya
  // tarayıcı kapansa bile eğiticinin emeği kaybolmaz.
  const draftKey = user?.id && packageId ? `editTestWizard_${user.id}_${packageId}` : null;
  const getFormData = useCallback(
    () => (pkgData ? { pkgData, tests } : null),
    [pkgData, tests],
  );
  const { scheduleSave, loadDraft, clearDraft, lastSavedAt, isSaving } = useAutoSave(
    draftKey ?? "__noop__",
    getFormData,
    {
      enabled: !!draftKey && initialized,
      serverKey: packageId && user?.id ? `editTestWizard:${packageId}` : null,
    },
  );

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
      title:         pkgDetail.title        ?? "",
      description:   pkgDetail.description  ?? "",
      priceCents:    pkgDetail.priceCents != null ? pkgDetail.priceCents / 100 : 0,
      examTypeId:    pkgDetail.examTypeId   ?? "",
      difficulty:    pkgDetail.difficulty   ?? "medium",
      coverImageUrl: pkgDetail.cover_image  ?? pkgDetail.coverImageUrl ?? "",
    });
    const mapped = (pkgDetail.tests ?? []).map(tt => ({
      _k: uid(), id: tt.id, title: tt.title ?? "", examTypeId: tt.examTypeId ?? "",
      isTimed: tt.isTimed ?? false, duration: tt.duration ?? 30,
      questions: (tt.questions ?? []).map(apiQToLocal),
    }));
    const initialTests = mapped.length > 0 ? mapped : [emptyTest()];
    setTests(initialTests);
    setExpandedTestKey(initialTests[0]._k);
    setInitialized(true);
  }, [pkgDetail, initialized]);

  // Auto-save: state değiştikçe debounce'lu olarak yedek al
  useEffect(() => {
    if (!initialized || !draftKey) return;
    scheduleSave();
  }, [pkgData, tests, initialized, draftKey, scheduleSave]);

  // Initial mount: lokal + sunucu draft'ını kontrol et. Mevcut paket
  // initialize edildikten sonra (initialized === true) — kullanıcının önceki
  // düzenleme oturumunu kurtarmasını isteyip istemediğini sor.
  useEffect(() => {
    if (!initialized || !draftKey) return;
    let cancelled = false;
    (async () => {
      const draft = await loadDraft();
      if (cancelled || !draft?.data?.pkgData) return;
      // Pakete ait güncel server zamanını kıyasla — paket sunucuda daha yeniyse
      // (örn. başka cihazdan kaydedildi) eski draft'ı görmezden gel.
      const pkgUpdatedAt = pkgDetail?.updatedAt ? new Date(pkgDetail.updatedAt).getTime() : 0;
      const draftAt = draft.savedAt ? new Date(draft.savedAt).getTime() : 0;
      if (draftAt > pkgUpdatedAt) {
        setDraftInfo(draft);
        setShowDraftDialog(true);
      }
    })();
    return () => { cancelled = true; };
  }, [initialized, draftKey, loadDraft, pkgDetail]);

  const saveMutation = useMutation({
    mutationFn: async ({ publish }) => {
      await api.patch(`/packages/${packageId}`, {
        title: pkgData.title, description: pkgData.description || null,
        priceCents: Math.round((pkgData.priceCents || 0) * 100), difficulty: pkgData.difficulty,
        coverImageUrl: pkgData.coverImageUrl || null,
      });

      const origTests   = pkgDetail?.tests ?? [];
      const origTestMap = Object.fromEntries(origTests.map(tt => [tt.id, tt]));

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
              if (e?.response?.status === 409) {
                toast.warning(t("pages:testForm.editPage.cannotDeleteAnswered"));
              }
              else throw e;
            }
          }
        }

        for (let qi = 0; qi < testData.questions.length; qi++) {
          const q = testData.questions[qi];
          if (!isQComplete(q)) continue;
          if (q.id && origQIds.has(q.id)) {
            await api.patch(`/tests/${examTestId}/questions/${q.id}`, {
              content: q.content,
              mediaUrl: q.mediaUrl || undefined,
              order: qi,
              // Çözüm alanları opsiyonel — boş gönderilirse null'la (eğitici sildi).
              solutionText: q.solutionText || null,
              solutionMediaUrl: q.solutionMediaUrl || null,
            });
            for (const opt of q.options) {
              if (opt.id) await api.patch(`/tests/${examTestId}/questions/${q.id}/options/${opt.id}`, { content: opt.content, isCorrect: opt.isCorrect });
            }
          } else {
            const filledOpts = q.options.filter(o => o.content.trim() || o.mediaUrl);
            await api.post(`/tests/${examTestId}/questions`, {
              content: q.content, mediaUrl: q.mediaUrl || undefined, topicId: q.topicId || undefined, order: qi,
              solutionText: q.solutionText || undefined,
              solutionMediaUrl: q.solutionMediaUrl || undefined,
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
      // Kalıcı kayıt başarılıysa hem lokal hem server draft'ını temizle
      clearDraft();
      if (publish === true)       toast.success(t("pages:testForm.editPage.savedAndPublished"));
      else if (publish === false) toast.success(t("pages:testForm.editPage.unpublished"));
      else                        toast.success(t("pages:testForm.editPage.savedChanges"));
      navigate(buildPageUrl("MyTestPackages"), { replace: true });
    },
    onError: (err) => {
      const code = err?.response?.data?.code || err?.response?.data?.error;
      if (code === 'MODERATION_PENDING') {
        toast.error(t("pages:testForm.editPage.moderationPendingError"));
      } else {
        toast.error(err?.response?.data?.message || err?.message || t("pages:testForm.editPage.saveFailed"));
      }
    },
  });

  if (!packageId) return (
    <div className="max-w-2xl mx-auto text-center py-20">
      <p className="text-slate-500 mb-4">{t("pages:testForm.editPage.notFoundId")}</p>
      <Link to={createPageUrl("MyTestPackages")}><Button>{t("pages:testForm.nav.backToPackages")}</Button></Link>
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
      <p className="text-slate-500 mb-4">{t("pages:testForm.editPage.loadFailed")}</p>
      <Link to={createPageUrl("MyTestPackages")}><Button>{t("pages:testForm.nav.backToPackages")}</Button></Link>
    </div>
  );

  const goToTests = () => {
    if (!pkgData.title.trim()) { toast.error(t("pages:testForm.validations.titleRequired")); return; }
    if (!pkgData.priceCents || pkgData.priceCents < minPriceTL) { toast.error(t("pages:testForm.validations.priceMin", { min: minPriceTL })); return; }
    setStep(2);
  };
  const goToPreview = () => {
    if (!tests.some(t2 => t2.title.trim() && t2.questions.some(isQComplete))) {
      toast.error(t("pages:testForm.testsStep.validateAtLeastOne"));
      return;
    }
    // Eksik soruları say. Boş soru (içerik + tüm seçenek boş + işaretsiz) bilinçli
    // taslak satırı olabilir — yalnızca "kısmen doldurulmuş" olanlar uyarıya konu.
    // İşaret: en az bir alana dokunulmuş ama complete değil → eksik kabul edilir.
    let incompleteCount = 0;
    let firstIncompleteTestKey = null;
    for (const tt of tests) {
      for (const q of tt.questions) {
        const touched =
          (q.content && q.content.trim()) ||
          q.mediaUrl ||
          q.options.some(o => (o.content && o.content.trim()) || o.mediaUrl || o.isCorrect);
        if (touched && !isQComplete(q)) {
          incompleteCount += 1;
          if (!firstIncompleteTestKey) firstIncompleteTestKey = tt._k;
        }
      }
    }
    if (incompleteCount > 0) {
      setValidationAttempted(true);
      if (firstIncompleteTestKey) setExpandedTestKey(firstIncompleteTestKey);
      toast.error(t("pages:testForm.testCard.incompleteQuestionsWarning", { count: incompleteCount }));
      return;
    }
    setValidationAttempted(false);
    setStep(3);
  };

  const isPublished = !!pkgDetail?.publishedAt;
  const totalValid  = tests.reduce((s, tt) => s + tt.questions.filter(isQComplete).length, 0);

  return (
    <div className="max-w-4xl mx-auto">
      {/* Draft restore dialog — eğer önceki sekmedeki düzenleme yarıda kalmışsa */}
      <Dialog open={showDraftDialog} onOpenChange={setShowDraftDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Save className="w-5 h-5 text-indigo-600" />
              {t("pages:testForm.editPage.draftDialog.title")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              {t("pages:testForm.editPage.draftDialog.description")}
              {draftInfo?.savedAt && (
                <span className="text-slate-400 ml-1">
                  ({new Date(draftInfo.savedAt).toLocaleString()})
                </span>
              )}
            </p>
            <div className="flex gap-3">
              <Button className="flex-1 bg-indigo-600 hover:bg-indigo-700" onClick={() => {
                if (draftInfo?.data) {
                  setPkgData(draftInfo.data.pkgData);
                  setTests(draftInfo.data.tests);
                  if (draftInfo.data.tests?.length > 0) {
                    setExpandedTestKey(draftInfo.data.tests[0]._k);
                  }
                }
                toast.success(t("pages:testForm.editPage.draftDialog.loaded"));
                setShowDraftDialog(false);
              }}>{t("pages:testForm.editPage.draftDialog.restore")}</Button>
              <Button variant="outline" className="flex-1" onClick={() => {
                clearDraft();
                setShowDraftDialog(false);
              }}>{t("pages:testForm.editPage.draftDialog.discard")}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Link to={createPageUrl("MyTestPackages")} className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-6">
        <ArrowLeft className="w-4 h-4" />{t("pages:testForm.nav.backToPackages")}
      </Link>

      <div className="flex items-center gap-3 mb-8">
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-900">{t("pages:titles.editTest")}</h1>
          {/* pkgDetail.title user-generated — çevrilmez */}
          <p className="text-sm text-slate-500 mt-0.5">{pkgDetail?.title}</p>
        </div>
        {/* Auto-save göstergesi */}
        <div className="text-xs text-slate-400 hidden sm:flex items-center gap-1">
          {isSaving
            ? <><Loader2 className="w-3 h-3 animate-spin" />{t("pages:testForm.editPage.autoSave.saving")}</>
            : lastSavedAt
            ? <span>{t("pages:testForm.editPage.autoSave.savedAt", { time: lastSavedAt.toLocaleTimeString() })}</span>
            : null}
        </div>
        {isPublished
          ? <Badge className="bg-emerald-100 text-emerald-700 border-0">{t("pages:testForm.editPage.publishedBadge")}</Badge>
          : <Badge className="bg-slate-100 text-slate-600 border-0">{t("pages:testForm.editPage.draftBadge")}</Badge>}
      </div>

      <StepIndicator current={step} />

      {/* ADIM 1: Paket */}
      {step === 1 && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Package className="w-5 h-5 text-indigo-600" />{t("pages:testForm.package.sectionTitle")}</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label>{t("pages:testForm.package.titleLabel")}</Label>
              <Input placeholder={t("pages:testForm.package.titlePlaceholder")} value={pkgData.title} onChange={e => setPkgData({ ...pkgData, title: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>{t("pages:testForm.package.descLabel")}</Label>
              <Textarea placeholder={t("pages:testForm.package.descPlaceholder")} rows={3} value={pkgData.description} onChange={e => setPkgData({ ...pkgData, description: e.target.value })} />
            </div>
            <PackageCoverUpload
              value={pkgData.coverImageUrl}
              onChange={(url) => setPkgData({ ...pkgData, coverImageUrl: url })}
              titlePreview={pkgData.title}
              difficulty={pkgData.difficulty}
            />

            <div className="space-y-2">
              <Label>{t("pages:testForm.package.examTypeLabel")}</Label>
              <Select value={pkgData.examTypeId || "none"} onValueChange={v => setPkgData({ ...pkgData, examTypeId: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder={t("pages:testForm.package.examTypePlaceholder")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("pages:testForm.package.examTypeNone")}</SelectItem>
                  {/* exam.name user-generated — çevrilmez */}
                  {examTypes.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("pages:testForm.package.priceLabel")}</Label>
              <Input type="number" min="1" step="1" placeholder={t("pages:testForm.package.pricePlaceholder")} value={pkgData.priceCents || ""} onChange={e => setPkgData({ ...pkgData, priceCents: Number(e.target.value) })} />
              <p className="text-xs text-slate-500">{t("pages:testForm.package.priceMin", { min: minPriceTL })}</p>
            </div>
            <div className="space-y-2">
              <Label>{t("pages:testForm.package.difficultyLabel")}</Label>
              <Select value={pkgData.difficulty} onValueChange={v => setPkgData({ ...pkgData, difficulty: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="easy">{t("pages:testForm.package.difficulty.easy")}</SelectItem>
                  <SelectItem value="medium">{t("pages:testForm.package.difficulty.medium")}</SelectItem>
                  <SelectItem value="hard">{t("pages:testForm.package.difficulty.hard")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end pt-2">
              <Button onClick={goToTests} className="bg-indigo-600 hover:bg-indigo-700">{t("pages:testForm.nav.next")}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ADIM 2: Testler */}
      {step === 2 && (
        <div className="space-y-5">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{t("pages:testForm.testsStep.title")}</h2>
            <p className="text-sm text-slate-500 mt-1">{t("pages:testForm.testsStep.subtitleEdit")}</p>
          </div>
          {tests.map((tt, ti) => (
            <TestCard key={tt._k} test={tt} testIndex={ti} examTypes={examTypes} topicList={topicList}
              totalTests={tests.length}
              isExpanded={tt._k === expandedTestKey}
              validationAttempted={validationAttempted}
              onToggleExpand={() => setExpandedTestKey(prev => prev === tt._k ? null : tt._k)}
              onTestUpdate={u => {
                setTests(tests.map((x, i) => i === ti ? u : x));
                // Kullanıcı bir değişiklik yapıyorsa eski uyarıları temizle —
                // düzelttikçe kırmızı çerçeveler kaybolur.
                if (validationAttempted) setValidationAttempted(false);
              }}
              onTestDelete={idx => {
                const removed = tests[idx];
                setTests(tests.filter((_, i) => i !== idx));
                if (expandedTestKey === removed._k) setExpandedTestKey(null);
              }}
            />
          ))}

          {/* Test Ekle — liste ALTINDA (uzayan listede kullanıcı en altta ekler) */}
          <Button variant="outline"
            className="w-full border-2 border-dashed border-slate-300 text-slate-600 hover:border-indigo-400 hover:bg-indigo-50/50 hover:text-indigo-700"
            onClick={() => {
              if (tests.length >= maxTestsPerPackage) {
                toast.error(t("pages:testForm.testsStep.maxTestsReached", { max: maxTestsPerPackage }));
                return;
              }
              const newT = emptyTest();
              setTests([...tests, newT]);
              setExpandedTestKey(newT._k);
            }}>
            <Plus className="w-4 h-4 mr-1" />{t("pages:testForm.testsStep.addTest")}
          </Button>

          <div className="flex justify-between pt-2">
            <Button variant="outline" onClick={() => setStep(1)}>{t("pages:testForm.nav.back")}</Button>
            <Button onClick={goToPreview} className="bg-indigo-600 hover:bg-indigo-700">{t("pages:testForm.nav.previewNext")}</Button>
          </div>
        </div>
      )}

      {/* ADIM 3: Önizleme & Kaydet */}
      {step === 3 && (
        <div className="space-y-5">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Eye className="w-5 h-5 text-indigo-600" />{t("pages:testForm.preview.sectionTitle")}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-slate-50 rounded-xl p-4 space-y-3">
                <div>
                  <p className="text-xs text-slate-500">{t("pages:testForm.preview.packageTitleLabel")}</p>
                  {/* pkgData.title user-generated */}
                  <p className="text-lg font-semibold text-slate-900">{pkgData.title}</p>
                </div>
                {pkgData.description && (
                  <div>
                    <p className="text-xs text-slate-500">{t("pages:testForm.preview.descriptionLabel")}</p>
                    {/* pkgData.description user-generated */}
                    <p className="text-sm text-slate-700">{pkgData.description}</p>
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">{t("pages:testForm.preview.testsCount", { count: tests.length })}</Badge>
                  <Badge variant="outline">{t("pages:testForm.preview.validQuestions", { count: totalValid })}</Badge>
                  <Badge variant="outline">{pkgData.priceCents === 0 ? t("pages:testForm.preview.free") : `₺${pkgData.priceCents}`}</Badge>
                  {examTypes.find(e => e.id === pkgData.examTypeId)?.name && (
                    <Badge variant="outline" className="border-indigo-200 text-indigo-700 bg-indigo-50">{examTypes.find(e => e.id === pkgData.examTypeId)?.name}</Badge>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-semibold text-slate-700">{t("pages:testForm.preview.testsListTitle")}</p>
                {tests.map((tt, ti) => (
                  <div key={tt._k} className="p-3 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-between">
                    <div>
                      {/* tt.title user-generated */}
                      <p className="font-medium text-slate-900">{tt.title || t("pages:testForm.preview.untitled")}</p>
                      <p className="text-sm text-slate-500">{t("pages:testForm.preview.validQuestions", { count: tt.questions.filter(isQComplete).length })}</p>
                    </div>
                    <Button size="sm" variant="ghost" className="text-indigo-600" onClick={() => setPreviewIdx(ti)}><Eye className="w-4 h-4" /></Button>
                  </div>
                ))}
              </div>
              <div className="border-t pt-4">
                <div className="flex gap-3 flex-wrap">
                  <Button variant="outline" className="flex-1" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate({ publish: null })}>
                    <Save className="w-4 h-4 mr-2" />{saveMutation.isPending ? t("pages:testForm.editPage.saving") : t("pages:testForm.editPage.saveChanges")}
                  </Button>
                  {!isPublished ? (
                    <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700 gap-2" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate({ publish: true })}>
                      <CheckCircle2 className="w-4 h-4" />{saveMutation.isPending ? t("pages:testForm.editPage.publishing") : t("pages:testForm.editPage.saveAndPublish")}
                    </Button>
                  ) : (
                    <Button variant="outline" className="flex-1 border-amber-200 text-amber-700 hover:bg-amber-50" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate({ publish: false })}>
                      {saveMutation.isPending ? t("pages:testForm.editPage.unpublishing") : t("pages:testForm.editPage.unpublish")}
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
          <Button variant="outline" onClick={() => setStep(2)}>{t("pages:testForm.nav.backToTests")}</Button>
        </div>
      )}

      {previewIdx !== null && tests[previewIdx] && (
        <TestPreviewModal isOpen questions={tests[previewIdx].questions.filter(isQComplete)} title={tests[previewIdx].title} onClose={() => setPreviewIdx(null)} />
      )}
    </div>
  );
}
