/**
 * PaymentModal — Ödeme yöntemi seçim ve kart bilgileri modalı.
 * Adımlar: select → card (iyzico) | processing (hepsi) → success | error
 * Desteklenen sağlayıcılar: iyzico, Google Pay, Amazon Pay
 */
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { entities, contracts as contractsApi, discounts as discountsApi } from "@/api/dalClient";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  CheckCircle,
  AlertCircle,
  Loader2,
  CreditCard,
  ArrowLeft,
  ShieldCheck,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Kart numarası ve son kullanma tarihi formatlama yardımcıları
// ---------------------------------------------------------------------------

function formatCardNumber(value) {
  const digits = value.replace(/\D/g, "").slice(0, 16);
  return digits.replace(/(\d{4})(?=\d)/g, "$1 ").trim();
}

function formatExpiry(value) {
  const digits = value.replace(/\D/g, "").slice(0, 4);
  if (digits.length >= 2) return digits.slice(0, 2) + "/" + digits.slice(2);
  return digits;
}

// ---------------------------------------------------------------------------
// Sağlayıcı tanımları
// ---------------------------------------------------------------------------

const PROVIDERS = [
  {
    id: "iyzico",
    name: "iyzico",
    description: "Kredi/banka kartı ile güvenli ödeme",
    colors: "border-[#ff6600] hover:bg-orange-50",
    selectedColors: "border-[#ff6600] bg-orange-50 ring-2 ring-[#ff6600]/30",
    logo: (
      <svg viewBox="0 0 80 24" className="h-6 w-auto" fill="none">
        <text
          x="0"
          y="20"
          fontFamily="Arial"
          fontSize="20"
          fontWeight="bold"
          fill="#ff6600"
        >
          iyzico
        </text>
      </svg>
    ),
  },
  {
    id: "google_pay",
    name: "Google Pay",
    description: "Google hesabınızla hızlı ödeme",
    colors: "border-slate-300 hover:bg-slate-50",
    selectedColors: "border-slate-700 bg-slate-50 ring-2 ring-slate-300",
    logo: (
      <div className="flex items-center gap-1">
        <span className="text-[#4285F4] font-bold text-lg leading-none">G</span>
        <span className="text-slate-700 font-medium text-sm">Pay</span>
      </div>
    ),
  },
  {
    id: "amazon_pay",
    name: "Amazon Pay",
    description: "Amazon hesabınızla güvenli ödeme",
    colors: "border-[#FF9900] hover:bg-amber-50",
    selectedColors: "border-[#FF9900] bg-amber-50 ring-2 ring-[#FF9900]/30",
    logo: (
      <div className="flex items-center gap-1">
        <span className="text-slate-800 font-bold text-sm leading-none">
          amazon
        </span>
        <span className="text-[#FF9900] font-bold text-sm leading-none">
          pay
        </span>
      </div>
    ),
  },
];

// ---------------------------------------------------------------------------
// Sprint 15 #2 — İndirim kodu input
// ---------------------------------------------------------------------------

/**
 * "İndirim kodun var mı?" input + Uygula butonu.
 *
 *   - applied yoksa: input + buton görünür
 *   - applied dolu: badge ("✓ %X indirim — ₺Y") + Kaldır butonu
 *   - error varsa: input altında kırmızı mesaj
 */
function DiscountCodeInput({ value, onChange, applied, error, loading, onApply, onRemove }) {
  if (applied) {
    return (
      <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 flex items-center justify-between gap-3">
        <div className="text-sm text-emerald-800">
          <span className="font-semibold">✓ {applied.code}</span>{" "}
          <span>—</span>{" "}
          <span>
            %{applied.percentOff} indirim ({formatPrice(applied.discountCents)} ₺)
          </span>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="text-xs text-emerald-700 underline hover:no-underline"
        >
          Kaldır
        </button>
      </div>
    );
  }
  return (
    <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 space-y-2">
      <label className="block text-sm font-medium text-slate-700">
        İndirim kodun var mı?
      </label>
      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="KOD"
          className="flex-1 uppercase"
          aria-label="İndirim kodu"
          onKeyDown={(e) => {
            // Enter ile uygula
            if (e.key === "Enter") {
              e.preventDefault();
              onApply();
            }
          }}
        />
        <Button
          type="button"
          onClick={onApply}
          disabled={loading || !value?.trim()}
          variant="outline"
          className="shrink-0"
        >
          {loading ? "..." : "Uygula"}
        </Button>
      </div>
      {error && <p className="text-xs text-rose-600">{error}</p>}
    </div>
  );
}

/** Cents → "₺X" string formatlamasına yardımcı (basit). */
function formatPrice(cents) {
  return (cents / 100).toFixed(2).replace(/\.00$/, "");
}

// ---------------------------------------------------------------------------
// Sprint 14 — Mesafeli Satış Sözleşmesi onay checkbox'ı
// ---------------------------------------------------------------------------

/**
 * Modal'ın select adımında gösterilir. Sözleşme henüz fetch edilmediyse
 * (`available=false`) loading state; varsa checkbox + linkler.
 *
 * Link target="_blank" — kullanıcı sözleşmeyi yeni sekmede okuyup checkbox'a döner.
 */
function DistanceSaleCheckbox({ checked, onChange, available }) {
  if (!available) {
    return (
      <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs text-slate-500">
        Mesafeli satış sözleşmesi yükleniyor...
      </div>
    );
  }
  return (
    <label className="flex items-start gap-2 rounded-lg bg-slate-50 border border-slate-200 p-3 text-sm text-slate-700 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
        aria-required="true"
      />
      <span>
        <Link
          to="/sozlesmeler/mesafeli-satis"
          target="_blank"
          rel="noopener noreferrer"
          className="text-indigo-600 underline hover:no-underline"
        >
          Ön Bilgilendirme Formu&apos;nu ve Mesafeli Satış Sözleşmesi&apos;ni
        </Link>{" "}
        okudum, onaylıyorum.
      </span>
    </label>
  );
}

// ---------------------------------------------------------------------------
// Bileşen
// ---------------------------------------------------------------------------

/**
 * @param {Object}  props
 * @param {boolean} props.isOpen
 * @param {() => void} props.onClose
 * @param {{ id: string, title: string, price: number }} props.test
 * @param {string}  [props.discountCode]
 */
export function PaymentModal({ isOpen, onClose, test, discountCode }) {
  // "select" | "card" | "processing" | "success" | "error"
  const [step, setStep] = useState("select");
  const [selectedProvider, setSelectedProvider] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);

  // Kart formu controlled state
  const [cardNumber, setCardNumber] = useState("");
  const [cardHolder, setCardHolder] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvv, setCvv] = useState("");

  // Sprint 14 — Mesafeli Satış Sözleşmesi onayı (TKHK m.48). Her satın almada
  // ayrı kayıt; modal açıldığında aktif sözleşme fetch edilir, checkbox işaretlenince
  // contract.id Purchase.create body'sine geçer.
  const [distanceSaleContract, setDistanceSaleContract] = useState(null);
  const [acceptedDistanceSale, setAcceptedDistanceSale] = useState(false);

  // Sprint 15 #2 — İndirim kodu input + validate state.
  // discountCode prop'u varsa initial state'e konur (geriye dönük uyumluluk);
  // kullanıcı modal'da yeni kod girip Uygula'ya basabilir.
  const [discountInput, setDiscountInput] = useState(discountCode || "");
  const [appliedDiscount, setAppliedDiscount] = useState(null); // { code, percentOff, discountCents, finalAmountCents }
  const [discountError, setDiscountError] = useState(null);
  const [discountLoading, setDiscountLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    contractsApi
      .getActive("DISTANCE_SALE")
      .then((c) => setDistanceSaleContract(c))
      .catch(() => setDistanceSaleContract(null));
  }, [isOpen]);

  const queryClient = useQueryClient();

  // ---------------------------------------------------------------------------
  // Yardımcılar
  // ---------------------------------------------------------------------------

  const resetCardForm = () => {
    setCardNumber("");
    setCardHolder("");
    setExpiry("");
    setCvv("");
  };

  const handleClose = () => {
    if (step === "processing") return; // İşlem sırasında kapatma engeli
    setStep("select");
    setSelectedProvider(null);
    resetCardForm();
    setErrorMessage(null);
    setAcceptedDistanceSale(false);
    // Sprint 15 — indirim state'ini de sıfırla
    setDiscountInput("");
    setAppliedDiscount(null);
    setDiscountError(null);
    purchaseMutation.reset();
    onClose();
  };

  // Sprint 15 #2 — İndirim kodu validate handler.
  // Backend `POST /discounts/validate` 200 dönerse appliedDiscount set olur ve
  // son fiyat UI'da gösterilir. Hata varsa kısa kullanıcı dostu mesaj.
  const handleValidateDiscount = async () => {
    setDiscountError(null);
    const code = (discountInput || "").trim().toUpperCase();
    if (!code) return;
    setDiscountLoading(true);
    try {
      const basePrice = Math.round((test?.price ?? 0) * 100); // ₺ → cents
      const result = await discountsApi.validate(code, test.id, basePrice);
      setAppliedDiscount(result);
    } catch (err) {
      const errorCode = err?.response?.data?.code || err?.response?.data?.error?.code;
      const map = {
        DISCOUNT_NOT_FOUND: "İndirim kodu bulunamadı",
        DISCOUNT_NOT_ACTIVE: "Bu kod pasif",
        DISCOUNT_OUT_OF_WINDOW: "Bu kod artık geçerli değil",
        DISCOUNT_USAGE_EXHAUSTED: "Kullanım hakkı tükendi",
        DISCOUNT_NOT_OWNED: "Bu kod bu paket için geçerli değil",
      };
      setDiscountError(map[errorCode] || "İndirim kodu doğrulanamadı");
      setAppliedDiscount(null);
    } finally {
      setDiscountLoading(false);
    }
  };

  const handleRemoveDiscount = () => {
    setAppliedDiscount(null);
    setDiscountInput("");
    setDiscountError(null);
  };

  // ---------------------------------------------------------------------------
  // Mutation
  // ---------------------------------------------------------------------------

  const purchaseMutation = useMutation({
    mutationFn: async () => {
      // Sprint 14 — Mesafeli Satış sözleşmesi acceptance backend'e gönderilir.
      // Backend bunu aktif contract ID ile karşılaştırır; eşleşmezse 400 atar.
      //
      // Sprint 15 #2 — İndirim kodu: önce kullanıcının modal içinde validate
      // edip uyguladığı `appliedDiscount.code`, yoksa parent'tan gelen
      // `discountCode` prop'u (geriye dönük). Backend `PurchaseUseCase`
      // race-condition korumalı şekilde usedCount++ yapar.
      await entities.Purchase.create({
        test_package_id: test.id,
        discount_code: appliedDiscount?.code || discountCode || undefined,
        payment_provider: selectedProvider,
        acceptedDistanceSaleContractId: distanceSaleContract?.id,
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["purchases"] }),
        queryClient.invalidateQueries({ queryKey: ["myPurchases"] }),
      ]);
      setStep("success");
    },
    onError: (err) => {
      const code =
        err?.response?.data?.error?.code ??
        err?.code ??
        err?.response?.data?.code;
      const httpStatus = err?.response?.status;

      // Geliştirme modunda tam hata detayını konsola yaz
      if (import.meta.env.DEV) {
        console.error("[PaymentModal] Purchase error:", {
          httpStatus,
          code,
          message: err?.message,
          responseData: err?.response?.data,
        });
      }

      if (code === "ALREADY_PURCHASED" || httpStatus === 409) {
        setErrorMessage("Bu testi zaten satın aldınız.");
      } else if (httpStatus === 403) {
        setErrorMessage(
          "Bu işlem için yetkiniz bulunmuyor. Lütfen tekrar giriş yapın."
        );
      } else if (httpStatus === 429) {
        setErrorMessage(
          "Çok fazla istek gönderildi. Lütfen bir dakika bekleyip tekrar deneyin."
        );
      } else if (!httpStatus) {
        setErrorMessage(
          "Sunucuya ulaşılamadı. Bağlantınızı kontrol edin."
        );
      } else {
        setErrorMessage(
          `Ödeme işlemi başarısız oldu (HTTP ${httpStatus}${code && code !== "HTTP_ERROR" ? " · " + code : ""}). Lütfen tekrar deneyin.`
        );
      }
      setStep("error");
    },
  });

  // ---------------------------------------------------------------------------
  // Akış yöneticileri
  // ---------------------------------------------------------------------------

  const handleConfirm = async () => {
    if (!selectedProvider) return;

    if (selectedProvider === "iyzico") {
      setStep("card");
      return;
    }

    // Google Pay / Amazon Pay: direkt işleme
    setStep("processing");
    await new Promise((r) => setTimeout(r, 1500));
    purchaseMutation.mutate();
  };

  const handleCardSubmit = () => {
    if (!cardNumber || !cardHolder || !expiry || !cvv) return;
    setStep("processing");
    // iyzico: gerçek entegrasyonda kart tokenize edilir; şimdilik direkt satın alma
    purchaseMutation.mutate();
  };

  const fillTestCard = () => {
    setCardNumber("5528 7900 0000 0008");
    setCardHolder("TEST KULLANICI");
    setExpiry("12/30");
    setCvv("123");
  };

  // ---------------------------------------------------------------------------
  // Türetilmiş değerler
  // ---------------------------------------------------------------------------

  const price = test?.price ?? 0;
  const isFree = price === 0;
  const isCardFormComplete = cardNumber && cardHolder && expiry && cvv;
  // Sprint 14 — Mesafeli satış onayı ücretli + ücretsiz tüm satın alımlarda zorunlu
  // (KVKK/TKHK kapsamında ücretsiz dijital içerikte de kullanım koşulları kabul edilmeli).
  const canProceed = acceptedDistanceSale && distanceSaleContract?.id;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        {/* ------------------------------------------------------------------ */}
        {/* Adım: select                                                         */}
        {/* ------------------------------------------------------------------ */}
        {step === "select" && (
          <>
            <DialogHeader>
              <DialogTitle className="text-xl">
                Ödeme Yöntemi Seçin
              </DialogTitle>
              <DialogDescription className="text-slate-500">
                <span className="font-medium text-slate-700">
                  {test?.title}
                </span>
                {" — "}
                {isFree ? (
                  <span className="text-emerald-600 font-semibold">
                    Ücretsiz
                  </span>
                ) : (
                  <span className="text-slate-900 font-semibold">
                    ₺{price}
                  </span>
                )}
                {discountCode && (
                  <span className="ml-2 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                    İndirim uygulandı
                  </span>
                )}
              </DialogDescription>
            </DialogHeader>

            {/* Sprint 15 #2 — İndirim kodu input (ücretsiz paket dışı her durumda).
                Kullanıcı kodu yazar, "Uygula" backend'e validate eder, başarılıysa
                indirim oranı + son fiyat gösterilir. Submit'te aynı kod body'ye gider. */}
            {!isFree && (
              <DiscountCodeInput
                value={discountInput}
                onChange={setDiscountInput}
                applied={appliedDiscount}
                error={discountError}
                loading={discountLoading}
                onApply={handleValidateDiscount}
                onRemove={handleRemoveDiscount}
              />
            )}

            {/* Sprint 14 — Mesafeli Satış Sözleşmesi onayı (TKHK m.48).
                Ücretli + ücretsiz akış öncesinde gösterilir; eksikse satın alma butonu disabled. */}
            <DistanceSaleCheckbox
              checked={acceptedDistanceSale}
              onChange={setAcceptedDistanceSale}
              available={Boolean(distanceSaleContract)}
            />

            {isFree ? (
              /* Ücretsiz test — direkt satın al */
              <div className="py-2">
                <p className="text-sm text-slate-500 mb-4">
                  Bu test ücretsizdir. Hemen erişim kazanın.
                </p>
                <Button
                  className="w-full h-12 bg-indigo-600 hover:bg-indigo-700 text-white"
                  onClick={() => {
                    setStep("processing");
                    purchaseMutation.mutate();
                  }}
                  disabled={purchaseMutation.isPending || !canProceed}
                >
                  {purchaseMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      İşleniyor...
                    </>
                  ) : (
                    "Ücretsiz Erişim Kazan"
                  )}
                </Button>
              </div>
            ) : (
              <>
                <div className="space-y-3 py-2">
                  {PROVIDERS.map((provider) => {
                    const isSelected = selectedProvider === provider.id;
                    return (
                      <button
                        key={provider.id}
                        data-testid={`provider-${provider.id}`}
                        onClick={() => setSelectedProvider(provider.id)}
                        className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left ${
                          isSelected
                            ? provider.selectedColors
                            : provider.colors
                        }`}
                      >
                        <div className="w-20 flex items-center justify-start shrink-0">
                          {provider.logo}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-800">
                            {provider.name}
                          </p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {provider.description}
                          </p>
                        </div>
                        <div
                          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                            isSelected
                              ? "border-indigo-600 bg-indigo-600"
                              : "border-slate-300"
                          }`}
                        >
                          {isSelected && (
                            <div className="w-2 h-2 rounded-full bg-white" />
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="pt-2 space-y-2">
                  <Button
                    className="w-full h-12 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold"
                    onClick={handleConfirm}
                    disabled={!selectedProvider || !canProceed}
                  >
                    {!canProceed
                      ? "Sözleşmeyi onaylayın"
                      : selectedProvider
                      ? "Devam Et"
                      : "Ödeme yöntemi seçin"}
                  </Button>
                  <p className="text-center text-xs text-slate-400">
                    Ödemeniz 256-bit SSL ile şifrelenerek güvence altına
                    alınır.
                  </p>
                </div>
              </>
            )}
          </>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* Adım: card (iyzico kart formu)                                      */}
        {/* ------------------------------------------------------------------ */}
        {step === "card" && (
          <div className="space-y-4">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-xl">
                <CreditCard className="w-5 h-5 text-indigo-600" />
                Kart Bilgileri
              </DialogTitle>
              <DialogDescription className="text-slate-500">
                <span className="font-medium text-slate-700">
                  {test?.title}
                </span>
                {" — "}
                <span className="text-slate-900 font-semibold">₺{price}</span>
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              {/* Kart Numarası */}
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">
                  Kart Numarası
                </label>
                <Input
                  type="text"
                  inputMode="numeric"
                  placeholder="0000 0000 0000 0000"
                  value={cardNumber}
                  onChange={(e) =>
                    setCardNumber(formatCardNumber(e.target.value))
                  }
                  className="rounded-xl border-2 focus:border-indigo-400 h-11 tracking-widest"
                  maxLength={19}
                />
              </div>

              {/* Kart Üzerindeki İsim */}
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">
                  Kart Üzerindeki İsim
                </label>
                <Input
                  type="text"
                  placeholder="AD SOYAD"
                  value={cardHolder}
                  onChange={(e) =>
                    setCardHolder(e.target.value.toUpperCase())
                  }
                  className="rounded-xl border-2 focus:border-indigo-400 h-11 uppercase"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Son Kullanma Tarihi */}
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700">
                    Son Kullanma Tarihi
                  </label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    placeholder="AA/YY"
                    value={expiry}
                    onChange={(e) =>
                      setExpiry(formatExpiry(e.target.value))
                    }
                    className="rounded-xl border-2 focus:border-indigo-400 h-11"
                    maxLength={5}
                  />
                </div>

                {/* CVV */}
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700">
                    CVV
                  </label>
                  <Input
                    type="password"
                    inputMode="numeric"
                    placeholder="000"
                    value={cvv}
                    onChange={(e) =>
                      setCvv(e.target.value.replace(/\D/g, "").slice(0, 4))
                    }
                    className="rounded-xl border-2 focus:border-indigo-400 h-11"
                    maxLength={4}
                  />
                </div>
              </div>

              {/* Test Kartı Doldur */}
              <button
                type="button"
                onClick={fillTestCard}
                className="w-full text-xs text-amber-700 bg-amber-50 border border-amber-200 hover:bg-amber-100 rounded-lg px-3 py-2 transition-colors font-medium"
              >
                Test Kartı Doldur
              </button>
            </div>

            <div className="space-y-2 pt-1">
              <Button
                className="w-full h-12 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold"
                onClick={handleCardSubmit}
                disabled={!isCardFormComplete}
              >
                <ShieldCheck className="w-4 h-4 mr-2" />
                ₺{price} Güvenli Öde
              </Button>
              <button
                type="button"
                onClick={() => setStep("select")}
                className="w-full flex items-center justify-center gap-1 text-sm text-slate-500 hover:text-slate-700 py-1 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Geri
              </button>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* Adım: processing                                                     */}
        {/* ------------------------------------------------------------------ */}
        {step === "processing" && (
          <div className="py-10 text-center space-y-4">
            <div className="flex justify-center">
              <Loader2 className="w-12 h-12 text-indigo-600 animate-spin" />
            </div>
            <div>
              <p className="text-lg font-semibold text-slate-800">
                Ödeme İşleniyor...
              </p>
              <p className="text-sm text-slate-400 mt-1">
                Lütfen sayfayı kapatmayın
              </p>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* Adım: success                                                        */}
        {/* ------------------------------------------------------------------ */}
        {step === "success" && (
          <div className="py-6 text-center space-y-4">
            <div className="flex justify-center">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center">
                <CheckCircle className="w-9 h-9 text-emerald-600" />
              </div>
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-900">
                Satın Alma Başarılı!
              </h3>
              <p className="text-slate-500 mt-1 text-sm">
                <span className="font-medium text-slate-700">
                  {test?.title}
                </span>{" "}
                artık hesabınızda.
              </p>
            </div>
            <Button
              className="w-full h-11 bg-indigo-600 hover:bg-indigo-700 text-white"
              onClick={handleClose}
            >
              Teste Başla
            </Button>
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* Adım: error                                                          */}
        {/* ------------------------------------------------------------------ */}
        {step === "error" && (
          <div className="py-6 text-center space-y-4">
            <div className="flex justify-center">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
                <AlertCircle className="w-9 h-9 text-red-600" />
              </div>
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-900">
                Ödeme Başarısız
              </h3>
              <p className="text-slate-500 mt-1 text-sm">
                {errorMessage ?? "Ödeme işlemi başarısız oldu."}
              </p>
            </div>
            <div className="space-y-2">
              <Button
                className="w-full h-11 bg-indigo-600 hover:bg-indigo-700 text-white"
                onClick={() => {
                  setStep("select");
                  setErrorMessage(null);
                  purchaseMutation.reset();
                }}
              >
                Tekrar Dene
              </Button>
              <Button
                variant="outline"
                className="w-full h-11"
                onClick={handleClose}
              >
                İptal
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
