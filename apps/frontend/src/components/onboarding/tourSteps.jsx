/**
 * tourSteps.jsx — Tüm onboarding turlarının adım tanımları
 *
 * Her adım: { title, description, illustration: ReactNode }
 *
 * Görseller, gerçek ekranı temsil eden küçük stilize mockup bileşenleri.
 */

/* ─── Ortak mockup elementleri ─── */
const MockBar = ({ className }) => (
  <div className={`h-2 rounded-full bg-current opacity-30 ${className}`} />
);

const MockCard = ({ children, className }) => (
  <div className={`bg-white rounded-xl shadow border border-slate-100 p-3 ${className}`}>
    {children}
  </div>
);

const MockBadge = ({ label, color = "indigo" }) => {
  const colors = {
    indigo: "bg-indigo-100 text-indigo-700",
    emerald: "bg-emerald-100 text-emerald-700",
    amber: "bg-amber-100 text-amber-700",
    violet: "bg-violet-100 text-violet-700",
    rose: "bg-rose-100 text-rose-700",
  };
  return (
    <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${colors[color]}`}>
      {label}
    </span>
  );
};

/* ═══════════════════════════════════════════════
   ADAY — Karşılama Turu  (ob_cand_welcome)
   6 adım
═══════════════════════════════════════════════ */

const IllustrationExplore = () => (
  <div className="w-full max-w-xs space-y-2">
    {/* Arama çubuğu */}
    <div className="bg-white rounded-lg border border-slate-200 px-3 py-2 flex items-center gap-2 shadow-sm">
      <div className="w-3 h-3 rounded-full border-2 border-slate-300" />
      <div className="flex-1 h-2 bg-slate-100 rounded-full" />
    </div>
    {/* Kart grid */}
    <div className="grid grid-cols-2 gap-2">
      {[
        { color: "bg-indigo-400", label: "YKS" },
        { color: "bg-violet-400", label: "KPSS" },
        { color: "bg-emerald-400", label: "DGS" },
        { color: "bg-amber-400", label: "ALES" },
      ].map((t) => (
        <MockCard key={t.label} className="flex flex-col items-start gap-1 !p-2">
          <div className={`w-6 h-6 rounded-lg ${t.color} opacity-80`} />
          <span className="text-[10px] font-semibold text-slate-700">{t.label}</span>
          <MockBar className="w-full text-slate-400" />
        </MockCard>
      ))}
    </div>
  </div>
);

const IllustrationPackages = () => (
  <div className="w-full max-w-xs space-y-2">
    {[
      { title: "YKS Matematik", price: "₺299", rating: "4.9" },
      { title: "KPSS Tarih", price: "₺199", rating: "4.7" },
    ].map((p) => (
      <MockCard key={p.title} className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center flex-shrink-0">
          <div className="w-4 h-4 rounded bg-indigo-400" />
        </div>
        <div className="flex-1 min-w-0 space-y-1">
          <div className="text-[10px] font-semibold text-slate-800">{p.title}</div>
          <div className="flex items-center gap-1">
            <span className="text-[9px] text-amber-500">★ {p.rating}</span>
            <MockBadge label={p.price} color="indigo" />
          </div>
        </div>
        <button className="text-[9px] bg-indigo-600 text-white px-2 py-1 rounded-lg font-semibold">
          Al
        </button>
      </MockCard>
    ))}
  </div>
);

const IllustrationEducators = () => (
  <div className="w-full max-w-xs space-y-2">
    {[
      { name: "Ahmet Y.", subject: "Matematik", color: "bg-violet-400" },
      { name: "Zeynep K.", subject: "Tarih", color: "bg-emerald-400" },
    ].map((e) => (
      <MockCard key={e.name} className="flex items-center gap-3">
        <div className={`w-8 h-8 rounded-full ${e.color} flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0`}>
          {e.name[0]}
        </div>
        <div className="flex-1 space-y-1">
          <div className="text-[10px] font-semibold text-slate-800">{e.name}</div>
          <MockBadge label={e.subject} color="violet" />
        </div>
        <div className="text-[9px] text-slate-500">12 paket</div>
      </MockCard>
    ))}
  </div>
);

const IllustrationMyTests = () => (
  <div className="w-full max-w-xs space-y-2">
    <MockCard className="!p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold text-slate-800">Satın Alınan Testler</span>
        <MockBadge label="3 paket" color="emerald" />
      </div>
      {["YKS Mat.", "KPSS Geo.", "DGS Sözel"].map((t, i) => (
        <div key={t} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-indigo-400 flex-shrink-0" />
          <div className="flex-1 h-1.5 bg-slate-100 rounded-full">
            <div className="h-1.5 bg-indigo-400 rounded-full" style={{ width: `${[70, 40, 10][i]}%` }} />
          </div>
          <span className="text-[9px] text-slate-500">{[70, 40, 10][i]}%</span>
        </div>
      ))}
    </MockCard>
  </div>
);

// Sprint 11 #6 — Aday persona 5. adım: "Skor takibi" — kullanıcının ilerlemesini
// gösterir, aktivasyon (=ilk test çözümü) için motivasyon yaratır.
const IllustrationCandidateActivation = () => (
  <div className="w-full max-w-xs space-y-2">
    <MockCard className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold text-slate-800">Skor Takibi</span>
        <MockBadge label="🔥 5 gün" color="amber" />
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {[
          { label: "Çözülen", val: "12" },
          { label: "Doğru %", val: "87" },
          { label: "Rütbe", val: "#42" },
        ].map((s) => (
          <div key={s.label} className="text-center bg-indigo-50 rounded-lg p-1.5">
            <div className="text-sm font-bold text-indigo-700">{s.val}</div>
            <div className="text-[8px] text-slate-500">{s.label}</div>
          </div>
        ))}
      </div>
      <button className="w-full text-[10px] bg-indigo-600 text-white py-1.5 rounded-lg font-semibold">
        İlk Sınavını Çöz
      </button>
    </MockCard>
  </div>
);

// Aday persona 6. adım: "Not al" — soru çözerken "+ Not" widget'ı + Notlarım
// adresli koleksiyonu. Yeni özelliğin keşfedilmesini sağlar.
const IllustrationNotes = () => (
  <div className="w-full max-w-xs space-y-2">
    <MockCard className="space-y-2">
      <div className="flex items-center gap-1.5">
        <MockBadge label="Soru 2" color="indigo" />
        <MockBadge label="Matematik" color="violet" />
      </div>
      <div className="space-y-1">
        <MockBar className="w-full text-slate-500 h-2" />
        <MockBar className="w-2/3 text-slate-500 h-2" />
      </div>
    </MockCard>
    {/* Mavi 3B "+ Not" butonu (gerçek widget ile tutarlı) */}
    <div className="flex justify-end">
      <div className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-sky-400 via-blue-600 to-indigo-700 px-3 py-1.5 text-[10px] font-semibold text-white shadow-lg ring-1 ring-inset ring-white/30">
        <span>🗒️</span> + Not
      </div>
    </div>
  </div>
);

const IllustrationTunnel = () => (
  <div className="w-full max-w-xs space-y-2">
    {/* Katmanlar: kolay → zor */}
    {[
      { label: "Katman 1 · Kolay", color: "emerald", w: "w-full" },
      { label: "Katman 2 · Orta", color: "amber", w: "w-5/6" },
      { label: "Katman 3 · Zor", color: "rose", w: "w-2/3" },
    ].map((l) => (
      <MockCard key={l.label} className="flex items-center gap-2 !p-2">
        <MockBadge label={l.label} color={l.color} />
        <div className="flex-1">
          <MockBar className={`${l.w} text-slate-400`} />
        </div>
      </MockCard>
    ))}
    {/* 5 şık — doğru cevap hep içinde, yeri değişken (yeşil) */}
    <div className="flex justify-center gap-1.5 pt-1">
      {["A", "B", "C", "D", "E"].map((o, i) => (
        <div
          key={o}
          className={`w-6 h-6 rounded-md text-[9px] font-bold flex items-center justify-center ${
            i === 2 ? "bg-emerald-500 text-white shadow" : "bg-slate-100 text-slate-500"
          }`}
        >
          {o}
        </div>
      ))}
    </div>
  </div>
);

// NOT: title ve description i18n key'leridir; OnboardingTour.jsx t() ile çözer.
// Bu sayede tüm tur içerikleri 5 dilde (tr/en/es/zh/de) görüntülenir.
export const CANDIDATE_WELCOME_STEPS = [
  {
    title: "onboarding:candidateWelcome.s0.title",
    description: "onboarding:candidateWelcome.s0.description",
    illustration: (
      <div className="text-center space-y-3">
        <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-violet-500 rounded-2xl flex items-center justify-center mx-auto shadow-lg">
          <span className="text-3xl">🎓</span>
        </div>
        <div className="space-y-1">
          {/* Marka adı — her dilde aynı */}
          <div className="text-sm font-bold text-slate-800">Sınav Salonu</div>
        </div>
      </div>
    ),
  },
  {
    title: "onboarding:candidateWelcome.s1.title",
    description: "onboarding:candidateWelcome.s1.description",
    illustration: <IllustrationExplore />,
  },
  {
    title: "onboarding:candidateWelcome.s2.title",
    description: "onboarding:candidateWelcome.s2.description",
    illustration: <IllustrationPackages />,
  },
  {
    title: "onboarding:candidateWelcome.s3.title",
    description: "onboarding:candidateWelcome.s3.description",
    illustration: <IllustrationEducators />,
  },
  {
    title: "onboarding:candidateWelcome.s4.title",
    description: "onboarding:candidateWelcome.s4.description",
    illustration: <IllustrationCandidateActivation />,
  },
  {
    title: "onboarding:candidateWelcome.s5.title",
    description: "onboarding:candidateWelcome.s5.description",
    illustration: <IllustrationNotes />,
  },
  {
    title: "onboarding:candidateWelcome.s6.title",
    description: "onboarding:candidateWelcome.s6.description",
    illustration: <IllustrationTunnel />,
  },
];

/* ═══════════════════════════════════════════════
   ADAY — Test Çözme Turu  (ob_cand_test)
   5 adım
═══════════════════════════════════════════════ */

const IllustrationTestScreen = () => (
  <div className="w-full max-w-xs space-y-2">
    <MockCard className="space-y-2">
      <div className="flex items-center justify-between">
        <MockBadge label="Soru 1 / 40" color="indigo" />
        <div className="flex items-center gap-1 text-[10px] text-amber-600 font-semibold">
          <div className="w-3 h-3 rounded-full border-2 border-amber-400" />
          45:00
        </div>
      </div>
      <div className="space-y-1">
        <MockBar className="w-full text-slate-600 h-2.5" />
        <MockBar className="w-4/5 text-slate-600 h-2.5" />
      </div>
      <div className="grid grid-cols-2 gap-1.5 mt-2">
        {["A", "B", "C", "D"].map((opt) => (
          <div key={opt} className="flex items-center gap-1.5 border border-slate-200 rounded-lg px-2 py-1.5 bg-slate-50">
            <div className="w-4 h-4 rounded-full border-2 border-slate-300 flex-shrink-0" />
            <MockBar className="flex-1 text-slate-400" />
          </div>
        ))}
      </div>
    </MockCard>
  </div>
);

const IllustrationNavigation = () => (
  <div className="w-full max-w-xs space-y-2">
    <div className="text-[10px] text-slate-500 font-semibold mb-1">Soru Navigasyonu</div>
    <div className="grid grid-cols-8 gap-1">
      {Array.from({ length: 16 }, (_, i) => (
        <div
          key={i}
          className={`w-6 h-6 rounded text-[9px] font-semibold flex items-center justify-center ${
            i < 5
              ? "bg-emerald-100 text-emerald-700"
              : i === 5
              ? "bg-indigo-600 text-white shadow"
              : i === 8
              ? "bg-amber-100 text-amber-700"
              : "bg-slate-100 text-slate-500"
          }`}
        >
          {i + 1}
        </div>
      ))}
    </div>
    <div className="flex gap-2 mt-1">
      <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-sm bg-emerald-100 border border-emerald-300" /><span className="text-[9px] text-slate-500">Cevaplanan</span></div>
      <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-sm bg-amber-100 border border-amber-300" /><span className="text-[9px] text-slate-500">İşaretlenen</span></div>
    </div>
  </div>
);

const IllustrationFlagQuestion = () => (
  <div className="w-full max-w-xs">
    <MockCard className="space-y-2">
      <div className="flex items-center justify-between">
        <MockBadge label="Soru 9" color="indigo" />
        <div className="flex items-center gap-1 text-[9px] text-amber-600 font-semibold bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
          <span>🚩</span> İşaretli
        </div>
      </div>
      <div className="space-y-1">
        <MockBar className="w-full text-slate-600 h-2.5" />
        <MockBar className="w-3/4 text-slate-600 h-2.5" />
      </div>
      <div className="text-[9px] text-slate-400 mt-1">Daha sonra tekrar inceleyebilirsin.</div>
    </MockCard>
  </div>
);

const IllustrationSubmit = () => (
  <div className="w-full max-w-xs space-y-2">
    <MockCard className="text-center space-y-2">
      <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
        <span className="text-xl">✅</span>
      </div>
      <div className="text-[11px] font-bold text-slate-800">Testi Tamamla</div>
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "Cevaplanan", val: "35", color: "text-emerald-600" },
          { label: "İşaretli", val: "3", color: "text-amber-600" },
          { label: "Boş", val: "2", color: "text-slate-400" },
        ].map((s) => (
          <div key={s.label} className="text-center">
            <div className={`text-base font-bold ${s.color}`}>{s.val}</div>
            <div className="text-[8px] text-slate-500">{s.label}</div>
          </div>
        ))}
      </div>
      <button className="w-full text-[9px] bg-emerald-600 text-white py-1.5 rounded-lg font-semibold">
        Testi Bitir
      </button>
    </MockCard>
  </div>
);

export const CANDIDATE_TEST_STEPS = [
  { title: "onboarding:candidateTest.s0.title", description: "onboarding:candidateTest.s0.description", illustration: <IllustrationTestScreen /> },
  { title: "onboarding:candidateTest.s1.title", description: "onboarding:candidateTest.s1.description", illustration: <IllustrationNavigation /> },
  { title: "onboarding:candidateTest.s2.title", description: "onboarding:candidateTest.s2.description", illustration: <IllustrationTestScreen /> },
  { title: "onboarding:candidateTest.s3.title", description: "onboarding:candidateTest.s3.description", illustration: <IllustrationFlagQuestion /> },
  { title: "onboarding:candidateTest.s4.title", description: "onboarding:candidateTest.s4.description", illustration: <IllustrationSubmit /> },
];

/* ═══════════════════════════════════════════════
   EĞİTİCİ — Karşılama Turu  (ob_edu_welcome)
   4 adım
═══════════════════════════════════════════════ */

const IllustrationEduDashboard = () => (
  <div className="w-full max-w-xs space-y-2">
    <div className="grid grid-cols-2 gap-2">
      {[
        { label: "Toplam Satış", val: "127", color: "bg-indigo-50 border-indigo-100" },
        { label: "Bu Ay Gelir", val: "₺3.4K", color: "bg-emerald-50 border-emerald-100" },
        { label: "Test Paketi", val: "8", color: "bg-violet-50 border-violet-100" },
        { label: "Ortalama Puan", val: "4.8 ★", color: "bg-amber-50 border-amber-100" },
      ].map((s) => (
        <MockCard key={s.label} className={`${s.color} !p-2`}>
          <div className="text-sm font-bold text-slate-800">{s.val}</div>
          <div className="text-[9px] text-slate-500">{s.label}</div>
        </MockCard>
      ))}
    </div>
  </div>
);

const IllustrationCreateTestBtn = () => (
  <div className="w-full max-w-xs space-y-2">
    <MockCard className="space-y-2">
      <div className="text-[10px] font-semibold text-slate-700">Test Paketlerim</div>
      {["YKS Matematik Seti", "KPSS Güncel Olaylar"].map((t) => (
        <div key={t} className="flex items-center gap-2 py-1 border-b border-slate-50 last:border-0">
          <div className="w-2 h-2 rounded-full bg-indigo-400 flex-shrink-0" />
          <span className="text-[9px] text-slate-700 flex-1">{t}</span>
          <MockBadge label="Yayında" color="emerald" />
        </div>
      ))}
      <button className="w-full text-[9px] bg-indigo-600 text-white py-1.5 rounded-lg font-semibold flex items-center justify-center gap-1">
        <span>+</span> Yeni Test Oluştur
      </button>
    </MockCard>
  </div>
);

const IllustrationSalesChart = () => (
  <div className="w-full max-w-xs">
    <MockCard className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold text-slate-700">Satışlarım</span>
        <MockBadge label="Ocak 2025" color="indigo" />
      </div>
      <div className="flex items-end gap-1 h-14">
        {[3, 6, 4, 8, 5, 9, 7, 11, 6, 8, 10, 9].map((h, i) => (
          <div
            key={i}
            className={`flex-1 rounded-t ${i === 10 ? "bg-indigo-600" : "bg-indigo-100"}`}
            style={{ height: `${(h / 11) * 100}%` }}
          />
        ))}
      </div>
      <div className="flex justify-between text-[8px] text-slate-400">
        <span>Oca</span><span>Şub</span><span>Mar</span>
      </div>
    </MockCard>
  </div>
);

const IllustrationProfile = () => (
  <div className="w-full max-w-xs">
    <MockCard className="flex items-center gap-3">
      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-400 to-indigo-400 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
        E
      </div>
      <div className="flex-1 space-y-1">
        <div className="text-[10px] font-bold text-slate-800">Eğitici Adı</div>
        <MockBar className="w-3/4 text-slate-400" />
        <div className="flex gap-1">
          <MockBadge label="YKS" color="indigo" />
          <MockBadge label="KPSS" color="violet" />
        </div>
      </div>
    </MockCard>
  </div>
);

// Sprint 11 #6 — Eğitici persona 5. adım: "Öne çık" — reklam paketi ve indirim
// kodu kullanmanın satışa etkisini gösterir, aktivasyon (=ilk paket yayımı) için
// motivasyon yaratır.
const IllustrationEducatorActivation = () => (
  <div className="w-full max-w-xs space-y-2">
    <MockCard className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold text-slate-800">Öne Çıkar</span>
        <MockBadge label="+320% görüntülenme" color="emerald" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-gradient-to-br from-amber-50 to-rose-50 rounded-lg p-2 border border-amber-100">
          <div className="text-[9px] font-bold text-amber-700">⭐ Reklam Paketi</div>
          <div className="text-[8px] text-slate-500 mt-0.5">Anasayfa öneri kutusu</div>
        </div>
        <div className="bg-gradient-to-br from-violet-50 to-indigo-50 rounded-lg p-2 border border-violet-100">
          <div className="text-[9px] font-bold text-violet-700">🎟️ İndirim Kodu</div>
          <div className="text-[8px] text-slate-500 mt-0.5">Yeni adaylar için</div>
        </div>
      </div>
      <button className="w-full text-[10px] bg-indigo-600 text-white py-1.5 rounded-lg font-semibold">
        İlk Paketini Yayınla
      </button>
    </MockCard>
  </div>
);

export const EDUCATOR_WELCOME_STEPS = [
  { title: "onboarding:educatorWelcome.s0.title", description: "onboarding:educatorWelcome.s0.description", illustration: <IllustrationEduDashboard /> },
  { title: "onboarding:educatorWelcome.s1.title", description: "onboarding:educatorWelcome.s1.description", illustration: <IllustrationCreateTestBtn /> },
  { title: "onboarding:educatorWelcome.s2.title", description: "onboarding:educatorWelcome.s2.description", illustration: <IllustrationSalesChart /> },
  { title: "onboarding:educatorWelcome.s3.title", description: "onboarding:educatorWelcome.s3.description", illustration: <IllustrationProfile /> },
  { title: "onboarding:educatorWelcome.s4.title", description: "onboarding:educatorWelcome.s4.description", illustration: <IllustrationEducatorActivation /> },
];

/* ═══════════════════════════════════════════════
   EĞİTİCİ — Test Oluşturma Turu  (ob_edu_create)
   4 adım
═══════════════════════════════════════════════ */

const IllustrationTestMeta = () => (
  <div className="w-full max-w-xs space-y-2">
    <MockCard className="space-y-2">
      <div className="text-[10px] font-semibold text-slate-700 mb-1">Test Bilgileri</div>
      {[
        { label: "Başlık", width: "w-4/5" },
        { label: "Açıklama", width: "w-full" },
        { label: "Sınav Türü", width: "w-2/3" },
        { label: "Fiyat", width: "w-1/3" },
      ].map((f) => (
        <div key={f.label} className="space-y-0.5">
          <div className="text-[8px] text-slate-400 font-medium">{f.label}</div>
          <div className={`h-2 bg-slate-100 rounded-full ${f.width}`} />
        </div>
      ))}
    </MockCard>
  </div>
);

const IllustrationAddQuestions = () => (
  <div className="w-full max-w-xs space-y-1.5">
    {[1, 2].map((q) => (
      <MockCard key={q} className="space-y-1.5 !p-2.5">
        <div className="flex items-center justify-between">
          <MockBadge label={`Soru ${q}`} color="indigo" />
          <MockBadge label="Çoktan Seçmeli" color="violet" />
        </div>
        <div className="space-y-1">
          <MockBar className="w-full text-slate-600 h-2" />
          <MockBar className="w-3/4 text-slate-600 h-2" />
        </div>
        <div className="grid grid-cols-2 gap-1">
          {["A", "B", "C", "D"].map((opt) => (
            <div key={opt} className={`text-[8px] flex items-center gap-1 px-1.5 py-1 rounded border ${opt === "C" ? "border-emerald-300 bg-emerald-50 text-emerald-700 font-bold" : "border-slate-200 text-slate-500"}`}>
              <span>{opt})</span>
              <MockBar className={`flex-1 ${opt === "C" ? "text-emerald-400" : "text-slate-300"} h-1.5`} />
            </div>
          ))}
        </div>
      </MockCard>
    ))}
  </div>
);

const IllustrationSolutions = () => (
  <div className="w-full max-w-xs">
    <MockCard className="space-y-2">
      <div className="flex items-center justify-between">
        <MockBadge label="Soru 1 Çözümü" color="emerald" />
        <MockBadge label="Doğru: C" color="emerald" />
      </div>
      <div className="space-y-1">
        <MockBar className="w-full text-slate-500 h-2" />
        <MockBar className="w-4/5 text-slate-500 h-2" />
        <MockBar className="w-3/5 text-slate-500 h-2" />
      </div>
      <div className="mt-1 p-1.5 bg-emerald-50 rounded-lg border border-emerald-100">
        <div className="text-[8px] text-emerald-700 font-semibold">Çözüm Açıklaması</div>
        <MockBar className="w-full text-emerald-400 mt-1 h-1.5" />
      </div>
    </MockCard>
  </div>
);

const IllustrationPublish = () => (
  <div className="w-full max-w-xs space-y-2">
    <MockCard className="text-center space-y-2">
      <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center mx-auto">
        <span className="text-xl">🚀</span>
      </div>
      <div className="text-[11px] font-bold text-slate-800">Yayınlamaya Hazır!</div>
      <div className="grid grid-cols-3 gap-1">
        {[
          { label: "Soru", val: "40" },
          { label: "Süre", val: "90dk" },
          { label: "Fiyat", val: "₺199" },
        ].map((s) => (
          <div key={s.label} className="text-center bg-slate-50 rounded-lg p-1">
            <div className="text-[11px] font-bold text-slate-800">{s.val}</div>
            <div className="text-[8px] text-slate-500">{s.label}</div>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between bg-indigo-50 rounded-lg px-2 py-1.5">
        <span className="text-[9px] text-indigo-700 font-semibold">Yayında</span>
        <div className="w-7 h-4 bg-indigo-600 rounded-full flex items-center justify-end px-0.5">
          <div className="w-3 h-3 bg-white rounded-full" />
        </div>
      </div>
    </MockCard>
  </div>
);

export const EDUCATOR_CREATE_STEPS = [
  { title: "onboarding:educatorCreate.s0.title", description: "onboarding:educatorCreate.s0.description", illustration: <IllustrationTestMeta /> },
  { title: "onboarding:educatorCreate.s1.title", description: "onboarding:educatorCreate.s1.description", illustration: <IllustrationAddQuestions /> },
  { title: "onboarding:educatorCreate.s2.title", description: "onboarding:educatorCreate.s2.description", illustration: <IllustrationSolutions /> },
  { title: "onboarding:educatorCreate.s3.title", description: "onboarding:educatorCreate.s3.description", illustration: <IllustrationPublish /> },
];

/* ═══════════════════════════════════════════════
   E-SINIF — Rol bazlı bilgilendirme turları
   Öğrenci (ob_school_student) / Öğretmen (ob_school_teacher) / Yönetici (ob_school_admin)
═══════════════════════════════════════════════ */

const SchoolHero = ({ emoji, label }) => (
  <div className="text-center space-y-3">
    <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-violet-500 rounded-2xl flex items-center justify-center mx-auto shadow-lg">
      <span className="text-3xl">{emoji}</span>
    </div>
    <div className="text-sm font-bold text-slate-800">{label}</div>
  </div>
);

const SchoolMenuMock = ({ items }) => (
  <div className="w-full max-w-xs space-y-1.5">
    {items.map((it) => (
      <MockCard key={it.label} className={`flex items-center gap-3 !p-2.5 ${it.active ? "ring-2 ring-indigo-300" : ""}`}>
        <div className={`w-8 h-8 rounded-lg ${it.color} flex items-center justify-center text-white text-sm`}>{it.icon}</div>
        <span className="text-[11px] font-semibold text-slate-700 flex-1">{it.label}</span>
        {it.badge && <MockBadge label={it.badge} color={it.badgeColor || "indigo"} />}
      </MockCard>
    ))}
  </div>
);

// ÖĞRENCİ
export const SCHOOL_STUDENT_STEPS = [
  { title: "onboarding:school.student.s0.title", description: "onboarding:school.student.s0.description", illustration: <SchoolHero emoji="🎓" label="E-Sınıf" /> },
  { title: "onboarding:school.student.s1.title", description: "onboarding:school.student.s1.description", illustration: <SchoolMenuMock items={[
    { icon: "📚", label: "Matematik — 1. Ünite", color: "bg-indigo-400", badge: "Bekliyor", badgeColor: "amber", active: true },
    { icon: "📝", label: "Türkçe Yazılı", color: "bg-emerald-400", badge: "Teslim", badgeColor: "emerald" },
  ]} /> },
  { title: "onboarding:school.student.s2.title", description: "onboarding:school.student.s2.description", illustration: <SchoolMenuMock items={[
    { icon: "🧭", label: "Keşfet — Test", color: "bg-indigo-400", badge: "12", active: true },
    { icon: "🔻", label: "Keşfet — Tünel", color: "bg-violet-400", badge: "5" },
    { icon: "✍️", label: "Keşfet — Yazılı", color: "bg-amber-400", badge: "3" },
  ]} /> },
  { title: "onboarding:school.student.s3.title", description: "onboarding:school.student.s3.description", illustration: <IllustrationCandidateActivation /> },
  { title: "onboarding:school.student.s4.title", description: "onboarding:school.student.s4.description", illustration: <SchoolHero emoji="⚡" label="Canlı Sınav — Kodla Katıl" /> },
];

// ÖĞRETMEN
export const SCHOOL_TEACHER_STEPS = [
  { title: "onboarding:school.teacher.s0.title", description: "onboarding:school.teacher.s0.description", illustration: <SchoolHero emoji="👋" label="Öğretmen Paneli" /> },
  { title: "onboarding:school.teacher.s1.title", description: "onboarding:school.teacher.s1.description", illustration: <SchoolMenuMock items={[
    { icon: "📋", label: "Test", color: "bg-indigo-400" },
    { icon: "🔻", label: "Tünel", color: "bg-violet-400" },
    { icon: "✍️", label: "Yazılı", color: "bg-amber-400" },
  ]} /> },
  { title: "onboarding:school.teacher.s2.title", description: "onboarding:school.teacher.s2.description", illustration: <SchoolMenuMock items={[
    { icon: "🏫", label: "5-A", color: "bg-emerald-400", badge: "Ata", badgeColor: "indigo", active: true },
    { icon: "🏫", label: "5-B", color: "bg-emerald-400", badge: "Ata", badgeColor: "indigo" },
  ]} /> },
  { title: "onboarding:school.teacher.s3.title", description: "onboarding:school.teacher.s3.description", illustration: <IllustrationSalesChart /> },
];

// YÖNETİCİ
export const SCHOOL_ADMIN_STEPS = [
  { title: "onboarding:school.admin.s0.title", description: "onboarding:school.admin.s0.description", illustration: <SchoolHero emoji="🏫" label="Okul Yönetim Paneli" /> },
  { title: "onboarding:school.admin.s1.title", description: "onboarding:school.admin.s1.description", illustration: <SchoolMenuMock items={[
    { icon: "🏢", label: "Şubeler & Sınıflar", color: "bg-indigo-400", active: true },
    { icon: "📕", label: "Zümreler", color: "bg-violet-400" },
    { icon: "📗", label: "Dersler", color: "bg-emerald-400" },
  ]} /> },
  { title: "onboarding:school.admin.s2.title", description: "onboarding:school.admin.s2.description", illustration: <SchoolMenuMock items={[
    { icon: "👨‍🏫", label: "Öğretmen ekle", color: "bg-indigo-400" },
    { icon: "🧑‍🎓", label: "Öğrenci ekle (Excel)", color: "bg-emerald-400", badge: "Toplu", badgeColor: "emerald" },
  ]} /> },
  { title: "onboarding:school.admin.s3.title", description: "onboarding:school.admin.s3.description", illustration: <IllustrationSalesChart /> },
];
