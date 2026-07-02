import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { liveSessions as liveApi, liveSessionTiers as tiersApi, topics as topicsApi, platformPromoCodes as promoApi } from "@/api/dalClient";
import { createPageUrl } from "@/utils";
import { useQuery, useMutation } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { CheckCircle2, ArrowLeft, Zap, Loader2, Users,
  Eye, BookOpen, Package, AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
// Canlı sınav soru editörü — okul (SchoolLive) ile TEK KAYNAK. Sabit 5 şık,
// kompakt soru satırları + düzenleme dialog'u, "Soru Ekle".
import { LiveQuestionsEditor, emptyQuestion, LETTERS } from "@/components/live/LiveQuestionsEditor";

const STEPS = [
  { id: 1, label: "Oturum",   icon: Package  },
  { id: 2, label: "Sorular",  icon: BookOpen },
  { id: 3, label: "Önizleme", icon: Eye      },
];

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
  const [step1Errors, setStep1Errors]   = useState(/** @type {any} */ ({}));
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
          {/* Soru editörü — okul (SchoolLive) ile tek kaynak (LiveQuestionsEditor) */}
          <LiveQuestionsEditor
            questions={questions}
            setQuestions={setQuestions}
            topicList={topicList}
          />

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
