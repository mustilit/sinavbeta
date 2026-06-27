/**
 * SchoolExamQuestionsEditor — E-Sınıf sınav soru editörü.
 *
 * Market (Test/Yazılı) editörüyle AYNI desen:
 *  - Kompakt soru satırları: numara + durum + "Metin/Görsel" + "{N} Seçenekli • Doğru: X"
 *    (TEST/TUNNEL) ya da "Çözümlü" (WRITTEN) + Düzenle/Sil.
 *  - "Soru Ekle" yeni soruyu ekleyip düzenleme dialog'unu otomatik açar. DOCX içe aktarma.
 *  - Düzenleme dialog'u (2 sütun): solda Soru Metni + Görsel + Puan + Çözüm + çözüm görseli;
 *    sağda Seçenekler A–E (sabit 5) radio + içerik + şık görseli. WRITTEN'da şık yok, çözüm zorunlu.
 *
 * Görseller dialog "Tamamla"da /upload/image'a yüklenir; state'e mediaUrl olarak yazılır.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Plus, Trash2, Pencil, ImagePlus, X, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { doUpload } from "@/components/live/LiveQuestionsEditor";

export const uid = () => Math.random().toString(36).slice(2);
export const LETTERS = ["A", "B", "C", "D", "E"];

const emptyOption = (isCorrect = false) => ({ content: "", mediaUrl: "", isCorrect });
export const emptyChoiceQ = () => ({ _k: uid(), content: "", mediaUrl: "", points: 1, solutionText: "", solutionMediaUrl: "", options: [emptyOption(true), emptyOption(), emptyOption(), emptyOption(), emptyOption()] });
export const emptyWrittenQ = () => ({ _k: uid(), content: "", mediaUrl: "", points: 1, solutionText: "", solutionMediaUrl: "" });

/** API soruları → yerel düzenleme şekli (stabil _k + 5 sabit şık choice'ta). */
export function toLocalQuestions(apiQuestions, choice) {
  return (apiQuestions ?? []).map((q) => {
    const base = { _k: uid(), content: q.content ?? "", mediaUrl: q.mediaUrl ?? "", points: q.points ?? 1, solutionText: q.solutionText ?? "", solutionMediaUrl: q.solutionMediaUrl ?? "" };
    if (!choice) return base;
    const opts = (q.options ?? []).map((o) => ({ content: o.content ?? "", mediaUrl: o.mediaUrl ?? "", isCorrect: !!o.isCorrect }));
    while (opts.length < 5) opts.push(emptyOption());
    return { ...base, options: opts };
  });
}

const filledOptCount = (q) => (q.options ?? []).filter((o) => o.content?.trim() || o.mediaUrl).length;
const correctLetter = (q) => {
  const idx = (q.options ?? []).findIndex((o) => o.isCorrect && (o.content?.trim() || o.mediaUrl));
  return idx >= 0 ? LETTERS[idx] : null;
};
const isComplete = (q, choice) => choice
  ? !!((q.content?.trim() || q.mediaUrl) && filledOptCount(q) >= 2 && correctLetter(q))
  : !!((q.content?.trim() || q.mediaUrl) && q.solutionText?.trim());

// ─── Görsel seçici (buton + önizleme + temizle) ──────────────────────────────
function ImagePicker({ url, onPick, onClear, small, label = "Görsel" }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <label className={`cursor-pointer inline-flex items-center gap-1 rounded border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 font-medium ${small ? "px-2 py-1 text-xs" : "px-3 py-2 text-sm"}`}>
        <ImagePlus className={small ? "w-3 h-3" : "w-4 h-4"} /> {label}
        <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onPick(f); }} />
      </label>
      {url && (
        <>
          <div className={`rounded overflow-hidden bg-slate-100 border border-slate-200 flex-shrink-0 ${small ? "w-8 h-8" : "w-16 h-12"}`}><img src={url} alt="" className="w-full h-full object-cover" /></div>
          <button type="button" onClick={onClear} className="inline-flex items-center px-1.5 py-1 rounded text-xs border border-slate-200 bg-white hover:bg-rose-50 text-rose-500"><X className="w-3.5 h-3.5" /></button>
        </>
      )}
    </div>
  );
}

// ─── Soru düzenleme dialog'u ──────────────────────────────────────────────────
function QuestionEditDialog({ question, index, choice, onSave, onSaveAndNew, onClose }) {
  const [local, setLocal] = useState(() => ({
    ...question,
    _imgFile: null, _imgPreview: null,
    _solFile: null, _solPreview: null,
    options: (question.options ?? []).map((o) => ({ ...o, _imgFile: null, _imgPreview: null })),
  }));
  const [submitting, setSubmitting] = useState(false);

  const setOpt = (j, patch) => setLocal((p) => ({ ...p, options: p.options.map((o, idx) => (idx === j ? { ...o, ...patch } : o)) }));
  const setCorrect = (key) => setLocal((p) => ({ ...p, options: p.options.map((o, idx) => ({ ...o, isCorrect: String(idx) === key })) }));

  const validate = () => {
    if (!local.content.trim() && !local.mediaUrl && !local._imgFile) { toast.error("Soru metni veya görsel zorunlu"); return false; }
    if (choice) {
      const filled = local.options.filter((o) => o.content.trim() || o.mediaUrl || o._imgFile);
      if (filled.length < 2) { toast.error("En az 2 şık doldurun"); return false; }
      if (!local.options.some((o) => o.isCorrect && (o.content.trim() || o.mediaUrl || o._imgFile))) { toast.error("Dolu bir şıkkı doğru işaretleyin"); return false; }
    } else if (!local.solutionText?.trim()) {
      toast.error("Çözüm / referans cevap zorunlu"); return false;
    }
    return true;
  };

  const prepare = async () => {
    let mediaUrl = local.mediaUrl || "";
    if (local._imgFile) mediaUrl = await doUpload(local._imgFile);
    let solutionMediaUrl = local.solutionMediaUrl || "";
    if (local._solFile) solutionMediaUrl = await doUpload(local._solFile);
    const options = choice ? await Promise.all(local.options.map(async (o) => {
      let optUrl = o.mediaUrl || "";
      if (o._imgFile) optUrl = await doUpload(o._imgFile);
      return { content: o.content.trim(), mediaUrl: optUrl, isCorrect: !!o.isCorrect };
    })) : undefined;
    [local._imgPreview, local._solPreview, ...local.options.map((o) => o._imgPreview)].forEach((u) => { if (u) URL.revokeObjectURL(u); });
    const clean = { _k: local._k, content: local.content.trim(), mediaUrl, points: Math.max(1, Math.floor(local.points) || 1), solutionText: (local.solutionText ?? "").trim(), solutionMediaUrl };
    return choice ? { ...clean, options } : clean;
  };

  const submit = async (cb) => {
    if (!validate()) return;
    setSubmitting(true);
    try { cb(await prepare()); onClose(); }
    catch (e) { toast.error(e?.message || "Kaydedilirken hata oluştu"); setSubmitting(false); }
  };

  const isBrandNew = !question.content?.trim() && !question.mediaUrl && (choice ? !question.options?.some((o) => o.content.trim() || o.mediaUrl) : !question.solutionText?.trim());
  const qImg = local._imgPreview || local.mediaUrl || null;
  const solImg = local._solPreview || local.solutionMediaUrl || null;
  const correctKey = String(local.options?.findIndex((o) => o.isCorrect) ?? -1);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-screen overflow-y-auto">
        <DialogHeader><DialogTitle>{isBrandNew ? `Soru ${index + 1} Ekle` : `Soru ${index + 1} Düzenle`}</DialogTitle></DialogHeader>

        <div className={`grid grid-cols-1 ${choice ? "lg:grid-cols-2" : ""} gap-x-6 gap-y-5 py-2`}>
          {/* Sol sütun */}
          <div className="space-y-5">
            <div className="space-y-2">
              <Label>Soru Metni</Label>
              <Textarea value={local.content} onChange={(e) => setLocal((p) => ({ ...p, content: e.target.value }))} rows={3} placeholder="Soru metnini giriniz..." maxLength={4000} />
            </div>
            <div className="space-y-2">
              <Label>Soru Görseli (İsteğe Bağlı)</Label>
              <ImagePicker url={qImg} label="Görsel Seç"
                onPick={(f) => { if (local._imgPreview) URL.revokeObjectURL(local._imgPreview); setLocal((p) => ({ ...p, _imgFile: f, _imgPreview: URL.createObjectURL(f), mediaUrl: "" })); }}
                onClear={() => { if (local._imgPreview) URL.revokeObjectURL(local._imgPreview); setLocal((p) => ({ ...p, _imgFile: null, _imgPreview: null, mediaUrl: "" })); }} />
            </div>
            <div className="flex items-center gap-3">
              <Label className="text-sm">Puan</Label>
              <Input type="number" min={1} value={local.points} onChange={(e) => setLocal((p) => ({ ...p, points: Number(e.target.value) || 1 }))} className="w-24 h-9" />
            </div>
            <div className="space-y-2">
              <Label>{choice ? "Çözüm (İsteğe Bağlı)" : "Çözüm / referans cevap (zorunlu)"}</Label>
              <Textarea value={local.solutionText} onChange={(e) => setLocal((p) => ({ ...p, solutionText: e.target.value }))} rows={2} placeholder="Çözüm metnini yazın..." maxLength={4000} />
              <ImagePicker url={solImg} label="Çözüm görseli seç"
                onPick={(f) => { if (local._solPreview) URL.revokeObjectURL(local._solPreview); setLocal((p) => ({ ...p, _solFile: f, _solPreview: URL.createObjectURL(f), solutionMediaUrl: "" })); }}
                onClear={() => { if (local._solPreview) URL.revokeObjectURL(local._solPreview); setLocal((p) => ({ ...p, _solFile: null, _solPreview: null, solutionMediaUrl: "" })); }} />
            </div>
          </div>

          {/* Sağ sütun — şıklar (yalnız choice) */}
          {choice && (
            <div className="space-y-3">
              <Label>Seçenekler</Label>
              <RadioGroup value={correctKey} onValueChange={setCorrect}>
                {local.options.map((opt, oi) => {
                  const optImg = opt._imgPreview || opt.mediaUrl || null;
                  return (
                    <div key={oi} className="p-3 rounded-lg bg-slate-50 space-y-2">
                      <div className="flex items-start gap-3">
                        <div className="flex items-center space-x-2 pt-1">
                          <RadioGroupItem value={String(oi)} id={`sq-opt-${local._k}-${oi}`} disabled={!opt.content.trim() && !opt.mediaUrl && !opt._imgFile} />
                          <label htmlFor={`sq-opt-${local._k}-${oi}`} className="text-sm font-semibold cursor-pointer">{LETTERS[oi]}</label>
                        </div>
                        <div className="flex-1 space-y-2">
                          <Input value={opt.content} onChange={(e) => setOpt(oi, { content: e.target.value })} placeholder={`Seçenek ${LETTERS[oi]}`} />
                          <ImagePicker small url={optImg}
                            onPick={(f) => { if (opt._imgPreview) URL.revokeObjectURL(opt._imgPreview); setOpt(oi, { _imgFile: f, _imgPreview: URL.createObjectURL(f), mediaUrl: "" }); }}
                            onClear={() => { if (opt._imgPreview) URL.revokeObjectURL(opt._imgPreview); setOpt(oi, { _imgFile: null, _imgPreview: null, mediaUrl: "" }); }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </RadioGroup>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t flex-wrap">
          <Button variant="outline" onClick={onClose} disabled={submitting}>İptal</Button>
          <Button variant="outline" className="border-indigo-300 text-indigo-600 hover:bg-indigo-50 gap-1" onClick={() => submit(onSaveAndNew)} disabled={submitting}>
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Yeni Soru
          </Button>
          <Button className="bg-indigo-600 hover:bg-indigo-700" onClick={() => submit(onSave)} disabled={submitting}>
            {submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Kaydediliyor...</> : "Tamamla"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Soru satırı (kompakt) ───────────────────────────────────────────────────
function QuestionItem({ q, index, choice, onEdit, onDelete }) {
  const complete = isComplete(q, choice);
  const hasContent = q.content?.trim() || q.mediaUrl;
  return (
    <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors ${complete ? "border-slate-200 bg-white" : "border-rose-300 bg-rose-50"}`}>
      <span className="text-sm font-semibold text-slate-600 shrink-0">Soru {index + 1}</span>
      {complete
        ? <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-white text-[10px] shrink-0">✓</span>
        : <span className="h-4 w-4 rounded-full border-2 border-slate-300 shrink-0" />}
      {hasContent && <span className="text-[11px] text-slate-400 shrink-0">{q.mediaUrl ? "Görsel" : "Metin"}</span>}
      <span className="text-xs text-slate-500 ml-auto shrink-0 text-right">
        {choice
          ? `${filledOptCount(q)} Seçenekli • ${correctLetter(q) ? `Doğru: ${correctLetter(q)}` : "Doğru seçilmedi"}`
          : (complete ? "Çözümlü" : "Çözümsüz")}
      </span>
      <div className="flex items-center gap-1 shrink-0">
        <Button size="icon" variant="ghost" onClick={onEdit} className="h-9 w-9" aria-label="Düzenle"><Pencil className="w-4 h-4" /></Button>
        <Button size="icon" variant="ghost" onClick={onDelete} className="h-9 w-9 text-rose-500 hover:text-rose-700" aria-label="Sil"><Trash2 className="w-4 h-4" /></Button>
      </div>
    </div>
  );
}

// ─── Editör ──────────────────────────────────────────────────────────────────
export function SchoolExamQuestionsEditor({ questions, setQuestions, choice }) {
  const [editingIdx, setEditingIdx] = useState(null);
  const [autoOpenKey, setAutoOpenKey] = useState(null);
  const [docxLoading, setDocxLoading] = useState(false);

  const addQuestion = () => {
    const nq = choice ? emptyChoiceQ() : emptyWrittenQ();
    setQuestions((qs) => [...qs, nq]);
    setAutoOpenKey(nq._k);
  };
  const updateQuestion = (idx, updated) => setQuestions((qs) => qs.map((q, i) => (i === idx ? { ...updated, _k: q._k } : q)));
  const deleteQuestion = (idx) => setQuestions((qs) => qs.filter((_, i) => i !== idx));

  const autoIdx = autoOpenKey != null ? questions.findIndex((q) => q._k === autoOpenKey) : -1;
  const openIdx = editingIdx != null ? editingIdx : autoIdx >= 0 ? autoIdx : null;
  const completedCount = questions.filter((q) => isComplete(q, choice)).length;

  const handleDOCXImport = async (file) => {
    setDocxLoading(true);
    try {
      const mammoth = await import("mammoth");
      const { value: html } = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
      const div = document.createElement("div");
      div.innerHTML = html;
      const lines = Array.from(div.querySelectorAll("p, li")).map((el) => el.textContent.trim()).filter(Boolean);
      const parsed = [];
      let cur = null;
      for (const line of lines) {
        if (/^(soru:|\d+\s*\.)/i.test(line)) {
          if (cur) parsed.push(cur);
          cur = choice ? emptyChoiceQ() : emptyWrittenQ();
          cur.content = line.replace(/^(soru:|\d+\s*\.\s*)/i, "").trim();
        } else if (cur && choice && /^([A-E])\s*\)\s*(.+)/.test(line)) {
          const m = line.match(/^([A-E])\s*\)\s*(.+)/);
          const idx = LETTERS.indexOf(m[1]);
          if (idx >= 0 && idx < cur.options.length) cur.options[idx].content = m[2].trim();
        } else if (cur && choice && /^\*|cevap:/i.test(line)) {
          const m = line.match(/^[\*]*\s*([A-E])/i);
          if (m) { const idx = LETTERS.indexOf(m[1].toUpperCase()); if (idx >= 0) cur.options = cur.options.map((o, i) => ({ ...o, isCorrect: i === idx })); }
        } else if (cur && !choice && /^(çözüm|cevap):/i.test(line)) {
          cur.solutionText = line.replace(/^(çözüm|cevap):\s*/i, "").trim();
        }
      }
      if (cur) parsed.push(cur);
      if (parsed.length === 0) { toast.error("DOCX'ten soru ayrıştırılamadı. Manuel ekleyin."); return; }
      setQuestions((prev) => {
        const allEmpty = prev.length === 1 && !prev[0].content.trim() && (choice ? !prev[0].options.some((o) => o.content.trim()) : !prev[0].solutionText?.trim());
        return allEmpty ? parsed : [...prev, ...parsed];
      });
      toast.success(`${parsed.length} soru eklendi`);
    } catch (err) {
      toast.error("DOCX import başarısız: " + (err?.message || "bilinmeyen hata"));
    } finally { setDocxLoading(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-lg font-semibold text-slate-900">{questions.length} soru <span className="text-sm font-normal text-slate-400">({completedCount} tamamlanmış)</span></h2>
        <div className="flex items-center gap-2">
          <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-slate-200 bg-white hover:bg-slate-50 text-slate-600">
            <Upload className="w-4 h-4" /> {docxLoading ? "Yükleniyor..." : "DOCX İçeri Aktar"}
            <input type="file" accept=".docx" className="hidden" disabled={docxLoading} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) handleDOCXImport(f); }} />
          </label>
          <Button onClick={addQuestion} className="bg-amber-500 hover:bg-amber-600 gap-1"><Plus className="w-4 h-4" /> Soru Ekle</Button>
        </div>
      </div>

      {questions.length === 0 ? (
        <div className="text-center py-12 text-slate-400 border border-dashed border-slate-200 rounded-xl">Henüz soru yok. "Soru Ekle" ile başlayın.</div>
      ) : (
        <div className="space-y-2">
          {questions.map((q, i) => (
            <QuestionItem key={q._k} q={q} index={i} choice={choice} onEdit={() => setEditingIdx(i)} onDelete={() => deleteQuestion(i)} />
          ))}
        </div>
      )}

      {openIdx != null && questions[openIdx] && (
        <QuestionEditDialog
          question={questions[openIdx]}
          index={openIdx}
          choice={choice}
          onSave={(updated) => updateQuestion(openIdx, updated)}
          onSaveAndNew={(updated) => { updateQuestion(openIdx, updated); addQuestion(); }}
          onClose={() => { setEditingIdx(null); setAutoOpenKey(null); }}
        />
      )}
    </div>
  );
}
