/**
 * SchoolTunnelEditor — E-Sınıf tünel (katmanlı) soru editörü.
 *
 * Market CreateTunnel "Katman katman sorular" editörüyle aynı yapı:
 *  - Sol/üst Katman navigasyonu (Katman 1..N), her katmanda tamamlanma göstergesi.
 *  - Aktif katmanda akordeon soru satırları: "Soru N · {filled} Seçenekli • Doğru: X" +
 *    Düzenle/Sil; açıkken inline editör (soru metni + görsel + optionsPerQuestion şık,
 *    her şıkta radio + içerik + görsel). "Soru Ekle". Tek doğru.
 *  - Görseller sayfa "Soruları Kaydet"te yüklenir (uploadPendingTunnelImages).
 *
 * Çalışılan state: DÜZ soru dizisi; her soruda layerIndex (hangi katman). setQuestions
 * ile yönetilir; SchoolExamEdit kaydederken layerIndex'i backend'e gönderir.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, Pencil, ImagePlus, X, CheckCircle2, Upload } from "lucide-react";
import { toast } from "sonner";
import { doUpload } from "@/components/live/LiveQuestionsEditor";
import { parseDocxToQuestions, parsePdfToQuestions } from "@/lib/importQuestions";

export const uid = () => Math.random().toString(36).slice(2);
export const LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];

const blankOption = () => ({ content: "", mediaUrl: "", isCorrect: false });
export function emptyTunnelQ(optionCount, layerIndex) {
  const options = Array.from({ length: Math.max(2, optionCount || 5) }, () => blankOption());
  options[0].isCorrect = true;
  return { _k: uid(), content: "", mediaUrl: "", points: 1, layerIndex, options };
}

/** API soruları → yerel (stabil _k + optionCount'a göre şık doldurma + layerIndex). */
export function toLocalTunnelQuestions(apiQuestions, optionCount) {
  const n = Math.max(2, optionCount || 5);
  return (apiQuestions ?? []).map((q) => {
    const opts = (q.options ?? []).map((o) => ({ content: o.content ?? "", mediaUrl: o.mediaUrl ?? "", isCorrect: !!o.isCorrect }));
    while (opts.length < n) opts.push(blankOption());
    return { _k: uid(), content: q.content ?? "", mediaUrl: q.mediaUrl ?? "", points: q.points ?? 1, layerIndex: q.layerIndex ?? 1, options: opts };
  });
}

const filledOpts = (q) => q.options.filter((o) => o.content?.trim() || o._imgPreview || o.mediaUrl).length;
const correctIdx = (q) => q.options.findIndex((o) => o.isCorrect && (o.content?.trim() || o._imgPreview || o.mediaUrl));
const isQComplete = (q) => !!((q.content?.trim() || q._imgPreview || q.mediaUrl) && filledOpts(q) >= 2 && correctIdx(q) >= 0);

/** Bekleyen görselleri (_imgFile) /upload/image'a yükle → temiz payload (mediaUrl). */
export async function uploadPendingTunnelImages(questions) {
  const out = [];
  for (const q of questions) {
    let mediaUrl = q.mediaUrl || "";
    if (q._imgFile) mediaUrl = await doUpload(q._imgFile);
    const options = [];
    for (const o of q.options) {
      let oUrl = o.mediaUrl || "";
      if (o._imgFile) oUrl = await doUpload(o._imgFile);
      options.push({ content: (o.content ?? "").trim(), mediaUrl: oUrl, isCorrect: !!o.isCorrect });
    }
    out.push({ _k: q._k, content: (q.content ?? "").trim(), mediaUrl, points: Math.max(1, Math.floor(q.points) || 1), layerIndex: q.layerIndex ?? 1, options });
  }
  return out;
}

// ─── Katman editörü ──────────────────────────────────────────────────────────
function LayerQuestions({ questions, layerIndex, optionCount, onChange }) {
  const [openKey, setOpenKey] = useState(null);
  const [importing, setImporting] = useState(null); // 'docx' | 'pdf' | null

  const addQ = () => {
    const nq = emptyTunnelQ(optionCount, layerIndex);
    onChange([...questions, nq]);
    setOpenKey(nq._k);
  };

  // DOCX/PDF içe aktarma — market tünel editörüyle aynı; bu KATMANA eklenir.
  const runImport = async (file, type) => {
    setImporting(type);
    try {
      const make = () => emptyTunnelQ(optionCount, layerIndex);
      const parsed = type === "pdf" ? await parsePdfToQuestions(file, make) : await parseDocxToQuestions(file, make);
      if (!parsed.length) { toast.error("İçe aktarılacak soru bulunamadı"); return; }
      onChange([...questions, ...parsed]);
      toast.success(`${parsed.length} soru içe aktarıldı`);
    } catch (e) {
      toast.error("İçe aktarma hatası: " + (e?.message || "bilinmeyen"));
    } finally { setImporting(null); }
  };
  const removeQ = (k) => onChange(questions.filter((q) => q._k !== k));
  const setQ = (k, patch) => onChange(questions.map((q) => (q._k === k ? { ...q, ...patch } : q)));
  const setOpt = (k, oi, patch) => setQ(k, { options: questions.find((q) => q._k === k).options.map((o, i) => (i === oi ? { ...o, ...patch } : o)) });
  const setCorrect = (k, oi) => setQ(k, { options: questions.find((q) => q._k === k).options.map((o, i) => ({ ...o, isCorrect: i === oi })) });

  return (
    <div className="space-y-3">
      {questions.length === 0 && <p className="py-6 text-center text-sm text-slate-400">Bu katmanda henüz soru yok.</p>}
      {questions.map((q, qi) => {
        const qImg = q._imgPreview || q.mediaUrl;
        const isOpen = openKey === q._k;
        const cIdx = correctIdx(q);
        return (
          <div key={q._k} className={"rounded-lg border " + (isOpen ? "border-indigo-200" : "border-slate-200 hover:bg-slate-50/50")}>
            <div className="flex flex-wrap items-center gap-3 px-3 py-2">
              <span className="flex-shrink-0 text-sm font-semibold text-slate-600">Soru {qi + 1}</span>
              {isQComplete(q) ? <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-emerald-600" /> : <div className="h-4 w-4 flex-shrink-0 rounded-full border-2 border-slate-300" />}
              {(q.content?.trim() || qImg) && <span className="flex-shrink-0 text-[10px] font-medium text-slate-500">{qImg ? "Görsel" : "Metin"}</span>}
              <span className="ml-auto flex-shrink-0 text-xs text-slate-500">{filledOpts(q)} Seçenekli{cIdx >= 0 ? ` • Doğru: ${LETTERS[cIdx]}` : " • Doğru: —"}</span>
              <div className="flex flex-shrink-0 gap-1">
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-slate-600 hover:bg-slate-100" onClick={() => setOpenKey(isOpen ? null : q._k)} aria-label="Düzenle"><Pencil className="h-4 w-4" /></Button>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-rose-600 hover:bg-rose-50" onClick={() => removeQ(q._k)} aria-label="Sil"><Trash2 className="h-4 w-4" /></Button>
              </div>
            </div>

            {isOpen && (
              <div className="space-y-3 border-t border-slate-100 p-4 pt-3">
                <Textarea value={q.content} onChange={(e) => setQ(q._k, { content: e.target.value })} rows={2} placeholder="Soru metni (görsel-only için boş bırakılabilir)" maxLength={4000} />
                <div className="flex items-center gap-2 flex-wrap">
                  <label className="cursor-pointer inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium border border-slate-200 bg-white hover:bg-slate-50 text-slate-600">
                    <ImagePlus className="w-3.5 h-3.5" /> Soru görseli
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (!f) return; if (q._imgPreview) URL.revokeObjectURL(q._imgPreview); setQ(q._k, { _imgFile: f, _imgPreview: URL.createObjectURL(f), mediaUrl: "" }); }} />
                  </label>
                  {qImg && (<>
                    <div className="w-12 h-9 rounded overflow-hidden bg-slate-100 border border-slate-200"><img src={qImg} alt="" className="w-full h-full object-cover" /></div>
                    <button type="button" onClick={() => { if (q._imgPreview) URL.revokeObjectURL(q._imgPreview); setQ(q._k, { _imgFile: null, _imgPreview: "", mediaUrl: "" }); }} className="text-rose-500"><X className="w-4 h-4" /></button>
                  </>)}
                  <span className="ml-auto inline-flex items-center gap-1 text-xs text-slate-500">Puan <Input type="number" min={1} value={q.points} onChange={(e) => setQ(q._k, { points: Number(e.target.value) || 1 })} className="w-16 h-7" /></span>
                </div>

                <div className="space-y-2">
                  {q.options.map((o, oi) => {
                    const oImg = o._imgPreview || o.mediaUrl;
                    return (
                      <div key={oi} className="flex items-center gap-2">
                        <input type="radio" name={`st-correct-${q._k}`} checked={!!o.isCorrect} onChange={() => setCorrect(q._k, oi)} aria-label={`${LETTERS[oi]} doğru`} className="h-4 w-4 accent-emerald-600" />
                        <span className="w-4 text-xs font-semibold text-slate-500">{LETTERS[oi]}</span>
                        <Input value={o.content} onChange={(e) => setOpt(q._k, oi, { content: e.target.value })} placeholder={`${LETTERS[oi]} şıkkı`} className="h-9 flex-1" />
                        <label className="inline-flex cursor-pointer items-center rounded border border-slate-200 bg-white p-1.5 text-slate-500 hover:bg-slate-50" aria-label={`${LETTERS[oi]} şık görseli`}>
                          <ImagePlus className="h-4 w-4" />
                          <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (!f) return; if (o._imgPreview) URL.revokeObjectURL(o._imgPreview); setOpt(q._k, oi, { _imgFile: f, _imgPreview: URL.createObjectURL(f), mediaUrl: "" }); }} />
                        </label>
                        {oImg && (<>
                          <div className="w-8 h-8 rounded overflow-hidden bg-slate-100 border border-slate-200"><img src={oImg} alt="" className="w-full h-full object-cover" /></div>
                          <button type="button" onClick={() => { if (o._imgPreview) URL.revokeObjectURL(o._imgPreview); setOpt(q._k, oi, { _imgFile: null, _imgPreview: "", mediaUrl: "" }); }} className="text-rose-500"><X className="w-4 h-4" /></button>
                        </>)}
                      </div>
                    );
                  })}
                  <p className="text-[11px] text-slate-400">Yeşil radio = doğru şık. 1 doğru + çeldiriciler.</p>
                </div>
              </div>
            )}
          </div>
        );
      })}

      <button type="button" onClick={addQ} className="flex w-full items-center justify-center rounded-lg border border-dashed border-slate-300 py-2.5 text-sm font-medium text-indigo-600 hover:bg-indigo-50">
        <Plus className="mr-1 h-4 w-4" /> Soru Ekle
      </button>

      {/* DOCX/PDF içe aktarma — Soru Ekle'nin altında ortalı (market tünel ile aynı). Bu katmana ekler. */}
      <div className="flex items-center justify-center gap-6 pt-1">
        <label className="cursor-pointer inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
          <Upload className="w-4 h-4" /> {importing === "docx" ? "Yükleniyor..." : "DOCX İçeri Aktar"}
          <input type="file" accept=".docx" className="hidden" disabled={!!importing} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) runImport(f, "docx"); }} />
        </label>
        <label className="cursor-pointer inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
          <Upload className="w-4 h-4" /> {importing === "pdf" ? "Yükleniyor..." : "PDF İçeri Aktar"}
          <input type="file" accept=".pdf" className="hidden" disabled={!!importing} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) runImport(f, "pdf"); }} />
        </label>
      </div>
    </div>
  );
}

// ─── Editör (katman navigasyonu + aktif katman) ──────────────────────────────
export function SchoolTunnelEditor({ questions, setQuestions, layerCount = 7, optionCount = 10 }) {
  const [activeLayer, setActiveLayer] = useState(1);
  const layerQs = questions.filter((q) => (q.layerIndex ?? 1) === activeLayer);

  // Aktif katmanın sorularını değiştir → düz diziye yeniden birleştir.
  const onLayerChange = (nextLayerQs) => {
    setQuestions([...questions.filter((q) => (q.layerIndex ?? 1) !== activeLayer), ...nextLayerQs.map((q) => ({ ...q, layerIndex: activeLayer }))]);
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">Katman katman sorular — {optionCount} seçenek (1 doğru), kolaydan zora.</p>
      <div className="flex flex-col gap-4 sm:flex-row">
        {/* Katman navigasyonu */}
        <nav className="flex flex-row flex-wrap gap-1.5 sm:w-40 sm:flex-shrink-0 sm:flex-col" aria-label="Katmanlar">
          {Array.from({ length: layerCount }, (_, i) => i + 1).map((idx) => {
            const cnt = questions.filter((q) => (q.layerIndex ?? 1) === idx).length;
            const active = idx === activeLayer;
            return (
              <button key={idx} type="button" onClick={() => setActiveLayer(idx)}
                className={"flex items-center gap-2 rounded-lg border px-3 py-2 text-sm " + (active ? "border-indigo-300 bg-indigo-50 text-indigo-700 font-medium" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50")}>
                <span className="sm:flex-1 sm:text-left">Katman {idx}</span>
                <span className={"rounded-full px-1.5 text-xs " + (cnt > 0 ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-400")}>{cnt}</span>
              </button>
            );
          })}
        </nav>

        {/* Aktif katman soruları */}
        <div className="flex-1">
          <LayerQuestions questions={layerQs} layerIndex={activeLayer} optionCount={optionCount} onChange={onLayerChange} />
        </div>
      </div>
    </div>
  );
}
