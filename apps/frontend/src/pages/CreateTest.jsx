import { useState, useCallback, useEffect } from "react";
import { createPageUrl } from "@/utils";
import { entities, topics as topicsApi } from "@/api/dalClient";
import { useAuth } from "@/lib/AuthContext";
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
import { toast } from "sonner";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  ArrowLeft, WrenchIcon, History, Plus, Package,
  BookOpen, Eye, CheckCircle2, Trash2, AlertTriangle, Upload, X, Loader2, ImagePlus,
} from "lucide-react";
import { Link } from "react-router-dom";
import { buildPageUrl, useAppNavigate } from "@/lib/navigation";
import { useServiceStatus } from "@/lib/useServiceStatus";
import OnboardingTour from "@/components/onboarding/OnboardingTour";
import { useShouldShowTour, useCompleteTour, TOUR_KEYS } from "@/lib/useOnboarding";
import { EDUCATOR_CREATE_STEPS } from "@/components/onboarding/tourSteps";
import { useAutoSave } from "@/lib/useAutoSave";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { TestPreviewModal } from "@/components/TestPreviewModal";
import { ModerationStatusBadge } from "@/components/test/ModerationStatusBadge";

// ─── Sabitler ───────────────────────────────────────────────────────────────
const STEPS = [
  { id: 1, label: "Paket",    icon: Package    },
  { id: 2, label: "Testler",  icon: BookOpen   },
  { id: 3, label: "Önizleme", icon: Eye        },
];

const LETTERS = ["A", "B", "C", "D", "E"];

// ─── Yardımcı fonksiyonlar ──────────────────────────────────────────────────
const uid = () => Math.random().toString(36).slice(2);

function emptyOption() {
  return { _k: uid(), content: "", mediaUrl: "", isCorrect: false };
}

function emptyQuestion() {
  return {
    _k: uid(),
    content: "",
    mediaUrl: "",
    options: [emptyOption(), emptyOption(), emptyOption(), emptyOption(), emptyOption()],
    topicId: null,
    duplicateWarning: null,
  };
}

function emptyTest() {
  return {
    _k: uid(),
    title: "",
    examTypeId: "",
    isTimed: false,
    duration: 30,
    questions: [emptyQuestion()],
  };
}

// ─── Adım göstergesi ────────────────────────────────────────────────────────
function StepIndicator({ current }) {
  return (
    <div className="flex items-center justify-center mb-8">
      {STEPS.map((step, i) => {
        const Icon = step.icon;
        const done   = current > step.id;
        const active = current === step.id;
        return (
          <div key={step.id} className="flex items-center">
            <div className="flex flex-col items-center gap-1">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-colors ${
                done   ? "bg-indigo-600 border-indigo-600 text-white"
                : active ? "bg-white border-indigo-600 text-indigo-600"
                         : "bg-white border-slate-200 text-slate-400"
              }`}>
                {done ? <CheckCircle2 className="w-5 h-5" /> : <Icon className="w-4 h-4" />}
              </div>
              <span className={`text-xs font-medium ${
                active ? "text-indigo-600" : done ? "text-slate-600" : "text-slate-400"
              }`}>
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`w-16 h-0.5 mx-1 mb-5 transition-colors ${
                current > step.id ? "bg-indigo-600" : "bg-slate-200"
              }`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Upload yardımcısı (dialog içi kullanım) ────────────────────────────────
async function doUpload(file) {
  const fd = new FormData();
  fd.append("file", file);
  const { data } = await api.post("/upload/image", fd);
  return data.url || data.fileUrl || data.file_url || "";
}

// ─── Soru düzenleme dialog'u ─────────────────────────────────────────────────
function QuestionEditDialog({ question, questionIndex, topicList, onSave, onSaveAndNew, onClose }) {
  const makeLocalState = (q) => ({
    ...q,
    _imgFile: null,
    _imgPreview: null,
    options: q.options.map(o => ({ ...o, _imgFile: null, _imgPreview: null })),
  });

  const [local, setLocal] = useState(() => makeLocalState(question));
  const [displayIndex, setDisplayIndex] = useState(questionIndex);
  const [submitting, setSubmitting] = useState(false);
  const [duplicateLoading, setDuplicateLoading] = useState(false);
  const [dialogErrors, setDialogErrors] = useState({});

  const handleContentBlur = async () => {
    const text = local.content.trim();
    if (text.length >= 15 && !local.duplicateWarning) {
      setDuplicateLoading(true);
      try {
        const { data } = await api.post("/educators/me/questions/check-duplicate", {
          content: text,
          excludeQuestionId: null,
        });
        if (data?.isDuplicate) {
          setLocal(prev => ({ ...prev, duplicateWarning: data }));
          toast.warning("Benzer bir soru bulundu. İsterseniz devam edebilirsiniz.");
        }
      } catch {
        // Sessiz hata (educator'lar 403 alabilir)
      } finally {
        setDuplicateLoading(false);
      }
    }
  };

  // Görselleri yükler, blob URL'leri temizler, kaydedilecek nesneyi döndürür
  const prepareAndUpload = async () => {
    let mediaUrl = local.mediaUrl || "";
    if (local._imgFile) mediaUrl = await doUpload(local._imgFile);

    const options = await Promise.all(local.options.map(async (opt) => {
      let optMediaUrl = opt.mediaUrl || "";
      if (opt._imgFile) optMediaUrl = await doUpload(opt._imgFile);
      const { _imgFile, _imgPreview, ...rest } = opt;
      return { ...rest, mediaUrl: optMediaUrl };
    }));

    if (local._imgPreview) URL.revokeObjectURL(local._imgPreview);
    local.options.forEach(o => { if (o._imgPreview) URL.revokeObjectURL(o._imgPreview); });

    const { _imgFile, _imgPreview, ...rest } = local;
    return { ...rest, mediaUrl, options };
  };

  const validate = () => {
    const errs = {};
    if (!local.content.trim() && !local.mediaUrl && !local._imgFile)
      errs.content = "Soru metni veya görsel zorunludur";
    const filledOpts = local.options.filter(o => o.content.trim() || o.mediaUrl || o._imgFile);
    if (filledOpts.length < 2)
      errs.options = "En az 2 seçenek doldurulmalıdır";
    if (!local.options.some(o => o.isCorrect))
      errs.correct = "Doğru seçeneği işaretleyiniz (A–E)";
    setDialogErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSubmitting(true);
    try {
      const saved = await prepareAndUpload();
      onSave(saved);
      onClose();
    } catch (e) {
      console.error("Tamamla error:", e);
      toast.error(e?.message || "Kaydedilirken hata oluştu");
      setSubmitting(false);
    }
  };

  const handleSaveAndNew = async () => {
    if (!validate()) return;
    setSubmitting(true);
    try {
      const saved = await prepareAndUpload();
      onSaveAndNew(saved); // ebeveyni güncelle + yeni boş soru ekle
      // Dialog'u sıfırla — yeni boş soru için
      const newQ = emptyQuestion();
      setDisplayIndex(prev => prev + 1);
      setLocal(makeLocalState(newQ));
    } catch (e) {
      console.error("Yeni Soru error:", e);
      toast.error(e?.message || "Kaydedilirken hata oluştu");
    } finally {
      setSubmitting(false);
    }
  };

  const qImgDisplay = local._imgPreview || local.mediaUrl || null;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-screen overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Soru {displayIndex + 1} Düzenle</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Soru metni */}
          <div className="space-y-2">
            <Label>Soru Metni</Label>
            <Textarea
              placeholder="Soru metnini giriniz..."
              value={local.content}
              onChange={(e) => { setLocal(prev => ({ ...prev, content: e.target.value, duplicateWarning: null })); setDialogErrors(p => ({ ...p, content: "" })); }}
              onBlur={handleContentBlur}
              disabled={duplicateLoading}
              rows={3}
              className={dialogErrors.content ? "border-rose-500 focus-visible:ring-rose-500" : ""}
            />
            {dialogErrors.content && (
              <p className="text-xs text-rose-500 mt-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{dialogErrors.content}</p>
            )}
            {duplicateLoading && (
              <p className="text-xs text-slate-500 flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" />
                Kopya soru kontrol ediliyor...
              </p>
            )}
            {local.duplicateWarning && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
                <p className="font-medium text-amber-900">Uyarı: Benzer bir soru bulundu</p>
                <p className="text-amber-700 mt-1 text-xs">
                  Benzerlik: {Math.round(local.duplicateWarning.similarity * 100)}%
                </p>
              </div>
            )}
          </div>

          {/* Soru görseli */}
          <div className="space-y-2">
            <Label>Soru Görseli (İsteğe Bağlı)</Label>
            <div className="flex items-center gap-3 flex-wrap">
              <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-slate-200 bg-white hover:bg-slate-50 text-slate-600">
                <ImagePlus className="w-4 h-4" /> Görsel Seç
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (!f) return;
                    if (local._imgPreview) URL.revokeObjectURL(local._imgPreview);
                    setLocal(prev => ({ ...prev, _imgFile: f, _imgPreview: URL.createObjectURL(f), mediaUrl: "" }));
                  }}
                />
              </label>
              {qImgDisplay && (
                <>
                  <div className="w-16 h-12 rounded-lg overflow-hidden bg-slate-100 border border-slate-200 flex-shrink-0">
                    <img src={qImgDisplay} alt="" className="w-full h-full object-cover" />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (local._imgPreview) URL.revokeObjectURL(local._imgPreview);
                      setLocal(prev => ({ ...prev, _imgFile: null, _imgPreview: null, mediaUrl: "" }));
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-rose-200 bg-white hover:bg-rose-50 text-rose-600"
                  >
                    <X className="w-4 h-4" />Temizle
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Konu seçimi */}
          <div className="space-y-2">
            <Label>Konu (İsteğe Bağlı)</Label>
            <Select
              value={local.topicId || "none"}
              onValueChange={(v) => setLocal(prev => ({ ...prev, topicId: v === "none" ? null : v }))}
            >
              <SelectTrigger><SelectValue placeholder="Konu seçin" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Seçilmedi —</SelectItem>
                {topicList.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.parentName ? `${t.parentName} / ${t.name}` : t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Seçenekler */}
          <div className="space-y-3">
            <Label>Seçenekler</Label>
            {local.options.map((opt, optIdx) => {
              const optImgDisplay = opt._imgPreview || opt.mediaUrl || null;
              return (
                <div key={opt._k} className="p-3 rounded-lg bg-slate-50 space-y-2">
                  <div className="flex items-start gap-3">
                    <RadioGroup
                      value={local.options.find(o => o.isCorrect)?._k || ""}
                      onValueChange={(v) => setLocal(prev => ({
                        ...prev,
                        options: prev.options.map(o => ({ ...o, isCorrect: o._k === v })),
                      }))}
                    >
                      <div className="flex items-center space-x-2 pt-1">
                        <RadioGroupItem
                          value={opt._k}
                          id={`dlg-opt-${question._k}-${optIdx}`}
                          disabled={!opt.content.trim() && !opt.mediaUrl && !opt._imgFile}
                        />
                        <label htmlFor={`dlg-opt-${question._k}-${optIdx}`} className="text-sm font-semibold cursor-pointer">
                          {LETTERS[optIdx]}
                        </label>
                      </div>
                    </RadioGroup>

                    <div className="flex-1 space-y-2">
                      <Input
                        placeholder={`Seçenek ${LETTERS[optIdx]}`}
                        value={opt.content}
                        onChange={(e) => setLocal(prev => ({
                          ...prev,
                          options: prev.options.map((o, i) => i === optIdx ? { ...o, content: e.target.value } : o),
                        }))}
                      />
                      <div className="flex items-center gap-2 flex-wrap">
                        <label className="cursor-pointer inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium border border-slate-200 bg-white hover:bg-slate-50 text-slate-600">
                          <ImagePlus className="w-3 h-3" />Görsel
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              e.target.value = "";
                              if (!f) return;
                              if (opt._imgPreview) URL.revokeObjectURL(opt._imgPreview);
                              setLocal(prev => ({
                                ...prev,
                                options: prev.options.map((o, i) =>
                                  i === optIdx
                                    ? { ...o, _imgFile: f, _imgPreview: URL.createObjectURL(f), mediaUrl: "" }
                                    : o
                                ),
                              }));
                            }}
                          />
                        </label>
                        {optImgDisplay && (
                          <>
                            <div className="w-8 h-8 rounded bg-slate-100 overflow-hidden flex-shrink-0 border border-slate-200">
                              <img src={optImgDisplay} alt="" className="w-full h-full object-cover" />
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                if (opt._imgPreview) URL.revokeObjectURL(opt._imgPreview);
                                setLocal(prev => ({
                                  ...prev,
                                  options: prev.options.map((o, i) =>
                                    i === optIdx ? { ...o, _imgFile: null, _imgPreview: null, mediaUrl: "" } : o
                                  ),
                                }));
                              }}
                              className="inline-flex items-center px-1.5 py-1 rounded text-xs border border-slate-200 bg-white hover:bg-rose-50 text-rose-500"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Seçenek hataları */}
            {(dialogErrors.options || dialogErrors.correct) && (
              <div className="space-y-1">
                {dialogErrors.options && (
                  <p className="text-xs text-rose-500 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{dialogErrors.options}</p>
                )}
                {dialogErrors.correct && (
                  <p className="text-xs text-rose-500 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{dialogErrors.correct}</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 pt-4 border-t flex-wrap">
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            İptal
          </Button>
          {onSaveAndNew && (
            <Button
              variant="outline"
              className="border-indigo-300 text-indigo-600 hover:bg-indigo-50"
              onClick={handleSaveAndNew}
              disabled={submitting}
            >
              {submitting
                ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Kaydediliyor...</>
                : <><Plus className="w-4 h-4 mr-1" />Yeni Soru</>
              }
            </Button>
          )}
          <Button
            className="bg-indigo-600 hover:bg-indigo-700"
            onClick={handleSave}
            disabled={submitting}
          >
            {submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Kaydediliyor...</> : "Tamamla"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Soru maddesi accordion ──────────────────────────────────────────────────
function QuestionItem({ questionIndex, question, topicList, onUpdate, onDelete, onAddNew }) {
  const [editOpen, setEditOpen] = useState(false);

  const isComplete = (question.content.trim() || question.mediaUrl) &&
    question.options.filter(o => o.content.trim() || o.mediaUrl).length >= 2 &&
    question.options.some(o => o.isCorrect);

  return (
    <>
      <AccordionItem value={question._k}>
        <AccordionTrigger className="hover:no-underline">
          <div className="flex items-center gap-3 text-left flex-1">
            <span className="text-sm font-semibold text-slate-600">Soru {questionIndex + 1}</span>
            {isComplete
              ? <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              : <div className="w-4 h-4 rounded-full border-2 border-slate-300 flex-shrink-0" />
            }
            {question.duplicateWarning && (
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
            )}
            {question.content && (
              <span className="text-xs text-slate-400 truncate max-w-xs">{question.content}</span>
            )}
            {question.moderationStatus && (
              <ModerationStatusBadge status={question.moderationStatus} />
            )}
          </div>
        </AccordionTrigger>
        <AccordionContent className="pt-2 pb-1">
          {/* Moderasyon REJECTED banner */}
          {question.moderationStatus === 'REJECTED' && (
            <div className="mb-3 px-3 py-2 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700">
              Bu soru içerik politikasına aykırı bulundu.
            </div>
          )}
          {/* Ozet bilgi */}
          {question.mediaUrl && (
            <p className="text-xs text-slate-500 mb-2">Görsel eklenmiş</p>
          )}
          <p className="text-xs text-slate-500 mb-3">
            {question.options.filter(o => o.content.trim()).length}/5 secenek dolu
            {question.options.find(o => o.isCorrect)
              ? " • Dogru cevap: " + LETTERS[question.options.findIndex(o => o.isCorrect)]
              : " • Dogru cevap secilmedi"
            }
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
              <WrenchIcon className="w-3 h-3 mr-1" />Düzenle
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-rose-600 hover:text-rose-700 hover:bg-rose-50"
              onClick={() => onDelete(questionIndex)}
            >
              <Trash2 className="w-4 h-4 mr-1" />Sil
            </Button>
          </div>
        </AccordionContent>
      </AccordionItem>

      {editOpen && (
        <QuestionEditDialog
          question={question}
          questionIndex={questionIndex}
          topicList={topicList}
          onSave={(updated) => onUpdate(updated)}
          onSaveAndNew={(updated) => {
            onUpdate(updated);
            if (onAddNew) onAddNew();
          }}
          onClose={() => setEditOpen(false)}
        />
      )}
    </>
  );
}

// ─── Test kartı (Adım 2'de) ─────────────────────────────────────────────────
function TestCard({ test, testIndex, examTypes, topicList, onTestUpdate, onTestDelete, error, onErrorClear }) {
  const [showDOCXDialog, setShowDOCXDialog] = useState(false);
  const [docxLoading, setDocxLoading] = useState(false);

  const handleDOCXImport = async (file) => {
    setDocxLoading(true);
    try {
      const mammoth = await import("mammoth");
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.convertToHtml({ arrayBuffer });
      const html = result.value;

      // Basit HTML parse: <p>, <li> elemanlarını böl
      const div = document.createElement("div");
      div.innerHTML = html;
      const lines = Array.from(div.querySelectorAll("p, li"))
        .map((el) => el.textContent.trim())
        .filter((t) => t.length > 0);

      const questions = [];
      let currentQuestion = null;

      for (const line of lines) {
        // Soru tanımı: numarası veya "Soru:" ile başlar
        if (/^(soru:|\d+\s*\.)/i.test(line)) {
          if (currentQuestion && currentQuestion.options.length >= 2) {
            questions.push(currentQuestion);
          }
          currentQuestion = emptyQuestion();
          currentQuestion.content = line.replace(/^(soru:|\d+\s*\.\s*)/i, "").trim();
        } else if (currentQuestion && /^([A-E])\s*\)\s*(.+)/.test(line)) {
          // Seçenek: A) B) C) D) E)
          const match = line.match(/^([A-E])\s*\)\s*(.+)/);
          const letter = match[1];
          const text = match[2].trim();
          const idx = LETTERS.indexOf(letter);
          if (idx >= 0 && idx < currentQuestion.options.length) {
            currentQuestion.options[idx].content = text;
          }
        } else if (currentQuestion && /^\*|cevap:/i.test(line)) {
          // Doğru cevap işareti
          const match = line.match(/^[\*]*\s*([A-E])/i);
          if (match) {
            const letter = match[1].toUpperCase();
            const idx = LETTERS.indexOf(letter);
            if (idx >= 0) {
              currentQuestion.options = currentQuestion.options.map((o, i) => ({
                ...o,
                isCorrect: i === idx,
              }));
            }
          }
        }
      }

      if (currentQuestion && currentQuestion.options.length >= 2) {
        questions.push(currentQuestion);
      }

      if (questions.length === 0) {
        toast.error("DOCX'ten soru parse edilemedi. Lütfen manuel ekleyiniz.");
      } else {
        onTestUpdate({
          ...test,
          questions: [...test.questions, ...questions],
        });
        toast.success(`${questions.length} soru eklendi`);
      }
    } catch (err) {
      if (err.message?.includes("mammoth")) {
        toast.error("DOCX import paketi yüklü değil");
      } else {
        toast.error("DOCX import başarısız: " + (err?.message || "Bilinmeyen hata"));
      }
    } finally {
      setDocxLoading(false);
      setShowDOCXDialog(false);
    }
  };

  const filledQuestions = test.questions.filter((q) => {
    const filled = q.options.filter((o) => o.content.trim() || o.mediaUrl);
    return (q.content.trim() || q.mediaUrl) && filled.length >= 2 && q.options.some((o) => o.isCorrect);
  });

  return (
    <Card className="mb-4">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="space-y-2">
              <Label htmlFor={`test-title-${test._k}`}>Test Başlığı *</Label>
              <Input
                id={`test-title-${test._k}`}
                placeholder="Örn: YKS Matematik"
                value={test.title}
                onChange={(e) => {
                  onTestUpdate({ ...test, title: e.target.value });
                  if (onErrorClear) onErrorClear(test._k);
                }}
                className={error ? "border-rose-500 focus-visible:ring-rose-500" : ""}
              />
              {error && (
                <p className="text-xs text-rose-500 mt-1 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />{error}
                </p>
              )}
            </div>
            <div className="space-y-2 mt-3">
              <Label htmlFor={`test-type-${test._k}`}>Sınav Türü (İsteğe Bağlı)</Label>
              <Select value={test.examTypeId || "none"} onValueChange={(v) => onTestUpdate({ ...test, examTypeId: v === "none" ? "" : v })}>
                <SelectTrigger id={`test-type-${test._k}`}><SelectValue placeholder="Seçin" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Seçilmedi —</SelectItem>
                  {(examTypes || []).map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <Switch id={`timed-${test._k}`} checked={test.isTimed} onCheckedChange={(v) => onTestUpdate({ ...test, isTimed: v })} />
              <Label htmlFor={`timed-${test._k}`} className="cursor-pointer">Süreli</Label>
            </div>
            {test.isTimed && (
              <div className="space-y-2">
                <Label htmlFor={`duration-${test._k}`}>Süre (dakika)</Label>
                <Input
                  id={`duration-${test._k}`}
                  type="number"
                  min="1"
                  value={test.duration}
                  onChange={(e) => onTestUpdate({ ...test, duration: Number(e.target.value) })}
                />
              </div>
            )}
          </div>
          {test.title && (
            <Button size="sm" variant="ghost" className="text-rose-600 hover:bg-rose-50"
              onClick={() => onTestDelete(testIndex)}>
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Sorular accordionu */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-slate-700">
              {test.questions.length} soru ({filledQuestions.length} tamamlanmış)
            </p>
            <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700"
              onClick={() => onTestUpdate({
                ...test,
                questions: [...test.questions, emptyQuestion()],
              })}>
              <Plus className="w-4 h-4 mr-1" />Soru Ekle
            </Button>
          </div>
          <Accordion type="single" collapsible className="space-y-2">
            {test.questions.map((q, qIdx) => (
              <QuestionItem
                key={q._k}
                test={test}
                questionIndex={qIdx}
                question={q}
                topicList={topicList}
                onUpdate={(updated) => {
                  onTestUpdate({
                    ...test,
                    questions: test.questions.map((x, i) => i === qIdx ? updated : x),
                  });
                }}
                onDelete={(idx) => {
                  onTestUpdate({
                    ...test,
                    questions: test.questions.filter((_, i) => i !== idx),
                  });
                }}
                onAddNew={() => {
                  onTestUpdate({
                    ...test,
                    questions: [...test.questions, emptyQuestion()],
                  });
                }}
              />
            ))}
          </Accordion>
        </div>

        {/* DOCX import */}
        <div className="border-t pt-4">
          <Button size="sm" variant="outline" className="gap-2" onClick={() => setShowDOCXDialog(true)} disabled={docxLoading}>
            <Upload className="w-4 h-4" />
            {docxLoading ? "Yükleniyor..." : "DOCX İçeri Aktar"}
          </Button>
        </div>

        {/* DOCX dialog */}
        <Dialog open={showDOCXDialog} onOpenChange={setShowDOCXDialog}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>DOCX'ten Sorular İçeri Aktar</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                Word dosyasını seçin. Sorular otomatik olarak ayrıştırılacak.
              </p>
              <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center">
                <label className="cursor-pointer flex flex-col items-center gap-2">
                  <Upload className="w-6 h-6 text-slate-400" />
                  <span className="text-sm font-medium text-slate-600">DOCX Dosya Seç</span>
                  <input
                    type="file"
                    accept=".docx"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleDOCXImport(file);
                      e.target.value = "";
                    }}
                    disabled={docxLoading}
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

// ─── Ana bileşen ────────────────────────────────────────────────────────────
export default function CreateTest() {
  const { user }     = useAuth();
  const navigate     = useAppNavigate();
  const { packageCreationEnabled, minPackagePriceCents = 100 } = useServiceStatus();
  const minPriceTL = minPackagePriceCents / 100;
  const showCreateTour = useShouldShowTour(TOUR_KEYS.EDUCATOR_CREATE);
  const completeTour   = useCompleteTour();

  // ─── Sihirbaz durumu ────────────────────────────────────────────────
  const [step, setStep] = useState(1);
  const [previewTestIndex, setPreviewTestIndex] = useState(null);
  const [pkgErrors, setPkgErrors] = useState({});
  const [testErrors, setTestErrors] = useState({});

  const [pkgData, setPkgData] = useState({
    title: "",
    description: "",
    priceCents: 0,
    examTypeId: "",
    difficulty: "medium",
  });

  const [tests, setTests] = useState([emptyTest()]);

  // ─── Taslak kurtarma ────────────────────────────────────────────
  const [showDraftDialog, setShowDraftDialog] = useState(false);
  const [draftInfo, setDraftInfo] = useState(null);
  const draftKey = user?.id ? `createTestWizard_${user.id}` : null;
  const getFormData = useCallback(() => ({ pkgData, tests }), [pkgData, tests]);
  const { hasDraft, loadDraft, clearDraft } = useAutoSave(
    draftKey ?? "__noop__",
    getFormData,
    { enabled: !!draftKey && step <= 2 },
  );

  useEffect(() => {
    if (!draftKey) return;
    if (hasDraft()) {
      const draft = loadDraft();
      if (draft?.data?.pkgData?.title) {
        setDraftInfo(draft);
        setShowDraftDialog(true);
      }
    }
  }, [draftKey]);

  // ─── Sorgular ─────────────────────────────────────────────────────
  const { data: examTypes = [] } = useQuery({
    queryKey: ["examTypes"],
    queryFn: () => entities.ExamType.filter({ is_active: true }),
    enabled: !!user,
  });

  const { data: topicList = [] } = useQuery({
    queryKey: ["topicsFlat"],
    queryFn: async () => {
      try {
        // examTypeId filtresi olmadan tüm konuları çek (exam türüne bağlı olmayan konular da görünsün)
        return await topicsApi.flat(undefined);
      } catch {
        return [];
      }
    },
    enabled: step >= 2,
    retry: false,
    staleTime: 60_000,
  });

  // ─── Mutasyonlar ────────────────────────────────────────────────
  // publish=true → yayınla, publish=false → taslak kaydet
  const publishMutation = useMutation({
    mutationFn: async (publish = true) => {
      // 1. Her test için ExamTest oluştur
      const createdTestIds = [];
      for (const testData of tests) {
        if (!testData.title.trim()) continue; // Başlıksız testi atla

        const { data: created } = await api.post("/tests", {
          title: testData.title,
          examTypeId: testData.examTypeId || undefined,
          price: 0, // Fiyat paket düzeyinde
          isTimed: testData.isTimed,
          duration: testData.isTimed ? testData.duration : undefined,
        });

        // Soruları ekle
        for (let qi = 0; qi < testData.questions.length; qi++) {
          const q = testData.questions[qi];
          const filledOpts = q.options.filter(o => o.content.trim() || o.mediaUrl);
          if (!filledOpts.length || !q.options.some(o => o.isCorrect)) continue; // Tamamlanmamış soruyu atla

          await api.post(`/tests/${created.id}/questions`, {
            content: q.content,
            mediaUrl: q.mediaUrl || undefined,
            topicId: q.topicId || undefined,
            order: qi,
            options: filledOpts.map(o => ({
              content: o.content,
              mediaUrl: o.mediaUrl || undefined,
              isCorrect: o.isCorrect,
            })),
          });
        }

        createdTestIds.push(created.id);
      }

      if (createdTestIds.length === 0) {
        throw new Error("En az bir geçerli test oluşturmalısınız");
      }

      // 2. TestPackage oluştur
      const { data: pkg } = await api.post("/packages", {
        title: pkgData.title,
        description: pkgData.description || undefined,
        priceCents: Math.round((pkgData.priceCents || 0) * 100),
        examTypeId: pkgData.examTypeId || undefined,
        difficulty: pkgData.difficulty || "medium",
      });

      // 3. Testleri pakete ekle
      for (const testId of createdTestIds) {
        await api.post(`/packages/${pkg.id}/tests`, { testId });
      }

      // 4. Yayınla (opsiyonel)
      if (publish) {
        await api.put(`/packages/${pkg.id}/publish`);
      }

      return { pkg, publish };
    },
    onSuccess: (result) => {
      clearDraft();
      if (result.publish) {
        toast.success("Paket oluşturuldu ve yayınlandı!");
      } else {
        toast.success("Paket taslak olarak kaydedildi.");
      }
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

  // ─── Guard'lar ───────────────────────────────────────────────────
  if (!user) {
    return (
      <div className="max-w-2xl mx-auto text-center py-20">
        <p className="text-slate-600 mb-4">Test oluşturmak için giriş yapın</p>
        <Link to={createPageUrl("Login")}>
          <Button className="bg-indigo-600 hover:bg-indigo-700">Giriş Yap</Button>
        </Link>
      </div>
    );
  }

  if (!packageCreationEnabled) {
    return (
      <div className="max-w-2xl mx-auto text-center py-20">
        <div className="w-20 h-20 mx-auto bg-amber-100 rounded-full flex items-center justify-center mb-4">
          <WrenchIcon className="w-10 h-10 text-amber-600" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Bakım Modu</h2>
        <p className="text-slate-600">Test oluşturma geçici olarak durdurulmuştur.</p>
      </div>
    );
  }

  if (user.role === "EDUCATOR" && user?.status === "PENDING_EDUCATOR_APPROVAL") {
    return (
      <div className="max-w-2xl mx-auto text-center py-20">
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Hesap Onayı Bekleniyor</h2>
        <p className="text-slate-600 mb-6">
          Test oluşturabilmek için hesabınızın yönetici tarafından onaylanması gerekiyor.
        </p>
        <Link to={createPageUrl("EducatorSettings")}>
          <Button className="bg-indigo-600 hover:bg-indigo-700">Profil Ayarlarına Git</Button>
        </Link>
      </div>
    );
  }

  // ─── Geçiş işleyicileri ────────────────────────────────────────
  const goToTests = () => {
    const errs = {};
    if (!pkgData.title.trim()) errs.title = "Paket başlığı zorunludur";
    if (!pkgData.priceCents || pkgData.priceCents < minPriceTL)
      errs.price = `Fiyat en az ${minPriceTL} ₺ olmalıdır`;
    if (Object.keys(errs).length) {
      setPkgErrors(errs);
      return;
    }
    setPkgErrors({});
    setStep(2);
  };

  const goToPreview = () => {
    const errs = {};
    tests.forEach((t) => {
      if (!t.title.trim()) {
        errs[t._k] = "Test başlığı zorunludur";
      } else {
        const validQuestions = t.questions.filter((q) => {
          const filledOpts = q.options.filter(o => o.content.trim() || o.mediaUrl);
          return (q.content.trim() || q.mediaUrl) && filledOpts.length >= 2 && q.options.some(o => o.isCorrect);
        });
        if (validQuestions.length === 0) {
          errs[t._k] = "En az bir tamamlanmış soru gereklidir";
        }
      }
    });

    const validTests = tests.filter((t) => !errs[t._k]);
    if (validTests.length === 0) {
      setTestErrors(errs);
      return;
    }
    setTestErrors(errs);
    setStep(3);
  };

  const draftSavedAt = draftInfo?.savedAt
    ? (() => {
        try {
          return format(new Date(draftInfo.savedAt), "d MMM yyyy HH:mm", { locale: tr });
        } catch {
          return draftInfo.savedAt;
        }
      })()
    : null;

  // ─── Render ─────────────────────────────────────────────────────
  return (
    <div className="max-w-4xl mx-auto">
      {/* Taslak kurtarma */}
      <Dialog open={showDraftDialog} onOpenChange={setShowDraftDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="w-5 h-5 text-indigo-600" />
              Kaydedilmemiş Taslak
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              <strong>"{draftInfo?.data?.pkgData?.title}"</strong> başlıklı kaydedilmemiş bir taslak bulundu.
              {draftSavedAt && <span className="text-slate-400"> ({draftSavedAt})</span>}
            </p>
            <div className="flex gap-3">
              <Button className="flex-1 bg-indigo-600 hover:bg-indigo-700" onClick={() => {
                if (draftInfo?.data) {
                  setPkgData(draftInfo.data.pkgData);
                  setTests(draftInfo.data.tests);
                }
                toast.success("Taslak yüklendi");
                setShowDraftDialog(false);
              }}>Devam Et</Button>
              <Button variant="outline" className="flex-1" onClick={() => {
                clearDraft();
                setShowDraftDialog(false);
              }}>Sil, Yeniden Başla</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Onboarding */}
      {showCreateTour && (
        <OnboardingTour
          steps={EDUCATOR_CREATE_STEPS}
          onComplete={() => completeTour(TOUR_KEYS.EDUCATOR_CREATE)}
          onSkip={() => completeTour(TOUR_KEYS.EDUCATOR_CREATE)}
        />
      )}

      {/* Başlık */}
      <Link to={createPageUrl("EducatorDashboard")}
        className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-6">
        <ArrowLeft className="w-4 h-4" />
        Dashboard'a Dön
      </Link>

      <h1 className="text-2xl font-bold text-slate-900 mb-1">Yeni Test Paketi Oluştur</h1>
      <p className="text-slate-500 mb-8">3 adımda testlerinizi hazırlayın ve yayınlayın.</p>

      <StepIndicator current={step} />

      {/* ── ADIM 1: Paket ─────────────────────────────────────────── */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="w-5 h-5 text-indigo-600" />
              Paket Bilgileri
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="pkg-title">Paket Başlığı *</Label>
              <Input id="pkg-title" placeholder="Örn: KPSS Genel Yetenek Paket"
                value={pkgData.title}
                onChange={(e) => { setPkgData({ ...pkgData, title: e.target.value }); setPkgErrors(p => ({ ...p, title: "" })); }}
                className={pkgErrors.title ? "border-rose-500 focus-visible:ring-rose-500" : ""} />
              {pkgErrors.title && <p className="text-xs text-rose-500 mt-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{pkgErrors.title}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="pkg-desc">Açıklama</Label>
              <Textarea id="pkg-desc" placeholder="Paket hakkında..." rows={3}
                value={pkgData.description}
                onChange={(e) => setPkgData({ ...pkgData, description: e.target.value })} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="pkg-type">Sınav Türü (İsteğe Bağlı)</Label>
              <Select value={pkgData.examTypeId || "none"} onValueChange={(v) => setPkgData({ ...pkgData, examTypeId: v === "none" ? "" : v })}>
                <SelectTrigger id="pkg-type"><SelectValue placeholder="Seçin" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Seçilmedi —</SelectItem>
                  {examTypes.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="pkg-price">Fiyat (₺) *</Label>
              <Input id="pkg-price" type="number" min="1" step="1" placeholder="Örn: 49"
                value={pkgData.priceCents || ""}
                onChange={(e) => { setPkgData({ ...pkgData, priceCents: Number(e.target.value) }); setPkgErrors(p => ({ ...p, price: "" })); }}
                className={pkgErrors.price ? "border-rose-500 focus-visible:ring-rose-500" : ""} />
              {pkgErrors.price
                ? <p className="text-xs text-rose-500 mt-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{pkgErrors.price}</p>
                : <p className="text-xs text-slate-500">Minimum fiyat: {minPriceTL} ₺</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="pkg-difficulty">Zorluk Seviyesi *</Label>
              <Select
                value={pkgData.difficulty}
                onValueChange={(v) => setPkgData({ ...pkgData, difficulty: v })}
              >
                <SelectTrigger id="pkg-difficulty">
                  <SelectValue placeholder="Zorluk seçin" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="easy">🟢 Kolay</SelectItem>
                  <SelectItem value="medium">🟡 Orta</SelectItem>
                  <SelectItem value="hard">🔴 Zor</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-end pt-2">
              <Button onClick={goToTests} className="bg-indigo-600 hover:bg-indigo-700">
                İleri →
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── ADIM 2: Testler ──────────────────────────────────────── */}
      {step === 2 && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Testler & Sorular</h2>
              <p className="text-sm text-slate-500 mt-1">Her teste sorular ekleyip düzenleyin</p>
            </div>
            <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700"
              onClick={() => setTests([...tests, emptyTest()])}>
              <Plus className="w-4 h-4 mr-1" />Test Ekle
            </Button>
          </div>

          {tests.map((test, tIdx) => (
            <TestCard
              key={test._k}
              test={test}
              testIndex={tIdx}
              examTypes={examTypes}
              topicList={topicList}
              error={testErrors[test._k]}
              onErrorClear={(key) => setTestErrors(p => ({ ...p, [key]: "" }))}
              onTestUpdate={(updated) => {
                setTests(tests.map((t, i) => i === tIdx ? updated : t));
              }}
              onTestDelete={(idx) => {
                setTests(tests.filter((_, i) => i !== idx));
              }}
              onAddQuestion={() => {
                setTests(tests.map((t, i) =>
                  i === tIdx ? { ...t, questions: [...t.questions, emptyQuestion()] } : t
                ));
              }}
            />
          ))}

          {tests.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center text-slate-500">
                <BookOpen className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                <p className="font-medium">Henüz test eklenmedi</p>
              </CardContent>
            </Card>
          )}

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(1)}>← Geri</Button>
            <Button onClick={goToPreview} className="bg-indigo-600 hover:bg-indigo-700">
              Önizleme →
            </Button>
          </div>
        </div>
      )}

      {/* ── ADIM 3: Önizleme & Yayınla ────────────────────────── */}
      {step === 3 && (
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Eye className="w-5 h-5 text-indigo-600" />
                Paket Özeti
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-slate-50 rounded-xl p-4 space-y-3">
                <div>
                  <p className="text-xs text-slate-500">Paket Başlığı</p>
                  <p className="text-lg font-semibold text-slate-900">{pkgData.title}</p>
                </div>
                {pkgData.description && (
                  <div>
                    <p className="text-xs text-slate-500">Açıklama</p>
                    <p className="text-sm text-slate-700">{pkgData.description}</p>
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">{tests.length} test</Badge>
                  <Badge variant="outline">
                    {tests.reduce((acc, t) => acc + t.questions.filter(q => {
                      const filled = q.options.filter(o => o.content.trim() || o.mediaUrl);
                      return (q.content.trim() || q.mediaUrl) && filled.length >= 2 && q.options.some(o => o.isCorrect);
                    }).length, 0)} soru
                  </Badge>
                  <Badge variant="outline">{pkgData.priceCents === 0 ? "Ücretsiz" : `₺${pkgData.priceCents}`}</Badge>
                  {examTypes.find(e => e.id === pkgData.examTypeId)?.name && (
                    <Badge variant="outline" className="border-indigo-200 text-indigo-700 bg-indigo-50">
                      {examTypes.find(e => e.id === pkgData.examTypeId)?.name}
                    </Badge>
                  )}
                </div>
              </div>

              {/* Test listesi */}
              <div className="space-y-2">
                <p className="text-sm font-semibold text-slate-700">Testler</p>
                {tests.map((t, tIdx) => {
                  const validQuestions = t.questions.filter(q => {
                    const filled = q.options.filter(o => o.content.trim() || o.mediaUrl);
                    return (q.content.trim() || q.mediaUrl) && filled.length >= 2 && q.options.some(o => o.isCorrect);
                  });
                  return (
                    <div key={t._k} className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium text-slate-900">{t.title || "Başlıksız Test"}</p>
                          <p className="text-sm text-slate-600">{validQuestions.length} soru</p>
                        </div>
                        <Button size="sm" variant="ghost" className="text-indigo-600"
                          onClick={() => {
                            setPreviewTestIndex(tIdx);
                          }}>
                          <Eye className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="border-t pt-4 space-y-3">
                <p className="text-sm text-slate-500">
                  Paket yayınlandığında öğrenciler tarafından görülebilir ve satın alınabilir hale gelir.
                </p>
                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1"
                    disabled={publishMutation.isPending}
                    onClick={() => publishMutation.mutate(false)}>
                    {publishMutation.isPending ? "Kaydediliyor..." : "Taslak Kaydet"}
                  </Button>
                  <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700 gap-2"
                    disabled={publishMutation.isPending}
                    onClick={() => publishMutation.mutate(true)}>
                    <CheckCircle2 className="w-4 h-4" />
                    {publishMutation.isPending ? "Yayınlanıyor..." : "Yayınla"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Button variant="outline" onClick={() => setStep(2)}>← Geri (Testler)</Button>
        </div>
      )}

      {/* Önizleme modalı */}
      {previewTestIndex !== null && tests[previewTestIndex] && (
        <TestPreviewModal
          isOpen={previewTestIndex !== null}
          questions={tests[previewTestIndex].questions.filter((q) => {
            const filled = q.options.filter(o => o.content.trim() || o.mediaUrl);
            return (q.content.trim() || q.mediaUrl) && filled.length >= 2 && q.options.some(o => o.isCorrect);
          })}
          title={tests[previewTestIndex].title}
          onClose={() => setPreviewTestIndex(null)}
        />
      )}
    </div>
  );
}
