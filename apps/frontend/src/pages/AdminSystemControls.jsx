import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api/apiClient";
import { toast } from "sonner";
import {
  ShoppingCart,
  Package,
  Radio,
  PlayCircle,
  Megaphone,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  ShieldAlert,
  Info,
  BadgeDollarSign,
  Percent,
  History,
  Plus,
  ArrowRight,
  Banknote,
  BookOpen,
  Hash,
  Zap,
  Settings,
  CreditCard,
  Smartphone,
  Globe,
  Eye,
  EyeOff,
  ShoppingBag,
  Building2,
  ShieldCheck,
} from "lucide-react";

const CONTROLS = [
  {
    key: "purchasesEnabled",
    label: "Satış",
    description: "Adayların yeni test paketi satın almasını kontrol eder.",
    disabledMessage: "Satın alma servisleri bakımdadır, lütfen daha sonra tekrar deneyin.",
    icon: ShoppingCart,
    audience: "Adaylar",
    affectedAction: "Yeni satın alma işlemi",
    color: "indigo",
  },
  {
    key: "packageCreationEnabled",
    label: "Paket Oluşturma",
    description: "Eğiticilerin yeni test paketi (soru seti) oluşturmasını kontrol eder.",
    disabledMessage: "Test oluşturma geçici olarak durdurulmuştur.",
    icon: Package,
    audience: "Eğiticiler",
    affectedAction: "Yeni test/paket oluşturma",
    color: "violet",
  },
  {
    key: "testPublishingEnabled",
    label: "Canlı Test",
    description: "Eğiticilerin testlerini yayınlayarak canlıya almasını kontrol eder.",
    disabledMessage: "Test yayınlama geçici olarak durdurulmuştur.",
    icon: Radio,
    audience: "Eğiticiler",
    affectedAction: "Test yayınlama (canlıya alma)",
    color: "amber",
  },
  {
    key: "testAttemptsEnabled",
    label: "Test Başlatma",
    description: "Adayların satın aldıkları paketlerde yeni oturum başlatmasını kontrol eder. Devam eden oturumlar etkilenmez.",
    disabledMessage: "Test başlatma geçici olarak durdurulmuştur.",
    icon: PlayCircle,
    audience: "Adaylar",
    affectedAction: "Yeni test oturumu başlatma",
    color: "rose",
  },
  {
    key: "adPurchasesEnabled",
    label: "Reklam Satın Alma",
    description: "Eğiticilerin kendilerini veya test paketlerini öne çıkarmak için reklam satın almasını kontrol eder.",
    disabledMessage: "Reklam satın alma geçici olarak durdurulmuştur.",
    icon: Megaphone,
    audience: "Eğiticiler",
    affectedAction: "Yeni reklam/öne çıkarma satın alma",
    color: "orange",
  },
];

const COLOR_MAP = {
  indigo: {
    icon: "bg-indigo-50 text-indigo-600",
    badge: "bg-indigo-100 text-indigo-700",
    ring: "ring-indigo-500",
    switch: "bg-indigo-600",
  },
  violet: {
    icon: "bg-violet-50 text-violet-600",
    badge: "bg-violet-100 text-violet-700",
    ring: "ring-violet-500",
    switch: "bg-violet-600",
  },
  amber: {
    icon: "bg-amber-50 text-amber-600",
    badge: "bg-amber-100 text-amber-700",
    ring: "ring-amber-500",
    switch: "bg-amber-600",
  },
  rose: {
    icon: "bg-rose-50 text-rose-600",
    badge: "bg-rose-100 text-rose-700",
    ring: "ring-rose-500",
    switch: "bg-rose-600",
  },
  // Reklam kill-switch rengi
  orange: {
    icon: "bg-orange-50 text-orange-600",
    badge: "bg-orange-100 text-orange-700",
    ring: "ring-orange-500",
    switch: "bg-orange-600",
  },
};

function KillSwitch({ control, value, onChange, saving }) {
  const colors = COLOR_MAP[control.color];
  const Icon = control.icon;
  const isEnabled = value;

  return (
    <div
      className={`bg-white rounded-2xl border-2 transition-all duration-200 p-6 ${
        isEnabled ? "border-slate-100" : "border-rose-200 bg-rose-50/30"
      }`}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${colors.icon}`}>
            <Icon className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-slate-900 text-lg">{control.label}</h3>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${colors.badge}`}>
                {control.audience}
              </span>
            </div>
            <p className="text-sm text-slate-500 mt-1">{control.description}</p>
          </div>
        </div>

        {/* Toggle switch */}
        <button
          onClick={() => onChange(!value)}
          disabled={saving}
          className={`relative inline-flex h-7 w-14 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 ${colors.ring} ${
            isEnabled ? colors.switch : "bg-slate-200"
          } disabled:opacity-60 disabled:cursor-wait`}
          aria-pressed={isEnabled}
        >
          <span
            className={`pointer-events-none inline-block h-6 w-6 rounded-full bg-white shadow-lg ring-0 transition-transform duration-200 ease-in-out ${
              isEnabled ? "translate-x-7" : "translate-x-0"
            }`}
          />
        </button>
      </div>

      {/* Status bar */}
      <div className={`mt-4 flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
        isEnabled
          ? "bg-emerald-50 text-emerald-700"
          : "bg-rose-50 text-rose-700 border border-rose-200"
      }`}>
        {saving ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : isEnabled ? (
          <CheckCircle2 className="w-4 h-4" />
        ) : (
          <AlertTriangle className="w-4 h-4" />
        )}
        <span className="font-medium">
          {saving
            ? "Kaydediliyor..."
            : isEnabled
            ? "Aktif — " + control.affectedAction + " açık"
            : "DURDURULDU — " + control.affectedAction + " kapalı"}
        </span>
      </div>

      {/* Disabled notice */}
      {!isEnabled && (
        <div className="mt-3 flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
          <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span>
            <strong>Kullanıcı mesajı:</strong> "{control.disabledMessage}"
          </span>
        </div>
      )}
    </div>
  );
}

function formatDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}

/**
 * Tekrar eden "mevcut değer + input + kaydet" satırı.
 * isSecret=true ise şifre inputu + göster/gizle butonu.
 */
function PaymentField({
  label,
  value,
  inputValue,
  onChange,
  onSave,
  saving,
  isSecret = false,
  showSecret,
  onToggleSecret,
  className = "",
}) {
  const hasValue = value && value.trim();
  const maskedValue = hasValue
    ? isSecret
      ? value.slice(0, 4) + "••••••••" + value.slice(-4)
      : value
    : null;

  return (
    <div className={`space-y-1.5 ${className}`}>
      <label className="block text-xs font-medium text-slate-600">{label}</label>
      {hasValue && (
        <p className="text-xs text-slate-400 font-mono bg-slate-50 px-2 py-1 rounded border border-slate-100 truncate">
          {isSecret && !showSecret ? maskedValue : value}
          {isSecret && (
            <button
              type="button"
              onClick={onToggleSecret}
              className="ml-2 text-indigo-500 hover:text-indigo-700 text-xs font-sans"
            >
              {showSecret ? "Gizle" : "Göster"}
            </button>
          )}
        </p>
      )}
      {!hasValue && <p className="text-xs text-slate-400 italic">Henüz ayarlanmadı</p>}
      <div className="flex gap-2">
        <input
          type={isSecret && !showSecret ? "password" : "text"}
          placeholder={hasValue ? "Yeni değer gir..." : "Değer gir..."}
          value={inputValue}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 px-2.5 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
        />
        <button
          onClick={onSave}
          disabled={!inputValue.trim() || saving}
          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1"
        >
          {saving ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Plus className="w-3 h-3" />
          )}
          Kaydet
        </button>
      </div>
    </div>
  );
}

export default function AdminSystemControls() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("system");
  const [savingKey, setSavingKey] = useState(null);
  const [minPriceInput, setMinPriceInput] = useState("");
  const [minTunnelPriceInput, setMinTunnelPriceInput] = useState("");
  const [maxDiscountInput, setMaxDiscountInput] = useState("");
  const [googleClientIdInput, setGoogleClientIdInput] = useState("");
  const [showGoogleClientId, setShowGoogleClientId] = useState(false);
  const [turnstileSiteKeyInput, setTurnstileSiteKeyInput] = useState("");
  const [turnstileSecretKeyInput, setTurnstileSecretKeyInput] = useState("");
  const [showTurnstileSecret, setShowTurnstileSecret] = useState(false);
  const [newRate, setNewRate] = useState("");
  const [newEffectiveFrom, setNewEffectiveFrom] = useState("");
  const [newNote, setNewNote] = useState("");
  const [savingRate, setSavingRate] = useState(false);

  // Test Kontrolleri state
  const [tcInputs, setTcInputs] = useState({
    minQuestionsPerTest: "",
    maxQuestionsPerTest: "",
    maxTestsPerPackage: "",
    maxLiveQuestions: "",
    maxLayersPerTunnel: "",
    minQuestionsPerLayer: "",
    maxQuestionsPerLayer: "",
    tunnelAdvanceStreak: "",
    tunnelOptionsPerQuestion: "",
  });
  const [savingTc, setSavingTc] = useState(null);

  // Ödeme ayarları state'leri
  const [paymentInputs, setPaymentInputs] = useState({});
  const [savingPayment, setSavingPayment] = useState(null);
  const [showSecrets, setShowSecrets] = useState({
    iyzicoApiKey: false,
    iyzicoSecretKey: false,
  });

  const { data: settings, isLoading } = useQuery({
    queryKey: ["admin-settings"],
    queryFn: async () => {
      const { data } = await api.get("/admin/settings");
      return data;
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (patch) => {
      const { data } = await api.patch("/admin/settings", patch);
      return data;
    },
    onSuccess: (data, variables) => {
      queryClient.setQueryData(["admin-settings"], (old) => ({ ...old, ...data }));
      // Also invalidate the public service-status cache
      queryClient.invalidateQueries({ queryKey: ["service-status"] });
      const key = Object.keys(variables)[0];
      const ctrl = CONTROLS.find((c) => c.key === key);
      if (ctrl) {
        const nowEnabled = variables[key];
        toast.success(
          nowEnabled
            ? `${ctrl.label} hizmeti yeniden açıldı`
            : `${ctrl.label} hizmeti durduruldu`,
          { description: nowEnabled ? undefined : "Kullanıcılara uyarı mesajı gösterilecek." }
        );
      }
    },
    onError: () => {
      toast.error("Ayar güncellenemedi");
    },
    onSettled: () => {
      setSavingKey(null);
    },
  });

  const handleToggle = (key, newValue) => {
    setSavingKey(key);
    updateMutation.mutate({ [key]: newValue });
  };

  const handleMinPriceSave = () => {
    const tl = parseFloat(minPriceInput);
    if (isNaN(tl) || tl <= 0) {
      toast.error("Geçerli bir fiyat giriniz");
      return;
    }
    const cents = Math.round(tl * 100);
    setSavingKey("minPackagePriceCents");
    updateMutation.mutate({ minPackagePriceCents: cents });
    setMinPriceInput("");
  };

  const handleMinTunnelPriceSave = () => {
    const tl = parseFloat(minTunnelPriceInput);
    if (isNaN(tl) || tl < 0) {
      toast.error("Geçerli bir fiyat giriniz (0 = ücretsiz serbest)");
      return;
    }
    const cents = Math.round(tl * 100);
    setSavingKey("minTunnelPriceCents");
    updateMutation.mutate({ minTunnelPriceCents: cents });
    setMinTunnelPriceInput("");
  };

  const handleMaxDiscountSave = () => {
    const pct = parseInt(maxDiscountInput, 10);
    if (isNaN(pct) || pct < 1 || pct > 100) {
      toast.error("Geçerli bir yüzde değeri giriniz (1-100)");
      return;
    }
    setSavingKey("maxDiscountPercent");
    updateMutation.mutate({ maxDiscountPercent: pct });
    setMaxDiscountInput("");
  };

  const handleGoogleClientIdSave = (clear = false) => {
    const val = clear ? null : googleClientIdInput.trim();
    if (!clear) {
      if (!val) {
        toast.error("Client ID giriniz veya 'Temizle' kullanın");
        return;
      }
      if (!/\.apps\.googleusercontent\.com$/i.test(val)) {
        toast.error("Geçerli bir Google Client ID değil (…apps.googleusercontent.com ile bitmeli)");
        return;
      }
    }
    setSavingKey("googleClientId");
    updateMutation.mutate({ googleClientId: val });
    setGoogleClientIdInput("");
  };

  // Cloudflare Turnstile — site key + secret key. Boş geçirilebilir (CAPTCHA devre dışı kalır).
  const handleTurnstileSave = (clear = false) => {
    const site = clear ? null : turnstileSiteKeyInput.trim() || null;
    const secret = clear ? null : turnstileSecretKeyInput.trim() || null;
    if (!clear) {
      // En az birini doldurmuş olmalı (yoksa Kaydet'in anlamı yok)
      if (!site && !secret) {
        toast.error("En az bir anahtar (site veya secret) giriniz veya 'Temizle' kullanın");
        return;
      }
    }
    setSavingKey("turnstile");
    const payload = {};
    if (clear) {
      payload.turnstileSiteKey = null;
      payload.turnstileSecretKey = null;
    } else {
      if (turnstileSiteKeyInput !== "") payload.turnstileSiteKey = site;
      if (turnstileSecretKeyInput !== "") payload.turnstileSecretKey = secret;
    }
    updateMutation.mutate(payload);
    setTurnstileSiteKeyInput("");
    setTurnstileSecretKeyInput("");
  };

  const { data: rateHistory = [], isLoading: ratesLoading } = useQuery({
    queryKey: ["commission-rates"],
    queryFn: async () => {
      const { data } = await api.get("/admin/commission/rates");
      return data;
    },
  });

  const { data: paymentSettings, isLoading: paymentLoading } = useQuery({
    queryKey: ["admin-payment-settings"],
    queryFn: async () => {
      const { data } = await api.get("/admin/settings/payment-settings");
      return data;
    },
  });

  const addRateMutation = useMutation({
    mutationFn: async (payload) => {
      const { data } = await api.post("/admin/commission/rates", payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["commission-rates"] });
      toast.success("Komisyon oranı güncellendi");
      setNewRate("");
      setNewEffectiveFrom("");
      setNewNote("");
    },
    onError: () => {
      toast.error("Komisyon oranı güncellenemedi");
    },
    onSettled: () => {
      setSavingRate(false);
    },
  });

  const handleRateSave = () => {
    const pct = parseInt(newRate, 10);
    if (isNaN(pct) || pct < 0 || pct > 100) {
      toast.error("Geçerli bir oran giriniz (0-100)");
      return;
    }
    setSavingRate(true);
    addRateMutation.mutate({
      commissionPercent: pct,
      effectiveFrom: newEffectiveFrom || undefined,
      note: newNote || undefined,
    });
  };

  const allEnabled = CONTROLS.every((c) => settings?.[c.key] !== false);
  const disabledCount = CONTROLS.filter((c) => settings?.[c.key] === false).length;

  const handleTcSave = (key, minVal = 1) => {
    const val = parseInt(tcInputs[key], 10);
    if (isNaN(val) || val < minVal) {
      toast.error(`Geçerli bir değer giriniz (en az ${minVal})`);
      return;
    }
    setSavingTc(key);
    updateMutation.mutate(
      { [key]: val },
      {
        onSettled: () => setSavingTc(null),
        onSuccess: () => setTcInputs((prev) => ({ ...prev, [key]: "" })),
      }
    );
  };

  const savePaymentField = async (fields) => {
    setSavingPayment(Object.keys(fields)[0]);
    try {
      await api.patch("/admin/settings/payment-settings", fields);
      queryClient.invalidateQueries({ queryKey: ["admin-payment-settings"] });
      toast.success("Ödeme ayarı güncellendi");
      setPaymentInputs((p) => {
        const next = { ...p };
        Object.keys(fields).forEach((k) => delete next[k]);
        return next;
      });
    } catch {
      toast.error("Güncellenemedi");
    } finally {
      setSavingPayment(null);
    }
  };

  const TABS = [
    { id: "system", label: "Sistem Kontrolleri", icon: ShieldAlert },
    { id: "finance", label: "Mali Kontrol", icon: Banknote },
    { id: "tests", label: "Test Kontrolleri", icon: BookOpen },
    { id: "integrations", label: "Entegrasyonlar", icon: Globe },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              activeTab === "system" ? "bg-rose-50" : activeTab === "finance" ? "bg-indigo-50" : "bg-teal-50"
            }`}>
              {activeTab === "system"
                ? <ShieldAlert className="w-5 h-5 text-rose-600" />
                : activeTab === "finance"
                ? <Banknote className="w-5 h-5 text-indigo-600" />
                : <BookOpen className="w-5 h-5 text-teal-600" />
              }
            </div>
            <h1 className="text-3xl font-bold text-slate-900">Sistem Kontrolleri</h1>
          </div>
          <p className="text-slate-500 mt-2 ml-[52px]">
            {activeTab === "system"
              ? "Platformdaki hizmetleri geçici olarak durdurabilir ve yeniden etkinleştirebilirsiniz."
              : activeTab === "finance"
              ? "Minimum paket fiyatı ve platform komisyon oranını buradan yönetebilirsiniz."
              : "Test, paket ve canlı oturum için içerik limitlerini buradan yönetebilirsiniz."}
          </p>
        </div>

        {/* Global status badge — yalnızca sistem sekmesinde */}
        {activeTab === "system" && !isLoading && (
          <div
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold ${
              allEnabled
                ? "bg-emerald-100 text-emerald-700"
                : "bg-rose-100 text-rose-700"
            }`}
          >
            {allEnabled ? (
              <CheckCircle2 className="w-4 h-4" />
            ) : (
              <AlertTriangle className="w-4 h-4" />
            )}
            {allEnabled
              ? "Tüm hizmetler aktif"
              : `${disabledCount} hizmet durduruldu`}
          </div>
        )}
      </div>

      {/* Sekme bar'ı — standart underline tab stili (tabs.jsx ile aynı).
          mb yok: parent `space-y-6` dikey aralığı zaten veriyor. */}
      <div className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-gray-800">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-2 px-4 py-2.5 min-h-10 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === tab.id
                  ? "border-indigo-600 text-indigo-600 dark:text-indigo-400"
                  : "border-transparent text-slate-600 hover:text-slate-900 dark:text-gray-400 dark:hover:text-gray-100"
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ── Sistem Kontrolleri sekmesi ─────────────────────────────── */}
      {activeTab === "system" && (
        <>
          {/* Warning banner when anything is off */}
          {!isLoading && !allEnabled && (
            <div className="flex items-start gap-3 p-4 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-800">
              <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5 text-rose-500" />
              <div>
                <strong>Aktif durdurma var.</strong> Aşağıdaki hizmetler şu anda kullanıcılara kapalıdır.
                Hizmeti yeniden açmak için ilgili kartın anahtarını açık konuma getirin.
              </div>
            </div>
          )}

          {/* Kill-switch kartları */}
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
            </div>
          ) : (
            <div className="grid gap-4">
              {CONTROLS.map((control) => (
                <KillSwitch
                  key={control.key}
                  control={control}
                  value={settings?.[control.key] !== false}
                  onChange={(newVal) => handleToggle(control.key, newVal)}
                  saving={savingKey === control.key}
                />
              ))}
            </div>
          )}

          {/* Info box */}
          <div className="flex items-start gap-3 p-5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-600">
            <Info className="w-5 h-5 flex-shrink-0 mt-0.5 text-slate-400" />
            <div className="space-y-1">
              <p><strong>Nasıl çalışır?</strong></p>
              <ul className="list-disc list-inside space-y-1 text-slate-500">
                <li>Bir hizmeti durdurmak anlık olarak devreye girer — bekleyen işlemleri kesmez.</li>
                <li>Devam eden test oturumları, aktif satın almalar etkilenmez.</li>
                <li>Kullanıcılar engellenen bir eylemi yapmaya çalışırken ilgili uyarı mesajını görür.</li>
                <li>Yeniden açmak için anahtarı kapatıp açmanız yeterlidir; veri değişmez.</li>
              </ul>
            </div>
          </div>
        </>
      )}

      {/* ── Test Kontrolleri sekmesi ──────────────────────────────── */}
      {activeTab === "tests" && (
        <>
          {/* Bilgi kutusu */}
          <div className="flex items-start gap-3 p-4 bg-teal-50 border border-teal-200 rounded-xl text-sm text-teal-800">
            <Info className="w-5 h-5 flex-shrink-0 mt-0.5 text-teal-500" />
            <div>
              <strong>Bu limitler anlık olarak devreye girer.</strong> Eğitici soru eklerken veya canlı oturum oluştururken
              girilen değer aşılırsa işlem reddedilir. Mevcut içerikler etkilenmez.
            </div>
          </div>

          {/* Test başına soru limitleri */}
          <div className="p-5 bg-white border border-slate-200 rounded-xl space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-teal-50 flex items-center justify-center flex-shrink-0">
                <Hash className="w-5 h-5 text-teal-600" />
              </div>
              <div>
                <p className="font-semibold text-slate-900">Test Başına Soru Sayısı</p>
                <p className="text-sm text-slate-500">
                  Bir teste eklenebilecek minimum ve maksimum soru sayısını belirler.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Minimum */}
              <div className="p-4 bg-slate-50 rounded-lg space-y-3">
                <div>
                  <p className="text-sm font-medium text-slate-700">Minimum Soru Sayısı</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Mevcut: <strong className="text-slate-600">{settings?.minQuestionsPerTest ?? 1} soru</strong>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    placeholder={`${settings?.minQuestionsPerTest ?? 1}`}
                    value={tcInputs.minQuestionsPerTest}
                    onChange={(e) => setTcInputs((p) => ({ ...p, minQuestionsPerTest: e.target.value }))}
                    className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                  <button
                    onClick={() => handleTcSave("minQuestionsPerTest", 1)}
                    disabled={!tcInputs.minQuestionsPerTest || savingTc === "minQuestionsPerTest"}
                    className="px-3 py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-1.5"
                  >
                    {savingTc === "minQuestionsPerTest" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                    Kaydet
                  </button>
                </div>
              </div>

              {/* Maksimum */}
              <div className="p-4 bg-slate-50 rounded-lg space-y-3">
                <div>
                  <p className="text-sm font-medium text-slate-700">Maksimum Soru Sayısı</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Mevcut: <strong className="text-slate-600">{settings?.maxQuestionsPerTest ?? 100} soru</strong>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    placeholder={`${settings?.maxQuestionsPerTest ?? 100}`}
                    value={tcInputs.maxQuestionsPerTest}
                    onChange={(e) => setTcInputs((p) => ({ ...p, maxQuestionsPerTest: e.target.value }))}
                    className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                  <button
                    onClick={() => handleTcSave("maxQuestionsPerTest", 1)}
                    disabled={!tcInputs.maxQuestionsPerTest || savingTc === "maxQuestionsPerTest"}
                    className="px-3 py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-1.5"
                  >
                    {savingTc === "maxQuestionsPerTest" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                    Kaydet
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Paket başına test limiti */}
          <div className="p-5 bg-white border border-slate-200 rounded-xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-violet-50 flex items-center justify-center flex-shrink-0">
                <Package className="w-5 h-5 text-violet-600" />
              </div>
              <div>
                <p className="font-semibold text-slate-900">Paket Başına Maksimum Test Sayısı</p>
                <p className="text-sm text-slate-500">
                  Bir test paketine eklenebilecek maksimum test sayısını belirler.
                  Mevcut: <strong className="text-slate-700">{settings?.maxTestsPerPackage ?? 10} test</strong>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min="1"
                placeholder={`${settings?.maxTestsPerPackage ?? 10}`}
                value={tcInputs.maxTestsPerPackage}
                onChange={(e) => setTcInputs((p) => ({ ...p, maxTestsPerPackage: e.target.value }))}
                className="flex-1 max-w-xs px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
              <button
                onClick={() => handleTcSave("maxTestsPerPackage", 1)}
                disabled={!tcInputs.maxTestsPerPackage || savingTc === "maxTestsPerPackage"}
                className="px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
              >
                {savingTc === "maxTestsPerPackage" ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Kaydet
              </button>
            </div>
          </div>

          {/* Canlı oturum soru limiti */}
          <div className="p-5 bg-white border border-slate-200 rounded-xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center flex-shrink-0">
                <Zap className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="font-semibold text-slate-900">Canlı Test Başına Maksimum Soru Sayısı</p>
                <p className="text-sm text-slate-500">
                  Bir canlı oturumda oluşturulabilecek maksimum soru sayısını belirler.
                  Mevcut: <strong className="text-slate-700">{settings?.maxLiveQuestions ?? 50} soru</strong>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min="1"
                placeholder={`${settings?.maxLiveQuestions ?? 50}`}
                value={tcInputs.maxLiveQuestions}
                onChange={(e) => setTcInputs((p) => ({ ...p, maxLiveQuestions: e.target.value }))}
                className="flex-1 max-w-xs px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              <button
                onClick={() => handleTcSave("maxLiveQuestions", 1)}
                disabled={!tcInputs.maxLiveQuestions || savingTc === "maxLiveQuestions"}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
              >
                {savingTc === "maxLiveQuestions" ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Kaydet
              </button>
            </div>
          </div>

          {/* Tünel limitleri */}
          <div className="p-5 bg-white border border-slate-200 rounded-xl space-y-4">
            <div>
              <p className="font-semibold text-slate-900">Tünel Limitleri</p>
              <p className="text-sm text-slate-500">
                Katman sayısı/seçenek/streak yeni oluşturulan tünellere snapshot olarak uygulanır;
                soru sayısı limitleri onaya gönderirken kontrol edilir.
              </p>
            </div>
            {[
              { key: "maxLayersPerTunnel", label: "Katman sayısı", def: 7, min: 1 },
              { key: "minQuestionsPerLayer", label: "Katman başına min. soru", def: 10, min: 1 },
              { key: "maxQuestionsPerLayer", label: "Katman başına maks. soru", def: 50, min: 1 },
              { key: "tunnelAdvanceStreak", label: "Üst katmanı açma (üst üste doğru)", def: 10, min: 1 },
              { key: "tunnelOptionsPerQuestion", label: "Soru başına seçenek", def: 10, min: 2 },
            ].map((f) => (
              <div key={f.key} className="flex flex-wrap items-center gap-3">
                <div className="min-w-[220px] flex-1">
                  <p className="text-sm font-medium text-slate-700">{f.label}</p>
                  <p className="text-xs text-slate-400">Mevcut: <strong className="text-slate-600">{settings?.[f.key] ?? f.def}</strong></p>
                </div>
                <input
                  type="number"
                  min={f.min}
                  placeholder={`${settings?.[f.key] ?? f.def}`}
                  value={tcInputs[f.key]}
                  onChange={(e) => setTcInputs((p) => ({ ...p, [f.key]: e.target.value }))}
                  className="w-28 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button
                  onClick={() => handleTcSave(f.key, f.min)}
                  disabled={!tcInputs[f.key] || savingTc === f.key}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
                >
                  {savingTc === f.key ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Kaydet
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Entegrasyonlar sekmesi ─────────────────────────────────── */}
      {activeTab === "integrations" && (
        <>
          <div className="p-5 bg-white border border-slate-200 rounded-xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-sky-50 flex items-center justify-center flex-shrink-0">
                <Globe className="w-5 h-5 text-sky-600" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-slate-900">Google ile Giriş — OAuth Client ID</p>
                <p className="text-sm text-slate-500 mt-0.5">
                  Google Cloud Console → APIs & Services → Credentials'tan oluşturduğunuz OAuth 2.0
                  <strong className="text-slate-700 mx-1">Client ID</strong>'sini girin.
                  Authorized JavaScript origins listesine kendi alan adınızı + <code className="text-xs bg-slate-100 px-1 rounded">http://localhost:5174</code> eklemeyi unutmayın.
                </p>
                <p className="text-sm mt-2">
                  Mevcut değer:{" "}
                  {settings?.googleClientId ? (
                    <span className="font-mono text-xs text-slate-700">
                      {showGoogleClientId
                        ? settings.googleClientId
                        : settings.googleClientId.replace(/^(.{12}).+(.{16})$/, "$1…$2")}
                    </span>
                  ) : (
                    <span className="text-rose-600 font-medium">Tanımlanmamış (Google ile giriş kapalı)</span>
                  )}
                  {settings?.googleClientId && (
                    <button
                      type="button"
                      onClick={() => setShowGoogleClientId((v) => !v)}
                      className="ml-2 text-xs text-sky-600 hover:underline inline-flex items-center gap-1"
                    >
                      {showGoogleClientId ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                      {showGoogleClientId ? "Gizle" : "Tamamını göster"}
                    </button>
                  )}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="text"
                placeholder="örn. 123456789-abc.apps.googleusercontent.com"
                value={googleClientIdInput}
                onChange={(e) => setGoogleClientIdInput(e.target.value)}
                className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
              <button
                onClick={() => handleGoogleClientIdSave(false)}
                disabled={!googleClientIdInput || savingKey === "googleClientId"}
                className="px-4 py-2 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
              >
                {savingKey === "googleClientId"
                  ? <><Loader2 className="w-4 h-4 animate-spin" />Kaydediliyor...</>
                  : "Kaydet"}
              </button>
              {settings?.googleClientId && (
                <button
                  onClick={() => {
                    if (confirm("Google Client ID'yi temizlemek istiyor musunuz? Google ile giriş devre dışı kalır."))
                      handleGoogleClientIdSave(true);
                  }}
                  disabled={savingKey === "googleClientId"}
                  className="px-3 py-2 border border-rose-200 text-rose-600 hover:bg-rose-50 text-sm font-medium rounded-lg transition-colors"
                >
                  Temizle
                </button>
              )}
            </div>
            <p className="text-xs text-slate-500">
              Client ID gizli bir bilgi değildir — tarayıcıya gönderilir. Asıl gizli olan
              Client Secret'tır ve burada saklanmaz.
            </p>
          </div>

          {/* ── Cloudflare Turnstile (CAPTCHA) ─────────────────────────── */}
          <div className="p-5 bg-white border border-slate-200 rounded-xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center flex-shrink-0">
                <ShieldCheck className="w-5 h-5 text-amber-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-slate-900">Cloudflare Turnstile (CAPTCHA)</h3>
                <p className="text-sm text-slate-600 mt-1">
                  Login + kayıt formlarında bot doğrulaması. Anahtarlar boşken sistem normal
                  çalışır (CAPTCHA atlanır). Cloudflare hesabınızdan
                  <a href="https://dash.cloudflare.com/?to=/:account/turnstile" target="_blank" rel="noreferrer" className="text-sky-600 hover:underline mx-1">Turnstile dashboard</a>
                  → "Add Site" ile site key + secret key alın.
                </p>
                <p className="text-sm mt-2">
                  Site key: {" "}
                  {settings?.turnstileSiteKey ? (
                    <span className="font-mono text-xs text-slate-700">
                      {settings.turnstileSiteKey.replace(/^(.{8}).+(.{6})$/, "$1…$2")}
                    </span>
                  ) : (
                    <span className="text-slate-500 font-medium">Tanımlanmamış</span>
                  )}
                </p>
                <p className="text-sm">
                  Secret key: {" "}
                  {settings?.turnstileSecretKey ? (
                    <>
                      <span className="font-mono text-xs text-slate-700">
                        {showTurnstileSecret
                          ? settings.turnstileSecretKey
                          : settings.turnstileSecretKey.replace(/^(.{4}).+(.{4})$/, "$1•••$2")}
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowTurnstileSecret((v) => !v)}
                        className="ml-2 text-xs text-sky-600 hover:underline inline-flex items-center gap-1"
                      >
                        {showTurnstileSecret ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                        {showTurnstileSecret ? "Gizle" : "Göster"}
                      </button>
                    </>
                  ) : (
                    <span className="text-slate-500 font-medium">Tanımlanmamış</span>
                  )}
                </p>
                {!settings?.turnstileSiteKey && !settings?.turnstileSecretKey && (
                  <p className="text-xs text-amber-700 mt-2 bg-amber-50 border border-amber-200 px-2 py-1 rounded">
                    CAPTCHA şu an devre dışı. Login + kayıt normal akışta çalışır.
                  </p>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Site Key (public — tarayıcıya gönderilir)</label>
                <input
                  type="text"
                  placeholder="0x4AAAAAAA..."
                  value={turnstileSiteKeyInput}
                  onChange={(e) => setTurnstileSiteKeyInput(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Secret Key (backend-only)</label>
                <input
                  type="password"
                  placeholder="0x4AAAAAAA..."
                  value={turnstileSecretKeyInput}
                  onChange={(e) => setTurnstileSecretKeyInput(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>
              <div className="flex items-center gap-3 pt-1">
                <button
                  onClick={() => handleTurnstileSave(false)}
                  disabled={(!turnstileSiteKeyInput && !turnstileSecretKeyInput) || savingKey === "turnstile"}
                  className="px-4 py-2 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
                >
                  {savingKey === "turnstile"
                    ? <><Loader2 className="w-4 h-4 animate-spin" />Kaydediliyor...</>
                    : "Kaydet"}
                </button>
                {(settings?.turnstileSiteKey || settings?.turnstileSecretKey) && (
                  <button
                    onClick={() => {
                      if (confirm("Turnstile anahtarlarını temizlemek istiyor musunuz? CAPTCHA devre dışı kalır."))
                        handleTurnstileSave(true);
                    }}
                    disabled={savingKey === "turnstile"}
                    className="px-3 py-2 border border-rose-200 text-rose-600 hover:bg-rose-50 text-sm font-medium rounded-lg transition-colors"
                  >
                    Temizle
                  </button>
                )}
              </div>
            </div>
            <p className="text-xs text-slate-500">
              Secret key tarayıcıya gönderilmez. Boş bırakılırsa CAPTCHA doğrulaması atlanır
              ve sistem normal akışta devam eder (kayıt + login bloklanmaz).
            </p>
          </div>

          {/* ── Ödeme Sağlayıcıları bölümü ayırıcı ─────────────────────── */}
          <div className="flex items-center gap-3 pt-2">
            <div className="h-px flex-1 bg-slate-200" />
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Ödeme Sağlayıcıları
            </span>
            <div className="h-px flex-1 bg-slate-200" />
          </div>

          {/* Çalışma Modu kartı */}
          <div className="p-5 bg-white border border-slate-200 rounded-xl space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-slate-50 flex items-center justify-center">
                <Settings className="w-5 h-5 text-slate-500" />
              </div>
              <div>
                <p className="font-semibold text-slate-900">Çalışma Modu</p>
                <p className="text-sm text-slate-500">
                  Test modunda gerçek ödeme alınmaz. Mevcut:{" "}
                  <strong
                    className={
                      paymentSettings?.mode === "live"
                        ? "text-emerald-600"
                        : "text-amber-600"
                    }
                  >
                    {paymentSettings?.mode === "live"
                      ? "Canlı (Live)"
                      : "Test"}
                  </strong>
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              {["test", "live"].map((m) => (
                <button
                  key={m}
                  onClick={() => savePaymentField({ mode: m })}
                  disabled={
                    savingPayment === "mode" ||
                    paymentSettings?.mode === m
                  }
                  className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    paymentSettings?.mode === m
                      ? m === "live"
                        ? "bg-emerald-600 text-white border-emerald-600"
                        : "bg-amber-500 text-white border-amber-500"
                      : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                  } disabled:opacity-60`}
                >
                  {m === "live" ? "🟢 Canlı (Live)" : "🟡 Test"}
                </button>
              ))}
            </div>
          </div>

          {/* iyzico kartı */}
          <div className="p-5 bg-white border border-slate-200 rounded-xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-orange-50 flex items-center justify-center">
                  <CreditCard className="w-5 h-5 text-orange-500" />
                </div>
                <div>
                  <p className="font-semibold text-slate-900">iyzico</p>
                  <p className="text-sm text-slate-500">
                    Türkiye'nin ödeme altyapısı
                  </p>
                </div>
              </div>
              {/* Aktif/Pasif toggle */}
              <button
                onClick={() =>
                  savePaymentField({
                    iyzicoEnabled: !paymentSettings?.iyzicoEnabled,
                  })
                }
                disabled={savingPayment === "iyzicoEnabled"}
                className={`relative inline-flex h-6 w-11 rounded-full border-2 border-transparent transition-colors ${
                  paymentSettings?.iyzicoEnabled
                    ? "bg-orange-500"
                    : "bg-slate-200"
                } disabled:opacity-60`}
              >
                <span
                  className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                    paymentSettings?.iyzicoEnabled
                      ? "translate-x-5"
                      : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* API Key */}
              <PaymentField
                label="API Key"
                fieldKey="iyzicoApiKey"
                value={paymentSettings?.iyzicoApiKey}
                isSecret
                showSecret={showSecrets.iyzicoApiKey}
                onToggleSecret={() =>
                  setShowSecrets((p) => ({
                    ...p,
                    iyzicoApiKey: !p.iyzicoApiKey,
                  }))
                }
                inputValue={paymentInputs.iyzicoApiKey ?? ""}
                onChange={(v) =>
                  setPaymentInputs((p) => ({
                    ...p,
                    iyzicoApiKey: v,
                  }))
                }
                onSave={() =>
                  savePaymentField({
                    iyzicoApiKey: paymentInputs.iyzicoApiKey,
                  })
                }
                saving={savingPayment === "iyzicoApiKey"}
              />
              {/* Secret Key */}
              <PaymentField
                label="Secret Key"
                fieldKey="iyzicoSecretKey"
                value={paymentSettings?.iyzicoSecretKey}
                isSecret
                showSecret={showSecrets.iyzicoSecretKey}
                onToggleSecret={() =>
                  setShowSecrets((p) => ({
                    ...p,
                    iyzicoSecretKey: !p.iyzicoSecretKey,
                  }))
                }
                inputValue={paymentInputs.iyzicoSecretKey ?? ""}
                onChange={(v) =>
                  setPaymentInputs((p) => ({
                    ...p,
                    iyzicoSecretKey: v,
                  }))
                }
                onSave={() =>
                  savePaymentField({
                    iyzicoSecretKey: paymentInputs.iyzicoSecretKey,
                  })
                }
                saving={savingPayment === "iyzicoSecretKey"}
              />
              {/* Base URL */}
              <PaymentField
                label="Base URL"
                fieldKey="iyzicoBaseUrl"
                value={paymentSettings?.iyzicoBaseUrl}
                inputValue={paymentInputs.iyzicoBaseUrl ?? ""}
                onChange={(v) =>
                  setPaymentInputs((p) => ({
                    ...p,
                    iyzicoBaseUrl: v,
                  }))
                }
                onSave={() =>
                  savePaymentField({
                    iyzicoBaseUrl: paymentInputs.iyzicoBaseUrl,
                  })
                }
                saving={savingPayment === "iyzicoBaseUrl"}
                className="sm:col-span-2"
              />
            </div>
          </div>

          {/* Google Pay kartı */}
          <div className="p-5 bg-white border border-slate-200 rounded-xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center">
                  <Smartphone className="w-5 h-5 text-blue-500" />
                </div>
                <div>
                  <p className="font-semibold text-slate-900">Google Pay</p>
                  <p className="text-sm text-slate-500">
                    Google ödeme entegrasyonu
                  </p>
                </div>
              </div>
              <button
                onClick={() =>
                  savePaymentField({
                    googlePayEnabled: !paymentSettings?.googlePayEnabled,
                  })
                }
                disabled={savingPayment === "googlePayEnabled"}
                className={`relative inline-flex h-6 w-11 rounded-full border-2 border-transparent transition-colors ${
                  paymentSettings?.googlePayEnabled
                    ? "bg-blue-500"
                    : "bg-slate-200"
                } disabled:opacity-60`}
              >
                <span
                  className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                    paymentSettings?.googlePayEnabled
                      ? "translate-x-5"
                      : "translate-x-0"
                  }`}
                />
              </button>
            </div>
            <PaymentField
              label="Merchant ID"
              fieldKey="googlePayMerchantId"
              value={paymentSettings?.googlePayMerchantId}
              inputValue={paymentInputs.googlePayMerchantId ?? ""}
              onChange={(v) =>
                setPaymentInputs((p) => ({
                  ...p,
                  googlePayMerchantId: v,
                }))
              }
              onSave={() =>
                savePaymentField({
                  googlePayMerchantId: paymentInputs.googlePayMerchantId,
                })
              }
              saving={savingPayment === "googlePayMerchantId"}
            />
          </div>

          {/* Amazon Pay kartı */}
          <div className="p-5 bg-white border border-slate-200 rounded-xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center">
                  <ShoppingBag className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <p className="font-semibold text-slate-900">Amazon Pay</p>
                  <p className="text-sm text-slate-500">
                    Amazon ödeme entegrasyonu
                  </p>
                </div>
              </div>
              <button
                onClick={() =>
                  savePaymentField({
                    amazonPayEnabled: !paymentSettings?.amazonPayEnabled,
                  })
                }
                disabled={savingPayment === "amazonPayEnabled"}
                className={`relative inline-flex h-6 w-11 rounded-full border-2 border-transparent transition-colors ${
                  paymentSettings?.amazonPayEnabled
                    ? "bg-amber-500"
                    : "bg-slate-200"
                } disabled:opacity-60`}
              >
                <span
                  className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                    paymentSettings?.amazonPayEnabled
                      ? "translate-x-5"
                      : "translate-x-0"
                  }`}
                />
              </button>
            </div>
            <PaymentField
              label="Merchant ID"
              fieldKey="amazonPayMerchantId"
              value={paymentSettings?.amazonPayMerchantId}
              inputValue={paymentInputs.amazonPayMerchantId ?? ""}
              onChange={(v) =>
                setPaymentInputs((p) => ({
                  ...p,
                  amazonPayMerchantId: v,
                }))
              }
              onSave={() =>
                savePaymentField({
                  amazonPayMerchantId: paymentInputs.amazonPayMerchantId,
                })
              }
              saving={savingPayment === "amazonPayMerchantId"}
            />
          </div>
        </>
      )}

      {/* ── Mali Kontrol sekmesi ───────────────────────────────────── */}
      {activeTab === "finance" && (
        <>
          {/* Minimum Paket Fiyatı */}
          <div className="p-5 bg-white border border-slate-200 rounded-xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
                <BadgeDollarSign className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <p className="font-semibold text-slate-900">Minimum Paket Fiyatı</p>
                <p className="text-sm text-slate-500">
                  Eğiticilerin paket oluştururken girebileceği en düşük fiyat.
                  Mevcut değer:{" "}
                  <strong className="text-slate-700">
                    {settings?.minPackagePriceCents != null
                      ? `${(settings.minPackagePriceCents / 100).toFixed(2)} ₺`
                      : "1,00 ₺"}
                  </strong>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative flex-1 max-w-xs">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">₺</span>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder={
                    settings?.minPackagePriceCents != null
                      ? (settings.minPackagePriceCents / 100).toFixed(2)
                      : "1.00"
                  }
                  value={minPriceInput}
                  onChange={(e) => setMinPriceInput(e.target.value)}
                  className="w-full pl-7 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <button
                onClick={handleMinPriceSave}
                disabled={!minPriceInput || savingKey === "minPackagePriceCents"}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
              >
                {savingKey === "minPackagePriceCents"
                  ? <><Loader2 className="w-4 h-4 animate-spin" />Kaydediliyor...</>
                  : "Kaydet"}
              </button>
            </div>
          </div>

          {/* Minimum Tünel Fiyatı */}
          <div className="p-5 bg-white border border-slate-200 rounded-xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center flex-shrink-0">
                <BadgeDollarSign className="w-5 h-5 text-indigo-600" />
              </div>
              <div>
                <p className="font-semibold text-slate-900">Minimum Tünel Fiyatı</p>
                <p className="text-sm text-slate-500">
                  Eğiticilerin tünel oluştururken girebileceği en düşük fiyat (0 = ücretsiz serbest).
                  Mevcut değer:{" "}
                  <strong className="text-slate-700">
                    {settings?.minTunnelPriceCents != null
                      ? `${(settings.minTunnelPriceCents / 100).toFixed(2)} ₺`
                      : "0,00 ₺"}
                  </strong>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative flex-1 max-w-xs">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">₺</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder={
                    settings?.minTunnelPriceCents != null
                      ? (settings.minTunnelPriceCents / 100).toFixed(2)
                      : "0.00"
                  }
                  value={minTunnelPriceInput}
                  onChange={(e) => setMinTunnelPriceInput(e.target.value)}
                  className="w-full pl-7 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <button
                onClick={handleMinTunnelPriceSave}
                disabled={minTunnelPriceInput === "" || savingKey === "minTunnelPriceCents"}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
              >
                {savingKey === "minTunnelPriceCents"
                  ? <><Loader2 className="w-4 h-4 animate-spin" />Kaydediliyor...</>
                  : "Kaydet"}
              </button>
            </div>
          </div>

          {/* İndirim Sınırı — eğiticinin tanımlayabileceği maksimum indirim oranı */}
          <div className="p-5 bg-white border border-slate-200 rounded-xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center flex-shrink-0">
                <Percent className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="font-semibold text-slate-900">İndirim Sınırı</p>
                <p className="text-sm text-slate-500">
                  Eğiticilerin indirim kodu oluştururken belirleyebileceği maksimum oran.
                  Admin tarafından oluşturulan kodlar bu sınırla kısıtlı değildir.
                  Mevcut değer:{" "}
                  <strong className="text-slate-700">
                    %{settings?.maxDiscountPercent ?? 50}
                  </strong>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative flex-1 max-w-xs">
                <input
                  type="number"
                  min="1"
                  max="100"
                  step="1"
                  placeholder={String(settings?.maxDiscountPercent ?? 50)}
                  value={maxDiscountInput}
                  onChange={(e) => setMaxDiscountInput(e.target.value)}
                  className="w-full pl-3 pr-8 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">%</span>
              </div>
              <button
                onClick={handleMaxDiscountSave}
                disabled={!maxDiscountInput || savingKey === "maxDiscountPercent"}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
              >
                {savingKey === "maxDiscountPercent"
                  ? <><Loader2 className="w-4 h-4 animate-spin" />Kaydediliyor...</>
                  : "Kaydet"}
              </button>
            </div>
          </div>

          {/* Komisyon Oranı */}
          <div className="p-5 bg-white border border-slate-200 rounded-xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-sky-50 flex items-center justify-center flex-shrink-0">
                <Percent className="w-5 h-5 text-sky-600" />
              </div>
              <div>
                <p className="font-semibold text-slate-900">Komisyon Oranı</p>
                <p className="text-sm text-slate-500">
                  Satışlardan alınan platform komisyonu. Değiştirirseniz, önceki oran tarih bazlı saklanır.
                  {rateHistory.length > 0 && (
                    <span className="ml-1 font-medium text-slate-700">
                      Mevcut: %{rateHistory[0]?.commissionPercent}
                    </span>
                  )}
                </p>
              </div>
            </div>

            {/* Yeni oran formu */}
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Yeni Oran (%)</label>
                <div className="relative w-28">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    placeholder="örn. 20"
                    value={newRate}
                    onChange={(e) => setNewRate(e.target.value)}
                    className="w-full pr-7 pl-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 text-sm">%</span>
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Geçerlilik Tarihi (isteğe bağlı)</label>
                <input
                  type="date"
                  value={newEffectiveFrom}
                  onChange={(e) => setNewEffectiveFrom(e.target.value)}
                  className="py-2 px-3 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>
              <div className="flex-1 min-w-40">
                <label className="block text-xs text-slate-500 mb-1">Not (isteğe bağlı)</label>
                <input
                  type="text"
                  placeholder="Değişiklik nedeni..."
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  className="w-full py-2 px-3 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>
              <button
                onClick={handleRateSave}
                disabled={!newRate || savingRate}
                className="flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {savingRate ? (
                  <><Loader2 className="w-4 h-4 animate-spin" />Kaydediliyor...</>
                ) : (
                  <><Plus className="w-4 h-4" />Kaydet</>
                )}
              </button>
            </div>

            {/* Geçmiş oran listesi */}
            {ratesLoading ? (
              <div className="flex items-center gap-2 text-sm text-slate-400 py-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Yükleniyor...</span>
              </div>
            ) : rateHistory.length === 0 ? (
              <p className="text-sm text-slate-400 italic">Henüz komisyon oranı kaydı yok.</p>
            ) : (
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs font-medium text-slate-500 mb-2">
                  <History className="w-3.5 h-3.5" />
                  <span>Oran Geçmişi</span>
                </div>
                {rateHistory.map((entry, idx) => (
                  <div
                    key={entry.id}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
                      idx === 0
                        ? "bg-sky-50 border border-sky-200 text-sky-800 font-medium"
                        : "bg-slate-50 text-slate-600"
                    }`}
                  >
                    <span className="min-w-0 flex-1">
                      {formatDate(entry.effectiveFrom)}
                      <span className="mx-1.5 text-slate-400">
                        <ArrowRight className="inline w-3 h-3" />
                      </span>
                      {entry.effectiveTo ? formatDate(entry.effectiveTo) : (
                        <span className="text-sky-600 font-semibold">bugün</span>
                      )}
                    </span>
                    <span className={`font-bold ${idx === 0 ? "text-sky-700" : "text-slate-700"}`}>
                      %{entry.commissionPercent}
                    </span>
                    {entry.note && (
                      <span className="text-xs text-slate-400 italic truncate max-w-48">— {entry.note}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Firma bilgileri bölüm ayırıcı ─────────────────────────── */}
          <div className="flex items-center gap-3 pt-2">
            <div className="h-px flex-1 bg-slate-200" />
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Firma Bilgileri
            </span>
            <div className="h-px flex-1 bg-slate-200" />
          </div>

          {/* Firma bilgileri kartı */}
          <div className="p-5 bg-white border border-slate-200 rounded-xl space-y-3">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-9 h-9 rounded-lg bg-slate-50 flex items-center justify-center">
                <Building2 className="w-5 h-5 text-slate-500" />
              </div>
              <p className="font-semibold text-slate-900">
                Ödeme Makbuzunda Görünen Firma Bilgileri
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <PaymentField
                label="Firma Adı"
                fieldKey="companyName"
                value={paymentSettings?.companyName}
                inputValue={paymentInputs.companyName ?? ""}
                onChange={(v) =>
                  setPaymentInputs((p) => ({
                    ...p,
                    companyName: v,
                  }))
                }
                onSave={() =>
                  savePaymentField({
                    companyName: paymentInputs.companyName,
                  })
                }
                saving={savingPayment === "companyName"}
              />
              <PaymentField
                label="Vergi No"
                fieldKey="companyTaxId"
                value={paymentSettings?.companyTaxId}
                inputValue={paymentInputs.companyTaxId ?? ""}
                onChange={(v) =>
                  setPaymentInputs((p) => ({
                    ...p,
                    companyTaxId: v,
                  }))
                }
                onSave={() =>
                  savePaymentField({
                    companyTaxId: paymentInputs.companyTaxId,
                  })
                }
                saving={savingPayment === "companyTaxId"}
              />
              <PaymentField
                label="Adres"
                fieldKey="companyAddress"
                value={paymentSettings?.companyAddress}
                inputValue={paymentInputs.companyAddress ?? ""}
                onChange={(v) =>
                  setPaymentInputs((p) => ({
                    ...p,
                    companyAddress: v,
                  }))
                }
                onSave={() =>
                  savePaymentField({
                    companyAddress: paymentInputs.companyAddress,
                  })
                }
                saving={savingPayment === "companyAddress"}
                className="sm:col-span-2"
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
