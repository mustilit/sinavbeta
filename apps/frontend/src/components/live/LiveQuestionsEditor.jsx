/**
 * LiveQuestionsEditor — Canlı sınav SORU EDİTÖRÜ (paylaşılan).
 *
 * Market eğitici "Canlı Test Oluştur" (LiveSessionCreate) sihirbazının 2. adımı
 * (Sorular) buradan birebir kullanılır; E-Sınıf canlı sınav oluşturma da AYNI
 * bileşeni kullanır. Böylece soru ekleme yapısı (sabit 5 şık, kompakt soru
 * satırları + düzenleme dialog'u, "Soru Ekle") iki tarafta tek kaynaktan gelir
 * ve sürüklenmez.
 *
 * Prop'lar:
 *  - questions / setQuestions : kontrollü soru listesi (her soru emptyQuestion() şekli)
 *  - topicList                : konu combobox verisi (showTopic ise)
 *  - showTopic                : Konu seçimi göster (market: true, okul: false)
 *  - checkDuplicate           : soru metninde kopya kontrolü (market: true, okul: false)
 *  - showDocxImport           : DOCX içe aktarma butonu (market: true, okul: false)
 */
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { TopicCombobox } from "@/components/ui/TopicCombobox";
import api from "@/lib/api/apiClient";
import { toast } from "sonner";
import { Plus, Trash2, CheckCircle2, Loader2, BookOpen, AlertTriangle, ImagePlus, X, Upload, Pencil } from "lucide-react";

// ─── Sabitler + factory'ler ──────────────────────────────────────────────────
export const uid = () => Math.random().toString(36).slice(2);
export const LETTERS = ["A", "B", "C", "D", "E"];

export const emptyOption = () => ({ _k: uid(), content: "", mediaUrl: "", isCorrect: false });
export const emptyQuestion = () => ({
  _k: uid(),
  content: "",
  mediaUrl: "",
  options: [emptyOption(), emptyOption(), emptyOption(), emptyOption(), emptyOption()],
  topicId: null,
  duplicateWarning: null,
});

// ─── Görsel yükleme ──────────────────────────────────────────────────────────
export async function doUpload(file) {
  const fd = new FormData();
  fd.append("file", file);
  const { data } = await api.post("/upload/image", fd);
  return data.url || data.fileUrl || data.file_url || "";
}

// ─── Soru düzenleme dialog'u ──────────────────────────────────────────────────
function QuestionEditDialog({ question, questionIndex, topicList, showTopic, checkDuplicate, onSave, onSaveAndNew, onClose }) {
  const makeLocalState = (q) => ({
    ...q,
    _imgFile: null,
    _imgPreview: null,
    options: q.options.map(o => ({ ...o, _imgFile: null, _imgPreview: null })),
  });

  const [local, setLocal]           = useState(() => makeLocalState(question));
  const [submitting, setSubmitting] = useState(false);
  const [dupLoading, setDupLoading] = useState(false);
  const [dialogErrors, setDialogErrors] = useState({});

  const handleContentBlur = async () => {
    if (!checkDuplicate) return;
    const text = local.content.trim();
    if (text.length >= 15 && !local.duplicateWarning) {
      setDupLoading(true);
      try {
        const { data } = await api.post("/educators/me/questions/check-duplicate", {
          content: text, excludeQuestionId: null,
        });
        if (data?.isDuplicate) {
          setLocal(p => ({ ...p, duplicateWarning: data }));
          toast.warning("Benzer bir soru bulundu. İsterseniz devam edebilirsiniz.");
        }
      } catch { /* sessiz */ } finally { setDupLoading(false); }
    }
  };

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
    const filled = local.options.filter(o => o.content.trim() || o.mediaUrl || o._imgFile);
    if (filled.length < 2) errs.options = "En az 2 seçenek doldurulmalıdır";
    if (!local.options.some(o => o.isCorrect)) errs.correct = "Doğru seçeneği işaretleyiniz (A–E)";
    setDialogErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSubmitting(true);
    try { const saved = await prepareAndUpload(); onSave(saved); onClose(); }
    catch (e) { toast.error(e?.message || "Kaydedilirken hata oluştu"); setSubmitting(false); }
  };

  const handleSaveAndNew = async () => {
    if (!validate()) return;
    setSubmitting(true);
    try {
      const saved = await prepareAndUpload();
      onSaveAndNew(saved);
      onClose();
    } catch (e) {
      toast.error(e?.message || "Kaydedilirken hata oluştu");
      setSubmitting(false);
    }
  };

  const qImgDisplay = local._imgPreview || local.mediaUrl || null;

  const isBrandNew =
    !question.content.trim() &&
    !question.mediaUrl &&
    !question.options.some((o) => o.content.trim() || o.mediaUrl);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-screen overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isBrandNew ? `Soru ${questionIndex + 1} Ekle` : `Soru ${questionIndex + 1} Düzenle`}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-5 py-2">
          <div className="space-y-5">
            {/* Soru metni */}
            <div className="space-y-2">
              <Label>Soru Metni</Label>
              <Textarea
                placeholder="Soru metnini giriniz..."
                value={local.content}
                onChange={(e) => { setLocal(p => ({ ...p, content: e.target.value, duplicateWarning: null })); setDialogErrors(p => ({ ...p, content: "" })); }}
                onBlur={handleContentBlur}
                disabled={dupLoading}
                rows={3}
                className={dialogErrors.content ? "border-rose-500 focus-visible:ring-rose-500" : ""}
              />
              {dialogErrors.content && (
                <p className="text-xs text-rose-500 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />{dialogErrors.content}
                </p>
              )}
              {dupLoading && (
                <p className="text-xs text-slate-500 flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" />Kopya soru kontrol ediliyor...
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
                  <input type="file" accept="image/*" className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0]; e.target.value = "";
                      if (!f) return;
                      if (local._imgPreview) URL.revokeObjectURL(local._imgPreview);
                      setLocal(p => ({ ...p, _imgFile: f, _imgPreview: URL.createObjectURL(f), mediaUrl: "" }));
                    }}
                  />
                </label>
                {qImgDisplay && (
                  <>
                    <div className="w-16 h-12 rounded-lg overflow-hidden bg-slate-100 border border-slate-200 flex-shrink-0">
                      <img src={qImgDisplay} alt="" className="w-full h-full object-cover" />
                    </div>
                    <button type="button"
                      onClick={() => {
                        if (local._imgPreview) URL.revokeObjectURL(local._imgPreview);
                        setLocal(p => ({ ...p, _imgFile: null, _imgPreview: null, mediaUrl: "" }));
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-rose-200 bg-white hover:bg-rose-50 text-rose-600"
                    >
                      <X className="w-4 h-4" />Temizle
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Konu seçimi — arama destekli + ağaç yolu (opsiyonel) */}
            {showTopic && (
              <div className="space-y-2">
                <Label>Konu (İsteğe Bağlı)</Label>
                <TopicCombobox
                  value={local.topicId ?? null}
                  onChange={(id) => setLocal(p => ({ ...p, topicId: id }))}
                  topics={topicList}
                  placeholder="Konu seçin..."
                  searchPlaceholder="Konu ara (örn. Sayılar)..."
                />
              </div>
            )}
          </div>{/* /sol sütun */}

          {/* Seçenekler — sağ sütun */}
          <div className="space-y-3">
            <Label>Seçenekler</Label>
            {local.options.map((opt, oi) => {
              const optImg = opt._imgPreview || opt.mediaUrl || null;
              return (
                <div key={opt._k} className="p-3 rounded-lg bg-slate-50 space-y-2">
                  <div className="flex items-start gap-3">
                    <RadioGroup
                      value={local.options.find(o => o.isCorrect)?._k || ""}
                      onValueChange={(v) => setLocal(p => ({
                        ...p, options: p.options.map(o => ({ ...o, isCorrect: o._k === v })),
                      }))}
                    >
                      <div className="flex items-center space-x-2 pt-1">
                        <RadioGroupItem
                          value={opt._k}
                          id={`live-opt-${question._k}-${oi}`}
                          disabled={!opt.content.trim() && !opt.mediaUrl && !opt._imgFile}
                        />
                        <label htmlFor={`live-opt-${question._k}-${oi}`} className="text-sm font-semibold cursor-pointer">
                          {LETTERS[oi]}
                        </label>
                      </div>
                    </RadioGroup>

                    <div className="flex-1 space-y-2">
                      <Input
                        placeholder={`Seçenek ${LETTERS[oi]}`}
                        value={opt.content}
                        onChange={(e) => setLocal(p => ({
                          ...p, options: p.options.map((o, i) => i === oi ? { ...o, content: e.target.value } : o),
                        }))}
                      />
                      <div className="flex items-center gap-2 flex-wrap">
                        <label className="cursor-pointer inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium border border-slate-200 bg-white hover:bg-slate-50 text-slate-600">
                          <ImagePlus className="w-3 h-3" />Görsel
                          {/* multiple: birden fazla dosya seçilirse mevcut seçenekten itibaren
                              sıralı olarak A, B, C... seçeneklerine dağıtılır. */}
                          <input type="file" accept="image/*" multiple className="hidden"
                            onChange={(e) => {
                              const files = Array.from(e.target.files ?? []);
                              e.target.value = "";
                              if (files.length === 0) return;
                              setLocal((p) => {
                                const next = [...p.options];
                                let filled = 0;
                                for (let k = 0; k < files.length && (oi + k) < next.length; k++) {
                                  const idx = oi + k;
                                  const target = next[idx];
                                  if (target._imgPreview) URL.revokeObjectURL(target._imgPreview);
                                  next[idx] = {
                                    ...target,
                                    _imgFile: files[k],
                                    _imgPreview: URL.createObjectURL(files[k]),
                                    mediaUrl: "",
                                  };
                                  filled++;
                                }
                                if (files.length > 1) {
                                  toast.success(`${filled} seçeneğe görsel atandı`);
                                }
                                if (files.length > filled) {
                                  toast.warning(`${files.length - filled} dosya kalan seçenek olmadığı için atlandı`);
                                }
                                return { ...p, options: next };
                              });
                            }}
                          />
                        </label>
                        {optImg && (
                          <>
                            <div className="w-8 h-8 rounded bg-slate-100 overflow-hidden flex-shrink-0 border border-slate-200">
                              <img src={optImg} alt="" className="w-full h-full object-cover" />
                            </div>
                            <button type="button"
                              onClick={() => {
                                if (opt._imgPreview) URL.revokeObjectURL(opt._imgPreview);
                                setLocal(p => ({
                                  ...p, options: p.options.map((o, i) =>
                                    i === oi ? { ...o, _imgFile: null, _imgPreview: null, mediaUrl: "" } : o
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

            {(dialogErrors.options || dialogErrors.correct) && (
              <div className="space-y-1">
                {dialogErrors.options && (
                  <p className="text-xs text-rose-500 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />{dialogErrors.options}
                  </p>
                )}
                {dialogErrors.correct && (
                  <p className="text-xs text-rose-500 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />{dialogErrors.correct}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 pt-4 border-t flex-wrap">
          <Button variant="outline" onClick={onClose} disabled={submitting}>İptal</Button>
          {onSaveAndNew && (
            <Button variant="outline" className="border-indigo-300 text-indigo-600 hover:bg-indigo-50"
              onClick={handleSaveAndNew} disabled={submitting}>
              {submitting
                ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Kaydediliyor...</>
                : <><Plus className="w-4 h-4 mr-1" />Yeni Soru</>}
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

// ─── Soru satırı (kompakt) ───────────────────────────────────────────────────
function QuestionItem({ questionIndex, question, topicList, showTopic, checkDuplicate, onUpdate, onDelete, onAddNew, autoOpenEdit, onAutoOpenHandled }) {
  const [editOpen, setEditOpen] = useState(false);

  useEffect(() => {
    if (autoOpenEdit) {
      setEditOpen(true);
      onAutoOpenHandled?.();
    }
  }, [autoOpenEdit, onAutoOpenHandled]);

  const filledOpts = question.options.filter(o => o.content.trim() || o.mediaUrl).length;
  const correctIdx = question.options.findIndex(o => o.isCorrect);
  const isComplete = (question.content.trim() || question.mediaUrl) && filledOpts >= 2 && correctIdx >= 0;
  const correctText = correctIdx >= 0
    ? " • Doğru cevap: " + LETTERS[correctIdx]
    : " • Doğru cevap seçilmedi";

  return (
    <>
      <div className="border border-slate-200 rounded-lg px-3 py-2 hover:bg-slate-50/50">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm font-semibold text-slate-600 flex-shrink-0">Soru {questionIndex + 1}</span>
          {isComplete
            ? <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            : <div className="w-4 h-4 rounded-full border-2 border-slate-300 flex-shrink-0" />}
          {question.duplicateWarning && (
            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
          )}
          {(question.content?.trim() || question.mediaUrl) && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium text-slate-600 flex-shrink-0">
              {question.mediaUrl ? "Görsel" : "Metin"}
            </span>
          )}
          <span className="text-xs text-slate-500 flex-shrink-0 ml-auto">
            {filledOpts} Seçenekli{correctText}
          </span>
          <div className="flex gap-1 flex-shrink-0">
            <Button size="sm" variant="ghost" onClick={() => setEditOpen(true)} aria-label="Düzenle" title="Düzenle" className="h-8 w-8 p-0 text-slate-600 hover:bg-slate-100">
              <Pencil className="w-4 h-4" aria-hidden="true" />
            </Button>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-rose-600 hover:text-rose-700 hover:bg-rose-50" onClick={() => onDelete(questionIndex)} aria-label="Sil" title="Sil">
              <Trash2 className="w-4 h-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
      </div>

      {editOpen && (
        <QuestionEditDialog
          question={question}
          questionIndex={questionIndex}
          topicList={topicList}
          showTopic={showTopic}
          checkDuplicate={checkDuplicate}
          onSave={(updated) => onUpdate(updated)}
          onSaveAndNew={(updated) => { onUpdate(updated); if (onAddNew) onAddNew(); }}
          onClose={() => setEditOpen(false)}
        />
      )}
    </>
  );
}

// ─── Editör (Sorular bölümü) ─────────────────────────────────────────────────
export function LiveQuestionsEditor({
  questions,
  setQuestions,
  topicList = [],
  showTopic = true,
  checkDuplicate = true,
  showDocxImport = true,
}) {
  const [pendingEditKey, setPendingEditKey] = useState(null);
  const [showDOCXDialog, setShowDOCXDialog] = useState(false);
  const [docxLoading, setDocxLoading] = useState(false);

  const addQuestion = () => {
    const q = emptyQuestion();
    setQuestions((qs) => [...qs, q]);
    setPendingEditKey(q._k); // yeni sorunun düzenleme dialog'unu otomatik aç
  };
  const updateQuestion = (idx, updated) => setQuestions((qs) => qs.map((q, i) => (i === idx ? updated : q)));
  const deleteQuestion = (idx) => setQuestions((qs) => qs.filter((_, i) => i !== idx));

  const completedCount = questions.filter((q) => {
    const filled = q.options.filter((o) => o.content.trim() || o.mediaUrl);
    return (q.content.trim() || q.mediaUrl) && filled.length >= 2 && q.options.some((o) => o.isCorrect);
  }).length;

  const handleDOCXImport = async (file) => {
    setDocxLoading(true);
    try {
      const mammoth = await import("mammoth");
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.convertToHtml({ arrayBuffer });
      const html = result.value;
      const div = document.createElement("div");
      div.innerHTML = html;
      const parsed = [];

      const topLists = Array.from(div.children).filter((el) => el.tagName === "OL" || el.tagName === "UL");
      for (const list of topLists) {
        const questionItems = Array.from(list.children).filter((el) => el.tagName === "LI");
        for (const qLi of questionItems) {
          const subList = Array.from(qLi.children).find((el) => el.tagName === "OL" || el.tagName === "UL");
          let qText;
          if (subList) {
            const clone = qLi.cloneNode(true);
            clone.querySelectorAll("ol, ul").forEach((n) => n.remove());
            qText = clone.textContent.trim();
          } else {
            qText = qLi.textContent.trim();
          }
          if (!qText) continue;
          const q = emptyQuestion();
          q.content = qText;
          if (subList) {
            const optionItems = Array.from(subList.children).filter((el) => el.tagName === "LI");
            optionItems.slice(0, q.options.length).forEach((optLi, i) => { q.options[i].content = optLi.textContent.trim(); });
          }
          if (q.options.filter((o) => o.content.trim()).length >= 2 || qText) parsed.push(q);
        }
      }

      if (parsed.length === 0) {
        const lines = Array.from(div.querySelectorAll("p, li")).map((el) => el.textContent.trim()).filter((t) => t.length > 0);
        let currentQuestion = null;
        for (const line of lines) {
          if (/^(soru:|\d+\s*\.)/i.test(line)) {
            if (currentQuestion) parsed.push(currentQuestion);
            currentQuestion = emptyQuestion();
            currentQuestion.content = line.replace(/^(soru:|\d+\s*\.\s*)/i, "").trim();
          } else if (currentQuestion && /^([A-E])\s*\)\s*(.+)/.test(line)) {
            const match = line.match(/^([A-E])\s*\)\s*(.+)/);
            const idx = LETTERS.indexOf(match[1]);
            if (idx >= 0 && idx < currentQuestion.options.length) currentQuestion.options[idx].content = match[2].trim();
          } else if (currentQuestion && /^\*|cevap:/i.test(line)) {
            const match = line.match(/^[\*]*\s*([A-E])/i);
            if (match) {
              const idx = LETTERS.indexOf(match[1].toUpperCase());
              if (idx >= 0) currentQuestion.options = currentQuestion.options.map((o, i) => ({ ...o, isCorrect: i === idx }));
            }
          }
        }
        if (currentQuestion) parsed.push(currentQuestion);
      }

      if (parsed.length === 0) {
        toast.error("DOCX'ten soru parse edilemedi. Lütfen manuel ekleyiniz.");
      } else {
        setQuestions((prev) => {
          const allEmpty = prev.length === 1 && !prev[0].content.trim() && !prev[0].options.some((o) => o.content.trim());
          return allEmpty ? parsed : [...prev, ...parsed];
        });
        toast.success(`${parsed.length} soru eklendi`);
      }
    } catch (err) {
      if (err.message?.includes("mammoth")) toast.error("DOCX import paketi yüklü değil");
      else toast.error("DOCX import başarısız: " + (err?.message || "Bilinmeyen hata"));
    } finally {
      setDocxLoading(false);
      setShowDOCXDialog(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Sorular</h2>
          <p className="text-sm text-slate-500 mt-1">{completedCount}/{questions.length} soru tamamlandı</p>
        </div>
        <div className="flex items-center gap-2">
          {showDocxImport && (
            <Button size="sm" variant="outline" className="gap-2" onClick={() => setShowDOCXDialog(true)} disabled={docxLoading}>
              <Upload className="w-4 h-4" />{docxLoading ? "Yükleniyor..." : "DOCX İçeri Aktar"}
            </Button>
          )}
          <Button size="sm" className="bg-amber-500 hover:bg-amber-600" onClick={addQuestion}>
            <Plus className="w-4 h-4 mr-1" />Soru Ekle
          </Button>
        </div>
      </div>

      {showDocxImport && (
        <Dialog open={showDOCXDialog} onOpenChange={setShowDOCXDialog}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>DOCX'ten Sorular İçeri Aktar</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-slate-600">Word dosyasını seçin. Sorular otomatik olarak ayrıştırılacak.</p>
              <p className="text-xs text-slate-500">Format: <code>1. Soru metni</code>, ardından <code>A) ... E)</code> seçenekleri, son satırda <code>Cevap: A</code> veya <code>*A</code>.</p>
              <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center">
                <label className="cursor-pointer flex flex-col items-center gap-2">
                  <Upload className="w-6 h-6 text-slate-400" aria-hidden="true" />
                  <span className="text-sm font-medium text-slate-600">DOCX Dosya Seç</span>
                  <input type="file" accept=".docx" className="hidden" disabled={docxLoading}
                    onChange={(e) => { const file = e.target.files?.[0]; if (file) handleDOCXImport(file); e.target.value = ""; }} />
                </label>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      <div className="space-y-2">
        {questions.map((q, idx) => (
          <QuestionItem
            key={q._k}
            questionIndex={idx}
            question={q}
            topicList={topicList}
            showTopic={showTopic}
            checkDuplicate={checkDuplicate}
            onUpdate={(updated) => updateQuestion(idx, updated)}
            onDelete={(i) => deleteQuestion(i)}
            onAddNew={addQuestion}
            autoOpenEdit={pendingEditKey === q._k}
            onAutoOpenHandled={() => setPendingEditKey(null)}
          />
        ))}
      </div>

      {questions.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-slate-500">
            <BookOpen className="w-12 h-12 text-slate-200 mx-auto mb-3" />
            <p className="font-medium">Henüz soru eklenmedi</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
