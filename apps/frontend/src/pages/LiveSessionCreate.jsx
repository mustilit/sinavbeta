import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

import { liveSessions as liveApi, liveSessionTiers as tiersApi, topics as topicsApi, platformPromoCodes as promoApi } from "@/api/dalClient";
import { createPageUrl } from "@/utils";
import { useQuery, useMutation } from "@tanstack/react-query";
import api from "@/lib/api/apiClient";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { TopicCombobox } from "@/components/ui/TopicCombobox";
import { toast } from "sonner";
import {
  Plus, Trash2, CheckCircle2, ArrowLeft, Zap, Loader2, Users,
  Eye, BookOpen, Package, AlertTriangle, ImagePlus, X, Upload, Pencil,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Sabitler ───────────────────────────────────────────────────────────────
const uid     = () => Math.random().toString(36).slice(2);
const LETTERS = ["A", "B", "C", "D", "E"];

const STEPS = [
  { id: 1, label: "Oturum",   icon: Package  },
  { id: 2, label: "Sorular",  icon: BookOpen },
  { id: 3, label: "Önizleme", icon: Eye      },
];

// ─── Yardımcı factory'ler ────────────────────────────────────────────────────
const emptyOption   = () => ({ _k: uid(), content: "", mediaUrl: "", isCorrect: false });
const emptyQuestion = () => ({
  _k: uid(),
  content: "",
  mediaUrl: "",
  options: [emptyOption(), emptyOption(), emptyOption(), emptyOption(), emptyOption()],
  topicId: null,
  duplicateWarning: null,
});

// ─── Görsel yükleme ──────────────────────────────────────────────────────────
async function doUpload(file) {
  const fd = new FormData();
  fd.append("file", file);
  const { data } = await api.post("/upload/image", fd);
  return data.url || data.fileUrl || data.file_url || "";
}

// ─── Adım göstergesi ────────────────────────────────────────────────────────
function StepIndicator({ current }) {
  return (
    <div className="flex items-center justify-center mb-8">
      {STEPS.map((step, i) => {
        const Icon   = step.icon;
        const done   = current > step.id;
        const active = current === step.id;
        return (
          <div key={step.id} className="flex items-center">
            <div className="flex flex-col items-center gap-1">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-colors ${
                done   ? "bg-amber-500 border-amber-500 text-white"
                : active ? "bg-white border-amber-500 text-amber-500"
                         : "bg-white border-slate-200 text-slate-400"
              }`}>
                {done ? <CheckCircle2 className="w-5 h-5" /> : <Icon className="w-4 h-4" />}
              </div>
              <span className={`text-xs font-medium ${
                active ? "text-amber-600" : done ? "text-slate-600" : "text-slate-400"
              }`}>{step.label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`w-16 h-0.5 mx-1 mb-5 transition-colors ${
                current > step.id ? "bg-amber-500" : "bg-slate-200"
              }`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Tier seçim kartı ───────────────────────────────────────────────────────
function TierCard({ tier, selected, onSelect }) {
  const rangeLabel = tier.maxParticipants == null
    ? `${tier.minParticipants}+ katılımcı`
    : tier.minParticipants === 0
      ? `0–${tier.maxParticipants} katılımcı`
      : `${tier.minParticipants}–${tier.maxParticipants} katılımcı`;
  const price = tier.priceCents === 0
    ? "Ücretsiz"
    : `₺${(tier.priceCents / 100).toLocaleString("tr-TR", { minimumFractionDigits: 2 })}`;

  return (
    <button
      type="button"
      onClick={() => onSelect(tier)}
      className={cn(
        "w-full text-left p-3 rounded-xl border-2 transition-all hover:border-amber-400",
        selected ? "border-amber-500 bg-amber-50" : "border-slate-200 bg-white"
      )}
    >
      {/* Üst satır: label + ✓ solda, fiyat sağda — yatay yer kazanır. */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-semibold text-slate-900 truncate">{tier.label}</span>
          {selected && <CheckCircle2 className="w-4 h-4 text-amber-600 flex-shrink-0" aria-hidden="true" />}
        </div>
        <span className={cn(
          "text-base font-bold flex-shrink-0",
          tier.priceCents === 0 ? "text-emerald-600" : "text-amber-600"
        )}>{price}</span>
      </div>
      {/* Alt satır: katılımcı aralığı küçük, ikonlu */}
      <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-1">
        <Users className="w-3.5 h-3.5" aria-hidden="true" />
        <span>{rangeLabel}</span>
      </div>
    </button>
  );
}

// ─── Soru düzenleme dialog'u ─────────────────────────────────────────────────
function QuestionEditDialog({ question, questionIndex, topicList, onSave, onSaveAndNew, onClose }) {
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

  // "Yeni Soru": mevcut soruyu kaydet, dialog'u kapat. Parent'taki addQuestion
  // (onSaveAndNew içinden çağrılır) yeni soruyu ekler ve pendingEditKey ile
  // yeni QuestionItem'ın dialog'unu auto-open eder. Burada dialog'u kapatmazsak
  // iki dialog üst üste açık kalır.
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

  // Yeni eklenen boş bir soru için başlık "Yeni Soru" — düzenleme için "Düzenle"
  const isBrandNew =
    !question.content.trim() &&
    !question.mediaUrl &&
    !question.options.some((o) => o.content.trim() || o.mediaUrl);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-screen overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isBrandNew
              ? `Soru ${questionIndex + 1} Ekle`
              : `Soru ${questionIndex + 1} Düzenle`}
          </DialogTitle>
        </DialogHeader>

        {/* 2-sütun düzen: sol metadata (soru/görsel/konu), sağ seçenekler.
            lg altı tek sütun (mobile-friendly). CreateTest/EditTest ile aynı düzen. */}
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

          {/* Konu seçimi — arama destekli + ağaç yolu */}
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
                              sıralı olarak A, B, C... seçeneklerine dağıtılır. Tek dosya seçimi
                              eski davranışla aynı. Mevcut seçenek sayısını aşan dosyalar atılır. */}
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
                                // Çoklu seçim & taşma bilgilendirmesi
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

// ─── Soru accordion öğesi ────────────────────────────────────────────────────
function QuestionItem({ questionIndex, question, topicList, onUpdate, onDelete, onAddNew, autoOpenEdit, onAutoOpenHandled }) {
  const [editOpen, setEditOpen] = useState(false);

  // Yeni soru eklendiğinde veya DOCX import sonrasında — parent autoOpenEdit'i true yapar.
  // Mount sonrası dialog açılır; sonra parent'in flag'i temizlemesi için callback'i tetikler.
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
      {/* Kompakt tek satır — CreateTest/EditTest ile birebir aynı düzen.
          Accordion kaldırıldı, her şey hep görünür; dar ekranda flex-wrap ile alt satıra düşer. */}
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
          {(question.solutionText?.trim() || question.solutionMediaUrl) && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium text-emerald-700 flex-shrink-0">
              Çözümlü
            </span>
          )}
          <span className="text-xs text-slate-500 flex-shrink-0 ml-auto">
            {filledOpts} Seçenekli{correctText}
          </span>
          <div className="flex gap-1 flex-shrink-0">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setEditOpen(true)}
              aria-label="Düzenle"
              title="Düzenle"
              className="h-8 w-8 p-0 text-slate-600 hover:bg-slate-100"
            >
              <Pencil className="w-4 h-4" aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-rose-600 hover:text-rose-700 hover:bg-rose-50"
              onClick={() => onDelete(questionIndex)}
              aria-label="Sil"
              title="Sil"
            >
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
          onSave={(updated) => onUpdate(updated)}
          onSaveAndNew={(updated) => { onUpdate(updated); if (onAddNew) onAddNew(); }}
          onClose={() => setEditOpen(false)}
        />
      )}
    </>
  );
}

// ─── Ana bileşen ────────────────────────────────────────────────────────────
export default function LiveSessionCreate() {
  const navigate = useNavigate();

  const [step, setStep]                 = useState(1);
  const [selectedTier, setSelectedTier] = useState(null);
  const [title, setTitle]               = useState("");
  const [description, setDescription]  = useState("");
  const [questions, setQuestions]       = useState(() => {
    const q = emptyQuestion();
    return [q];
  });
  const [step1Errors, setStep1Errors]   = useState({});
  const [showDOCXDialog, setShowDOCXDialog] = useState(false);
  const [docxLoading, setDocxLoading]   = useState(false);
  // Ödeme onay modal'ı durumu — Önizleme sonrası, kayıt yapılmadan önce açılır
  const [paymentOpen, setPaymentOpen]   = useState(false);
  const [paymentProvider, setPaymentProvider] = useState("iyzico");

  // Sprint 15 #4/6 — Platform admin promo kodu state (LIVE_SESSION scope).
  // Eğitici opsiyonel olarak admin'den aldığı kodu uygular; backend atomik
  // validate eder ve usedCount++ yapar.
  const [promoInput, setPromoInput] = useState("");
  const [appliedPromo, setAppliedPromo] = useState(null); // { id, code, percentOff, discountCents, finalAmountCents }
  const [promoError, setPromoError] = useState(null);
  const [promoLoading, setPromoLoading] = useState(false);

  const handleValidatePromo = async () => {
    setPromoError(null);
    const code = (promoInput || "").trim().toUpperCase();
    if (!code) return;
    const basePrice = selectedTier?.priceCents ?? 0;
    if (basePrice === 0) {
      setPromoError("Ücretsiz pakette indirim uygulanamaz");
      return;
    }
    setPromoLoading(true);
    try {
      const result = await promoApi.validate(code, "LIVE_SESSION", basePrice);
      setAppliedPromo(result);
    } catch (err) {
      const errorCode = err?.response?.data?.code || err?.response?.data?.error?.code;
      const map = {
        PROMO_NOT_FOUND: "Promo kodu bulunamadı",
        PROMO_NOT_ACTIVE: "Bu kod pasif",
        PROMO_OUT_OF_WINDOW: "Bu kod artık geçerli değil",
        PROMO_USAGE_EXHAUSTED: "Kullanım hakkı tükendi",
        PROMO_SCOPE_MISMATCH: "Bu kod canlı test için geçerli değil",
      };
      setPromoError(map[errorCode] || "Promo kodu doğrulanamadı");
      setAppliedPromo(null);
    } finally {
      setPromoLoading(false);
    }
  };
  const handleRemovePromo = () => {
    setAppliedPromo(null);
    setPromoInput("");
    setPromoError(null);
  };
  // Accordion'da hangi sorunun açık olduğunu tutan controlled değer.
  // İlk render'da varsa ilk sorunun _k'sı açılır; yeni soru eklenince onun _k'sı set edilir.
  const [openQuestionKey, setOpenQuestionKey] = useState(null);
  // "Soru Ekle" tıklamasından sonra otomatik açılacak düzenleme modalının soru _k'sı
  const [pendingEditKey, setPendingEditKey] = useState(null);
  useEffect(() => {
    if (!openQuestionKey && questions.length > 0) {
      setOpenQuestionKey(questions[0]._k);
    }
  }, [questions, openQuestionKey]);

  // DOCX'ten soru içeri aktarma — iki format desteklenir:
  //   1) Düz metin formatı:
  //      "1. Soru metni"  veya  "Soru: Soru metni"
  //      "A) Seçenek..."  ...  "E) Seçenek..."
  //      "Cevap: A"  veya  "*A"  → doğru cevap işareti
  //
  //   2) Word otomatik numaralama (nested <ol><li>):
  //      Word'de soru listesinin altına sub-list olarak şıklar girildiyse,
  //      mammoth nested <ol><li> üretir. İlk seviye = sorular, ikinci seviye = şıklar.
  //      Bu durumda sıralama A,B,C,D,E olarak atanır; cevap işareti yoksa boş bırakılır.
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

      // --- 1) Yapısal parser: top-level <ol><li> (her li bir soru, içindeki <ol><li> şıklar) ---
      const topLists = Array.from(div.children).filter((el) => el.tagName === "OL" || el.tagName === "UL");
      for (const list of topLists) {
        const questionItems = Array.from(list.children).filter((el) => el.tagName === "LI");
        for (const qLi of questionItems) {
          // Soru metni: alt listeleri (şıkları) hariç tutarak başlığı çek
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
            optionItems.slice(0, q.options.length).forEach((optLi, i) => {
              q.options[i].content = optLi.textContent.trim();
            });
          }
          // En az 2 dolu seçenek varsa kabul et
          if (q.options.filter((o) => o.content.trim()).length >= 2 || qText) {
            parsed.push(q);
          }
        }
      }

      // --- 2) Yapısal parser sonuç vermediyse düz metin fallback ---
      if (parsed.length === 0) {
        const lines = Array.from(div.querySelectorAll("p, li"))
          .map((el) => el.textContent.trim())
          .filter((t) => t.length > 0);

        let currentQuestion = null;
        for (const line of lines) {
          if (/^(soru:|\d+\s*\.)/i.test(line)) {
            if (currentQuestion) parsed.push(currentQuestion);
            currentQuestion = emptyQuestion();
            currentQuestion.content = line.replace(/^(soru:|\d+\s*\.\s*)/i, "").trim();
          } else if (currentQuestion && /^([A-E])\s*\)\s*(.+)/.test(line)) {
            const match = line.match(/^([A-E])\s*\)\s*(.+)/);
            const idx = LETTERS.indexOf(match[1]);
            if (idx >= 0 && idx < currentQuestion.options.length) {
              currentQuestion.options[idx].content = match[2].trim();
            }
          } else if (currentQuestion && /^\*|cevap:/i.test(line)) {
            const match = line.match(/^[\*]*\s*([A-E])/i);
            if (match) {
              const idx = LETTERS.indexOf(match[1].toUpperCase());
              if (idx >= 0) {
                currentQuestion.options = currentQuestion.options.map((o, i) => ({
                  ...o,
                  isCorrect: i === idx,
                }));
              }
            }
          }
        }
        if (currentQuestion) parsed.push(currentQuestion);
      }

      if (parsed.length === 0) {
        toast.error("DOCX'ten soru parse edilemedi. Lütfen manuel ekleyiniz.");
      } else {
        setQuestions((prev) => {
          // İlk soru hâlâ boşsa onun yerine yenileri koy; aksi halde sona ekle
          const allEmpty = prev.length === 1 && !prev[0].content.trim() &&
            !prev[0].options.some((o) => o.content.trim());
          return allEmpty ? parsed : [...prev, ...parsed];
        });
        // İçeri aktarılan ilk soruyu açık göster — kullanıcı sonucu hızlı görür
        setOpenQuestionKey(parsed[0]._k);
        toast.success(`${parsed.length} soru eklendi`);
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

  // ── Tier query ────────────────────────────────────────────────────────
  const { data: tiers = [], isLoading: tiersLoading } = useQuery({
    queryKey: ["liveSessionTiers"],
    queryFn: () => tiersApi.list(),
  });

  // ── Topic query (adım 2'de kullanılır) ───────────────────────────────
  const { data: topicList = [] } = useQuery({
    queryKey: ["topicsFlat"],
    queryFn: async () => {
      try { return await topicsApi.flat(undefined); } catch { return []; }
    },
    enabled: step >= 2,
    staleTime: 60_000,
  });

  // ── Mutation ──────────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: async () => {
      const validQuestions = questions.filter((q) => {
        const filled = q.options.filter(o => o.content.trim() || o.mediaUrl);
        return (q.content.trim() || q.mediaUrl) && filled.length >= 2 && q.options.some(o => o.isCorrect);
      });
      if (validQuestions.length === 0) throw new Error("En az bir tamamlanmış soru gereklidir");

      const payload = {
        title: title.trim(),
        tierId: selectedTier?.id ?? null,
        questions: validQuestions.map((q, qi) => ({
          content: q.content.trim(),
          mediaUrl: q.mediaUrl || undefined,
          order: qi,
          options: q.options
            .filter(o => o.content.trim() || o.mediaUrl)
            .map((o, oi) => ({
              content: o.content.trim(),
              mediaUrl: o.mediaUrl || undefined,
              isCorrect: o.isCorrect,
              order: oi,
            })),
        })),
      };
      return liveApi.create(payload);
    },
    onSuccess: async (session) => {
      const price = selectedTier?.priceCents ?? 0;
      try {
        // Ödeme adımı — provider seçimi metadata olarak gönderiliyor (mock).
        // Sprint 15 #4: appliedPromo varsa promoCode body'sine eklenir; backend
        // atomik validate + apply + usedCount++ yapar. Başarısız olursa oturum
        // DRAFT/unpaid kalır → kullanıcıya hata mesajı.
        await liveApi.pay(session.id, appliedPromo ? { promoCode: appliedPromo.code } : {});
        toast.success(price > 0
          ? `Ödeme tamamlandı! (₺${(price / 100).toFixed(2)} — ${paymentProvider})`
          : "Canlı test oluşturuldu!"
        );
        setPaymentOpen(false);
        // Ödeme sonrası "Canlı Testlerim" sayfasına git — kullanıcı oturumu
        // listede görür ve "1. Oturumu Başlat" butonuyla kontrollü şekilde
        // başlatır. Önceden doğrudan host'a yönleniyordu; bu, ödeme yapan
        // kullanıcının oturumun otomatik başladığı yanılsamasına yol açıyordu.
        navigate(createPageUrl("MyLiveSessions"));
      } catch (e) {
        toast.error(
          e?.response?.data?.error?.message ||
            e?.response?.data?.message ||
            "Ödeme başarısız oldu. Oturum taslak olarak kaydedildi; daha sonra Canlı Testlerim'den ödeme yapabilirsiniz.",
        );
        setPaymentOpen(false);
      }
    },
    onError: (err) => {
      const d = err?.response?.data;
      toast.error(d?.error?.message || d?.message || err.message || "Oluşturulamadı");
    },
  });

  // ── Adım geçişleri ────────────────────────────────────────────────────
  const goToStep2 = () => {
    const errs = {};
    if (!title.trim()) errs.title = "Oturum başlığı zorunludur";
    if (Object.keys(errs).length) { setStep1Errors(errs); return; }
    setStep1Errors({});
    setStep(2);
  };

  const goToStep3 = () => {
    const valid = questions.filter((q) => {
      const filled = q.options.filter(o => o.content.trim() || o.mediaUrl);
      return (q.content.trim() || q.mediaUrl) && filled.length >= 2 && q.options.some(o => o.isCorrect);
    });
    if (valid.length === 0) {
      toast.error("En az bir tamamlanmış soru ekleyin");
      return;
    }
    setStep(3);
  };

  // ── Soru yardımcıları ─────────────────────────────────────────────────
  const addQuestion = () => {
    const q = emptyQuestion();
    setQuestions((qs) => [...qs, q]);
    setOpenQuestionKey(q._k);
    // Soru giriş ekranını (modal) doğrudan aç — eğitici neyi dolduracağını anlasın
    setPendingEditKey(q._k);
  };
  const updateQuestion = (idx, updated) =>
    setQuestions(qs => qs.map((q, i) => i === idx ? updated : q));
  const deleteQuestion = (idx) => {
    setQuestions((qs) => {
      const deleted = qs[idx];
      const next = qs.filter((_, i) => i !== idx);
      // Silinen soru açıksa accordion'ı temizle; aksi halde dokunma
      if (deleted && openQuestionKey === deleted._k) {
        setOpenQuestionKey(next[0]?._k ?? null);
      }
      return next;
    });
  };

  const completedCount = questions.filter((q) => {
    const filled = q.options.filter(o => o.content.trim() || o.mediaUrl);
    return (q.content.trim() || q.mediaUrl) && filled.length >= 2 && q.options.some(o => o.isCorrect);
  }).length;

  // ══════════════════════════════════════════════════════════════════════
  return (
    <div className="max-w-4xl mx-auto">
      {/* Geri butonu */}
      <button
        onClick={() => step === 1 ? navigate(-1) : setStep(s => s - 1)}
        className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        {step === 1 ? "Geri Dön" : "Önceki Adım"}
      </button>

      <h1 className="text-2xl font-bold text-slate-900 mb-1 flex items-center gap-2">
        <Zap className="w-6 h-6 text-amber-500" /> Canlı Test Oluştur
      </h1>
      <p className="text-slate-500 mb-8">3 adımda canlı oturumunuzu hazırlayın.</p>

      <StepIndicator current={step} />

      {/* ── ADIM 1: Oturum Bilgileri ─────────────────────────────────── */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="w-5 h-5 text-amber-500" />
              Oturum Bilgileri
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="live-title">Oturum Başlığı *</Label>
              <Input
                id="live-title"
                placeholder="örn. Haftalık Matematik Quizi"
                value={title}
                onChange={(e) => { setTitle(e.target.value); setStep1Errors(p => ({ ...p, title: "" })); }}
                className={step1Errors.title ? "border-rose-500 focus-visible:ring-rose-500" : ""}
              />
              {step1Errors.title && (
                <p className="text-xs text-rose-500 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />{step1Errors.title}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="live-desc">Açıklama (İsteğe Bağlı)</Label>
              <Textarea
                id="live-desc"
                placeholder="Katılımcılara kısa bir bilgi..."
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="resize-none"
              />
            </div>

            <div className="space-y-3">
              <Label>Kapasite Paketi (İsteğe Bağlı)</Label>
              {tiersLoading ? (
                <div className="grid sm:grid-cols-2 gap-3">
                  {[1, 2].map(i => <div key={i} className="h-24 bg-slate-100 rounded-xl animate-pulse" />)}
                </div>
              ) : tiers.length === 0 ? (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800 flex items-center gap-3">
                  <Users className="w-5 h-5 text-amber-500 shrink-0" />
                  Kapasite paketi tanımlı değil. Paket seçmeden devam edebilirsiniz.
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 gap-3">
                  {tiers.map(tier => (
                    <TierCard
                      key={tier.id}
                      tier={tier}
                      selected={selectedTier?.id === tier.id}
                      onSelect={(t) => setSelectedTier(selectedTier?.id === t.id ? null : t)}
                    />
                  ))}
                </div>
              )}
              {selectedTier && (
                <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    <strong>{selectedTier.label}</strong> ·{" "}
                    {selectedTier.maxParticipants == null
                      ? `${selectedTier.minParticipants}+ katılımcı`
                      : `max ${selectedTier.maxParticipants} katılımcı`}
                    {selectedTier.priceCents > 0 && <> · <strong>₺{(selectedTier.priceCents / 100).toFixed(2)}</strong></>}
                    {selectedTier.priceCents === 0 && <> · <strong className="text-emerald-600">Ücretsiz</strong></>}
                  </span>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <Button onClick={goToStep2} className="bg-amber-500 hover:bg-amber-600">
                İleri →
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── ADIM 2: Sorular ──────────────────────────────────────────── */}
      {step === 2 && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Sorular</h2>
              <p className="text-sm text-slate-500 mt-1">
                {completedCount}/{questions.length} soru tamamlandı
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="gap-2"
                onClick={() => setShowDOCXDialog(true)}
                disabled={docxLoading}
              >
                <Upload className="w-4 h-4" />
                {docxLoading ? "Yükleniyor..." : "DOCX İçeri Aktar"}
              </Button>
              <Button size="sm" className="bg-amber-500 hover:bg-amber-600"
                onClick={addQuestion}>
                <Plus className="w-4 h-4 mr-1" />Soru Ekle
              </Button>
            </div>
          </div>

          {/* DOCX import dialog — CreateTest ile aynı UX */}
          <Dialog open={showDOCXDialog} onOpenChange={setShowDOCXDialog}>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>DOCX'ten Sorular İçeri Aktar</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <p className="text-sm text-slate-600">
                  Word dosyasını seçin. Sorular otomatik olarak ayrıştırılacak.
                </p>
                <p className="text-xs text-slate-500">
                  Format: <code>1. Soru metni</code>, ardından <code>A) ... E)</code> seçenekleri,
                  son satırda <code>Cevap: A</code> veya <code>*A</code>.
                </p>
                <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center">
                  <label className="cursor-pointer flex flex-col items-center gap-2">
                    <Upload className="w-6 h-6 text-slate-400" aria-hidden="true" />
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

          <div className="space-y-2">
            {questions.map((q, idx) => (
              <QuestionItem
                key={q._k}
                questionIndex={idx}
                question={q}
                topicList={topicList}
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

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(1)}>← Geri</Button>
            <Button onClick={goToStep3} className="bg-amber-500 hover:bg-amber-600">
              Önizleme →
            </Button>
          </div>
        </div>
      )}

      {/* ── ADIM 3: Önizleme & Onay ──────────────────────────────────── */}
      {step === 3 && (
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Eye className="w-5 h-5 text-amber-500" />
                Oturum Özeti
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-slate-50 rounded-xl p-4 space-y-3">
                <div>
                  <p className="text-xs text-slate-500">Oturum Başlığı</p>
                  <p className="text-lg font-semibold text-slate-900">{title}</p>
                  {description && <p className="text-sm text-slate-600 mt-1">{description}</p>}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">{completedCount} soru</Badge>
                  {selectedTier ? (
                    <>
                      <Badge variant="outline" className="border-amber-200 text-amber-700 bg-amber-50">
                        <Users className="w-3 h-3 mr-1" />{selectedTier.label}
                      </Badge>
                      <Badge variant="outline" className={
                        selectedTier.priceCents === 0
                          ? "border-emerald-200 text-emerald-700 bg-emerald-50"
                          : "border-amber-200 text-amber-700 bg-amber-50"
                      }>
                        {selectedTier.priceCents === 0 ? "Ücretsiz" : `₺${(selectedTier.priceCents / 100).toFixed(2)}`}
                      </Badge>
                    </>
                  ) : (
                    <Badge variant="outline" className="border-emerald-200 text-emerald-700 bg-emerald-50">
                      Ücretsiz
                    </Badge>
                  )}
                </div>
              </div>

              {/* Soru listesi */}
              <div className="space-y-2">
                <p className="text-sm font-semibold text-slate-700">Sorular</p>
                {questions
                  .filter(q => (q.content.trim() || q.mediaUrl) &&
                    q.options.filter(o => o.content.trim() || o.mediaUrl).length >= 2 &&
                    q.options.some(o => o.isCorrect))
                  .map((q, idx) => {
                    const correctIdx = q.options.findIndex(o => o.isCorrect);
                    return (
                      <div key={q._k} className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                        <div className="flex items-start gap-3">
                          <span className="w-6 h-6 rounded-full bg-amber-100 text-amber-700 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                            {idx + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            {q.mediaUrl && (
                              <div className="w-20 h-14 rounded-lg overflow-hidden bg-slate-200 mb-2">
                                <img src={q.mediaUrl} alt="" className="w-full h-full object-cover" />
                              </div>
                            )}
                            <p className="text-sm font-medium text-slate-900 line-clamp-2">{q.content}</p>
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {q.options.filter(o => o.content.trim() || o.mediaUrl).map((o, oi) => (
                                <span key={o._k} className={`text-xs px-2 py-0.5 rounded-full border ${
                                  o.isCorrect
                                    ? "bg-emerald-100 text-emerald-700 border-emerald-200 font-semibold"
                                    : "bg-slate-100 text-slate-500 border-slate-200"
                                }`}>
                                  {LETTERS[oi]}) {o.content.length > 30 ? o.content.slice(0, 30) + "…" : o.content}
                                </span>
                              ))}
                            </div>
                            <p className="text-xs text-emerald-600 mt-1">
                              ✓ Doğru: {correctIdx >= 0 ? LETTERS[correctIdx] : "—"}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>

              <div className="border-t pt-4 space-y-3">
                {selectedTier && selectedTier.priceCents > 0 && (
                  <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                    <Zap className="w-4 h-4 shrink-0 mt-0.5" />
                    Oturum oluşturulunca <strong className="mx-1">₺{(selectedTier.priceCents / 100).toFixed(2)}</strong> ödemesi alınacaktır.
                  </div>
                )}
                <Button
                  className="w-full bg-amber-500 hover:bg-amber-600 gap-2"
                  disabled={createMutation.isPending}
                  onClick={() => {
                    // Önce form geçerli mi kontrol et (tamamlanmış soru sayısı)
                    const valid = questions.filter((q) => {
                      const filled = q.options.filter((o) => o.content.trim() || o.mediaUrl);
                      return (q.content.trim() || q.mediaUrl) && filled.length >= 2 && q.options.some((o) => o.isCorrect);
                    });
                    if (valid.length === 0) {
                      toast.error("En az bir tamamlanmış soru gereklidir");
                      return;
                    }
                    // Ödeme modal'ını aç — kayıt sadece ödeme onayından sonra yapılır
                    setPaymentOpen(true);
                  }}
                >
                  {createMutation.isPending
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Oluşturuluyor...</>
                    : <><Zap className="w-4 h-4" /> Ödeme Yap ve Oluştur</>}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Button variant="outline" onClick={() => setStep(2)}>← Geri (Sorular)</Button>
        </div>
      )}

      {/* ── Ödeme Onay Modalı ── */}
      <Dialog
        open={paymentOpen}
        onOpenChange={(o) => {
          if (!o && !createMutation.isPending) {
            setPaymentOpen(false);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-amber-500" aria-hidden="true" />
              Ödeme ile Oturum Oluştur
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="p-4 bg-slate-50 rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500">Başlık</span>
                <span className="text-sm font-medium text-slate-800 truncate max-w-[220px]" title={title}>
                  {title || "—"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500">Paket</span>
                <span className="text-sm font-medium text-slate-800">
                  {selectedTier?.label ?? "—"}
                  {selectedTier?.maxParticipants != null && (
                    <span className="text-slate-400 ml-1">/ {selectedTier.maxParticipants} kişi</span>
                  )}
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-slate-200 pt-2 mt-2">
                <span className="text-sm font-semibold text-slate-700">Tutar</span>
                <div className="text-right">
                  {appliedPromo ? (
                    <>
                      <div className="text-xs text-slate-400 line-through">
                        ₺{((selectedTier?.priceCents ?? 0) / 100).toFixed(2)}
                      </div>
                      <div className="text-lg font-bold text-emerald-700">
                        ₺{(appliedPromo.finalAmountCents / 100).toFixed(2)}
                      </div>
                    </>
                  ) : (
                    <span className="text-lg font-bold text-amber-700">
                      ₺{((selectedTier?.priceCents ?? 0) / 100).toFixed(2)}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Sprint 15 #4 — Platform Promo Kodu (admin-issued).
                Ücretli tier için input + Uygula butonu. Validate başarılıysa
                yeşil rozet + son fiyat üstte gösterilir. */}
            {(selectedTier?.priceCents ?? 0) > 0 && (
              <div className="rounded-lg border border-slate-200 p-3 space-y-2 bg-slate-50">
                {appliedPromo ? (
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm text-emerald-800">
                      <span className="font-semibold">✓ {appliedPromo.code}</span>
                      {" — "}
                      <span>%{appliedPromo.percentOff} indirim</span>
                    </div>
                    <button
                      type="button"
                      onClick={handleRemovePromo}
                      className="text-xs text-emerald-700 underline hover:no-underline"
                    >
                      Kaldır
                    </button>
                  </div>
                ) : (
                  <>
                    <label htmlFor="promo-code" className="text-xs font-medium text-slate-600">
                      Promo kodun var mı? (Sınav Salonu yöneticisinden)
                    </label>
                    <div className="flex gap-2">
                      <Input
                        id="promo-code"
                        value={promoInput}
                        onChange={(e) => setPromoInput(e.target.value)}
                        placeholder="KOD"
                        className="flex-1 uppercase h-9"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleValidatePromo();
                          }
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleValidatePromo}
                        disabled={promoLoading || !promoInput.trim()}
                      >
                        {promoLoading ? "..." : "Uygula"}
                      </Button>
                    </div>
                    {promoError && <p className="text-xs text-rose-600">{promoError}</p>}
                  </>
                )}
              </div>
            )}

            {(selectedTier?.priceCents ?? 0) > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-600 mb-2">Ödeme Sağlayıcısı</p>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: "iyzico",     label: "iyzico" },
                    { id: "google_pay", label: "G Pay" },
                    { id: "amazon_pay", label: "Amazon" },
                  ].map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPaymentProvider(p.id)}
                      disabled={createMutation.isPending}
                      className={cn(
                        "px-3 py-2 rounded-lg border text-sm font-medium transition-colors",
                        paymentProvider === p.id
                          ? "border-amber-500 bg-amber-50 text-amber-700"
                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                      )}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <p className="text-xs text-slate-500">
              {(selectedTier?.priceCents ?? 0) > 0
                ? "Ödeme tamamlandıktan sonra oturum oluşturulur ve katılım kodu üretilir."
                : "Bu paket ücretsiz — onayladığınızda oturum oluşturulur."}
            </p>

            <div className="flex gap-3 justify-end pt-2 border-t">
              <Button
                variant="outline"
                onClick={() => setPaymentOpen(false)}
                disabled={createMutation.isPending}
              >
                İptal
              </Button>
              <Button
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending}
                className="bg-amber-500 hover:bg-amber-600"
              >
                {createMutation.isPending
                  ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> İşleniyor...</>
                  : (selectedTier?.priceCents ?? 0) > 0
                    ? <><Zap className="w-4 h-4 mr-1" /> Ödemeyi Tamamla</>
                    : <><Zap className="w-4 h-4 mr-1" /> Onayla ve Oluştur</>}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
