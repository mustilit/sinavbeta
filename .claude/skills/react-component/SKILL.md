---
name: react-component
description: React 18 + Vite + JavaScript (JSX) component pattern'leri — component yapısı, React Router DOM v6 routing, TanStack Query data fetching, form, error/loading state, React.lazy code splitting, dark mode (next-themes). Yeni component, sayfa, form yazılırken referans alın. Stack: React + Vite, TypeScript YOK, Server Action YOK.
---

# React Component Pattern'leri (Vite + JS Stack)

Sınav Salonu stack'i: React 18, Vite, JavaScript (JSX), Tailwind, Radix UI primitives (`shadcn/ui` tarzı), React Router DOM v6, TanStack Query, dalClient.js.

**Önemli:** Bu proje **Next.js DEĞİL.** Server Component, Server Action, App Router yok. SPA — her şey client-side.

## Component Konvansiyonu

```jsx
// apps/frontend/src/components/exam/ExamCard.jsx
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';

export function ExamCard({ exam, onPurchase }) {
  return (
    <article className="rounded border p-4 space-y-2">
      <h3 className="font-semibold">{exam.title}</h3>
      <p className="text-sm text-muted-foreground">{exam.description}</p>
      <div className="flex items-center justify-between">
        <span className="font-bold">{exam.priceCents / 100} ₺</span>
        <Link to={`/test/${exam.id}`}>
          <Button variant="secondary">İncele</Button>
        </Link>
        <Button onClick={() => onPurchase(exam.id)}>Satın Al</Button>
      </div>
    </article>
  );
}
```

Kurallar:
- **Named export.** Varsayılan export yasak.
- **JSX uzantısı:** `.jsx` (component) veya `.js` (util/hook).
- **Props destructure:** fonksiyon imzasında.
- **Konum:** `apps/frontend/src/components/<domain>/<ComponentName>.jsx` — domain = exam, question, attempt, user, payment, layout, ui.
- **Tailwind utility-first.** Dinamik class ismi yasak (`bg-${color}-500` JIT'i kırar).

## Sayfa (Page)

Sayfa = route hedefi. `apps/frontend/src/pages/` altında, `pages.config.js` ile route'a bağlanır.

```jsx
// apps/frontend/src/pages/TestDetail.jsx
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '@/api/dalClient';

export function TestDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const { data: exam, isLoading, error } = useQuery({
    queryKey: ['tests', id],
    queryFn: () => api.get(`/tests/${id}`),
    enabled: Boolean(id),
  });

  if (isLoading) return <Spinner />;
  if (error?.status === 404) return <ErrorState title="Sınav bulunamadı" />;
  if (error) return <ErrorState title="Bir hata oluştu" message={error.message} />;

  return <TestDetailView test={exam} onBack={() => navigate(-1)} />;
}
```

Sayfa component'i:
- Route param'larını okur (`useParams`)
- Data'yı TanStack Query ile çeker
- Loading + error UI verir
- Asıl render'ı bir alt component'e delege eder (test edilebilirlik)

## Routing & Code Splitting (React.lazy + Suspense)

Sınav Salonu'nda routing iki yerde tanımlı:
- `apps/frontend/src/pages.config.js` — sayfa-route eşlemesi (auto-generated)
- `apps/frontend/src/lib/routeRoles.js` — rol bazlı erişim

### Eager Import Sorunu

`pages.config.js` 47 sayfayı **eagerly** import ediyor: admin, educator, candidate sayfalarının hepsi ilk yüklemede bundle'a giriyor. Login bile olmayan ziyaretçi `AdminEducatorReport`'u indiriyor.

### Çözüm — React.lazy ile Route Bazlı Split

`pages.config.js` jeneratörünü `React.lazy` üretecek şekilde değiştir. Sözleşme:

```js
// apps/frontend/src/pages.config.js (auto-generated)
import { lazy } from 'react';
import __Layout from './Layout.jsx';

export const PAGES = {
  About:                  lazy(() => import('./pages/About')),
  AdminAdReport:          lazy(() => import('./pages/AdminAdReport')),
  AdminCandidateReport:   lazy(() => import('./pages/AdminCandidateReport')),
  // ... 47 sayfa
  Home:                   lazy(() => import('./pages/Home')),
  Login:                  lazy(() => import('./pages/Login')),
};

export const pagesConfig = {
  mainPage: 'Home',
  Pages: PAGES,
  Layout: __Layout,
};
```

**Sayfa dosyalarında ek değişiklik:** Her `pages/<Name>.jsx` **default export** vermeli (React.lazy default export bekler) — bu kural sayfalar için **istisna**. Component'ler hâlâ named export.

```jsx
// apps/frontend/src/pages/TestDetail.jsx
// import { useQuery } ...

function TestDetail() { /* ... */ }

export default TestDetail;       // ← lazy için zorunlu
export { TestDetail };           // ← isteğe bağlı, mevcut named import'ları kırmamak için
```

### Suspense Wrapper

`App.jsx`'te `<Routes>` etrafına tek bir `<Suspense>` sar:

```jsx
import { Suspense } from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';

function PageFallback() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-white">
      <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

// App component içinde:
<Suspense fallback={<PageFallback />}>
  <Routes>{/* ... */}</Routes>
</Suspense>
```

### Vite Bundle Analyzer (kontrol)

`rollup-plugin-visualizer` **zaten yapılandırılmış** (`vite.config.js`). Ekstra kurulum gerekmez:

```bash
cd apps/frontend
ANALYZE=1 npm run build   # dist/stats.html treemap üretir
```

CI'da `frontend_build` job'ı `ANALYZE=1` ile build yapıp `bundle-stats-<sha>` artifact'ı yükler.

Beklenen: initial bundle 300-500 KB, her sayfa kendi chunk'ında 20-80 KB.

### Prefetch (opsiyonel iyileştirme)

Link hover'da next route'u prefetch:

```jsx
<Link
  to="/Explore"
  onMouseEnter={() => import('./pages/Explore')}
>
  Keşfet
</Link>
```

Sözleşme: kritik 3-5 sayfa için prefetch yeter; hepsine eklersen eager'a geri dönmüş olursun.

### Bundle Discipline — `manualChunks` + Heavy Lib Dynamic Import (Sprint 12 #1)

**Vendor split (`vite.config.js`):** Rollup `output.manualChunks` ile 8 vendor grup tanımlı (react / radix / query / i18n / icons / analytics / form / date). Vendor chunk'lar **stable hash** alır → kod deploy edildiğinde tarayıcı sadece değişen entry chunk'ı indirir, vendor'lar cache'den gelir.

**Yeni vendor lib eklerken:**
1. `vite.config.js`'i aç, `manualChunks` map'ine uygun grubu seç.
2. Yeni kategoriye uymayan tek başına büyük lib (>100 KB) için ayrı grup ekle.
3. Entry chunk'a (uncategorized) yeni büyük lib eklemek **yasak** — `index-*.js` 600 KB'ı aşarsa Vite uyarısı verir.

**Heavy lib dynamic import:** İlk yüklemede ihtiyaç **olmayan** ama bazı sayfa veya handler'da gereken büyük lib'leri statik import etmek yerine `await import()` ile lazy yükle:

```jsx
// Sayfa açılışında ihtiyaç YOK — sadece "Excel'e aktar" tıklayınca
const handleExport = async () => {
  const XLSX = await import('xlsx');           // 429 KB lazy
  // ...
};

// html2canvas paylaş fonksiyonu içinde
const handleShare = async () => {
  const html2canvas = (await import('html2canvas')).default; // 202 KB lazy
  const canvas = await html2canvas(node);
  // ...
};

// recharts — gerçek grafik component'i lazy
const LineChart = lazy(() => import('recharts').then(m => ({ default: m.LineChart })));
```

**Hangi lib'ler lazy olmalı?**
- `xlsx`, `jspdf`, `mammoth`, `html2canvas` — export/PDF tek tıklamada lazım
- `recharts` (LineChart vb.) — sadece dashboard sayfalarında
- `three`, `react-quill` — niche kullanımlar
- `framer-motion` — sayfa-spesifik animasyon varsa

**Yapmayacaklar:**
- Heavy lib'i `App.jsx`'te veya `Layout.jsx`'te statik import — tüm sayfaya bulaşır.
- Her route'ta `await import` — yine eager'a dönmüş olursun.
- `manualChunks` içinde 20+ grup tanımlamak — küçük chunk yağmuru, HTTP overhead.

**Ölçüm:**
```bash
ANALYZE=1 npm run build   # dist/stats.html treemap
```
Hedef: initial entry < 500 KB raw, vendor chunk'lar 50-200 KB arası. Sayfa chunk'ı 20-80 KB.

## Data Fetching — TanStack Query

```jsx
import { useQuery } from '@tanstack/react-query';
import api from '@/api/dalClient';

// Liste
const { data: tests = [], isLoading } = useQuery({
  queryKey: ['tests', { status: 'PUBLISHED' }],
  queryFn: () => api.get('/tests?status=PUBLISHED'),
  staleTime: 60_000,
});

// Tekil
const { data: test } = useQuery({
  queryKey: ['tests', id],
  queryFn: () => api.get(`/tests/${id}`),
  enabled: Boolean(id),
});

// Sonsuz scroll (cursor pagination)
import { useInfiniteQuery } from '@tanstack/react-query';
const { data, fetchNextPage, hasNextPage } = useInfiniteQuery({
  queryKey: ['marketplace', filter],
  queryFn: ({ pageParam }) => api.get(`/marketplace/tests?${new URLSearchParams({ cursorId: pageParam?.id ?? '', cursorPublishedAt: pageParam?.publishedAt ?? '' })}`),
  initialPageParam: null,
  getNextPageParam: (last) => last.nextCursor ?? undefined,
});
```

Detay: `pagination` skill'i.

**Query Key Hiyerarşisi:**
- `['tests']` → tüm test listeleri
- `['tests', { status: 'PUBLISHED' }]` → filtre
- `['tests', 'mine']` → kullanıcının kendi
- `['tests', id]` → tekil
- `['marketplace', filter]` → marketplace cursor listesi

Mutation sonrası `invalidateQueries({ queryKey: ['tests'] })` prefix invalidate eder.

## Form (Mutation)

Form pattern detayları için **`form-mutation`** skill'ine bak. Özet:

```jsx
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { z } from 'zod';
import api from '@/api/dalClient';

const CreateTestSchema = z.object({
  title: z.string().min(3),
  priceCents: z.number().int().min(100),
  durationMinutes: z.number().int().min(1),
});

export function CreateTestForm() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [errors, setErrors] = useState({});

  const createTest = useMutation({
    mutationFn: (data) => api.post('/tests', data),
    onSuccess: (test) => {
      queryClient.invalidateQueries({ queryKey: ['tests'] });
      navigate(`/test/${test.id}`);
    },
    onError: (err) => {
      if (err.fieldErrors) setErrors(err.fieldErrors);
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    const parsed = CreateTestSchema.safeParse(data);
    if (!parsed.success) {
      setErrors(parsed.error.flatten().fieldErrors);
      return;
    }
    createTest.mutate(parsed.data);
  };

  // ...
}
```

## Dark Mode + Theme Persistency (next-themes)

Proje `next-themes ^0.4.4` yüklü ve **`App.jsx`'te aktif**. `tailwind.config.js`'te `darkMode: 'class'` set edilmiş. Yeni component yazarken ekstra kurulum gerekmez; doğrudan `dark:` prefix kullan.

### Provider Kurulumu

```jsx
// apps/frontend/src/App.jsx
import { ThemeProvider } from 'next-themes';

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider
        attribute="class"           // <html class="dark"> moda göre toggle
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange   // tema değişiminde flash önlemi
      >
        <AuthProvider>
          <QueryClientProvider client={queryClientInstance}>
            <Router>
              <NavigationTracker />
              <AuthenticatedApp />
            </Router>
            <Toaster />
          </QueryClientProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
```

### Tailwind Config

`tailwind.config.js`'te `darkMode: 'class'`:

```js
module.exports = {
  darkMode: 'class',
  content: ['./src/**/*.{js,jsx,html}'],
  theme: { /* ... */ },
};
```

### Toggle Component

```jsx
// apps/frontend/src/components/layout/ThemeToggle.jsx
import { useTheme } from 'next-themes';
import { Moon, Sun, Monitor } from 'lucide-react';
import { useEffect, useState } from 'react';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Hydration mismatch'i engelle — ilk render'da tema bilinmiyor
  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="w-9 h-9" aria-hidden="true" />;

  const cycle = () => {
    setTheme(theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light');
  };

  const Icon = theme === 'dark' ? Moon : theme === 'system' ? Monitor : Sun;
  const label = theme === 'dark' ? 'Karanlık tema' : theme === 'system' ? 'Sistem teması' : 'Aydınlık tema';

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={`${label}. Değiştirmek için tıkla.`}
      className="inline-flex items-center justify-center w-9 h-9 rounded
                 hover:bg-gray-100 dark:hover:bg-gray-800
                 focus-visible:ring-2 focus-visible:ring-indigo-500"
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}
```

### Dark Sınıflarını Kullanım

Tailwind `dark:` prefix:

```jsx
<div className="bg-white text-gray-900 dark:bg-gray-900 dark:text-gray-100">
  ...
</div>
```

**Önemli:** `bg-${theme}` gibi dinamik üretme — utility statik olmalı.

### Persistency

`next-themes` `localStorage`'da `theme` key'i tutar otomatik. SSR yok (Vite SPA), `suppressHydrationWarning`'a gerek yok ama `<html>`'in başlangıçta yanlış renkle parlamaması için inline script ekle:

```html
<!-- apps/frontend/index.html, <head> içinde -->
<script>
  (function() {
    try {
      const t = localStorage.getItem('theme');
      const system = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const dark = t === 'dark' || (t !== 'light' && system);
      if (dark) document.documentElement.classList.add('dark');
    } catch (e) {}
  })();
</script>
```

Bu script `next-themes` Provider yüklenmeden önce çalışıp doğru tema class'ını ekler — "white flash" sorunu olmaz.

## Error Boundary + Sentry

`apps/frontend/src/components/ErrorBoundary.jsx` — `App.jsx`'te root seviyede sarılı. `componentDidCatch` içinde **`Sentry.captureException`** çağrılıyor; `VITE_SENTRY_DSN` env yoksa sessizce atlanır. Yeni boundary yazarken aynı pattern:

```jsx
import * as Sentry from '@sentry/react';

componentDidCatch(error, errorInfo) {
  Sentry.captureException(error, { extra: errorInfo });
  // prod'da console.error gürültü yapar, kaldırılabilir
}
```

Route bazlı ek boundary yazılabilir:

```jsx
<ErrorBoundary fallback={<RouteError />}>
  <Routes>{/* ... */}</Routes>
</ErrorBoundary>
```

## Loading State

**Spinner:** kısa loading (<1s) için.
**Skeleton:** liste/kart layout'u korumak için (>1s). `components/ui/skeleton.jsx` projede mevcut.

```jsx
import { Skeleton } from '@/components/ui/skeleton';

function ExamCardSkeleton() {
  return (
    <div className="rounded border p-4 space-y-2">
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-3 w-1/2" />
    </div>
  );
}

{isLoading
  ? Array.from({ length: 6 }).map((_, i) => <ExamCardSkeleton key={i} />)
  : exams.map((e) => <ExamCard key={e.id} exam={e} />)
}
```

## Görsel Kullanımı — `<ResponsiveImage>` (Sprint 11 #2, Sprint 12 #2)

> **Backend Sharp pipeline** her yüklemeden sonra `responsive: { srcset, srcsetWebp, srcsetAvif, sizes, thumb, width, height }` döner. `<img src="...">` hardcoded YAZMA — `<ResponsiveImage>` kullan.
>
> **Sprint 12 #2:** AVIF varyantları da üretiliyor. `<ResponsiveImage>` `srcsetAvif` doluysa `<picture><source type="image/avif"><source type="image/webp"><img>` chain'i kurar; AVIF destekleyen tarayıcı ~%30 daha küçük dosya indirir. AVIF yoksa düz `<img srcset>` (legacy/Sprint 11 davranışı).

**Component:** `apps/frontend/src/components/ui/ResponsiveImage.jsx`

```jsx
import { ResponsiveImage } from '@/components/ui/ResponsiveImage';

// Backend payload'undan — TestPackage kapak, soru görseli vb.
<ResponsiveImage
  src={pkg.coverImageUrl}
  responsive={pkg.coverImageResponsive}  // { srcset, sizes, thumb, width, height }
  alt={pkg.title}
  className="w-full h-48 object-cover rounded"
/>

// Avatar / kart önizleme — sadece 96px thumbnail
<ResponsiveImage
  src={user.avatarUrl}
  responsive={user.avatarResponsive}
  variant="thumb"
  alt={user.name}
/>

// Hero / above-the-fold — LCP'yi etkiler
<ResponsiveImage
  src={hero.url}
  responsive={hero.responsive}
  priority
  alt={hero.alt}
/>

// Legacy kayıt — sadece src bilinen eski purchases.thumbnail
<ResponsiveImage src="/uploads/old.jpg" alt="..." />
```

**Otomatik davranışlar:**
- `<img srcset>` → browser ekran boyutuna göre 320w/640w/1024w WebP seçer (4MB orijinal yerine ~80KB)
- `loading="lazy"` (`priority` ile `eager`) — viewport altı görseller LCP'ye etki etmez
- `decoding="async"` — main thread'i bloklamaz
- `width`/`height` attribute → layout reserve, **CLS = 0**
- `priority` → `fetchpriority="high"` + `loading="eager"` (hero ve above-the-fold için)

**Backend response shape (`POST /upload/image`):**

```jsonc
{
  "url": "http://api/uploads/abc.jpg",       // origin (geriye dönük uyumlu)
  "filename": "abc.jpg",
  "size": 482039,
  "detectedType": "jpeg",
  "responsive": {
    "thumb": "http://api/uploads/abc-thumb.webp",
    "srcset":     "http://api/uploads/abc-320w.webp 320w, .../abc-640w.webp 640w, .../abc-1024w.webp 1024w",
    "srcsetWebp": "http://api/uploads/abc-320w.webp 320w, .../abc-640w.webp 640w, .../abc-1024w.webp 1024w",
    "srcsetAvif": "http://api/uploads/abc-320w.avif 320w, .../abc-640w.avif 640w, .../abc-1024w.avif 1024w",
    "sizes": "(max-width: 640px) 100vw, 1024px",
    "width": 2000,
    "height": 1500
  },
  "variants": [/* { label, width, height, format, bytes, url } */]
}
```

`<ResponsiveImage>` `srcsetAvif` doluysa otomatik `<picture>` + AVIF source basar; tarayıcı negotiation yapar. `srcsetAvif` boşsa (legacy kayıt veya GIF) düz `<img srcset>` davranışı.

**Database'de iki alan tutuluyor (öneri pattern):**
- `coverImageUrl: string`     — origin (geriye dönük)
- `coverImageResponsive: Json` — `{ srcset, sizes, thumb, width, height }`

Eski kayıtlarda `coverImageResponsive = null` ise component fallback'e düşer (sadece `src`); kırılma yok.

**Yapmayacakların:**
- Hardcoded `<img src="/uploads/...">` — kullanıcı 4MB indirir.
- `width`/`height` set etmemek — CLS skoru bozulur, Lighthouse fail.
- Decorative görselde `alt=""` yerine açıklayıcı alt — gereksiz screen reader gürültüsü.
- `priority` her görsele — 3+ hero "high priority" performans kazancını yutar.

## Accessibility

Temel kurallar burada özet — detaylı: `accessibility` skill'i.

- Semantic HTML: `<button>` `<form>` `<input>` `<nav>` `<main>` `<article>`.
- Form input'larında `<label htmlFor>` veya `aria-label`.
- Hata mesajları `role="alert"` + `aria-describedby` ile input'a bağlı.
- Modal için Radix UI primitives (focus trap dahil).
- `focus-visible:ring-2` görünür odak halkası.
- Renk kontrastı AA (4.5:1) — `text-gray-400 on bg-white` riskli.
- **Touch target ≥ 40×40px** — mobil 360px viewport'ta test edilir (`mobile-a11y.spec.ts`).

Yeni sayfaya **mutlaka** axe-core e2e testi ekle (`accessibility` skill). Public sayfaysa `mobile-a11y.spec.ts`'in `PAGES` array'ine de ekle.

## PWA + Service Worker (Sprint 11 #3)

`vite-plugin-pwa autoUpdate` aktif. SW kayıtı `setupPwa()` ile `main.jsx`'te yapılır.

```js
// apps/frontend/src/main.jsx
import { setupPwa } from './lib/pwa';
initAnalytics();
setupPwa();   // prod build'de aktif; dev'de noop
```

**Service worker davranışları:**
- `registerType: 'autoUpdate'` — yeni SW deploy edilince kullanıcı **bir sonraki sayfa açılışında** yeni asset'leri alır. Manuel "yenile" prompt'u **yok**.
- Workbox runtime caching: fonts cache-first 30d, `/uploads/` cache-first 30d (Sharp pipeline hash'li URL'leri zaten immutable), marketplace API network-first 4s timeout.
- Navigation fallback `/index.html` — offline'da shell açılır, route'lar React Router içinde yüklenir.
- API path'leri denylist: `/auth/*`, `/admin/*`, `/me/*`, `/marketplace/*`, `/uploads/*` — SW navigation bunlara müdahale etmez.

**Online/offline durumu:**
```js
window.addEventListener('sinavsalonu:offline', () => { /* banner göster */ });
window.addEventListener('sinavsalonu:online', () => { /* banner kapat */ });
if (window.__sinavSalonuOffline) { /* statik kontrol */ }
```

**Manifest** (`vite-plugin-pwa` üretir, `dist/manifest.webmanifest`):
- `name`, `short_name`, `theme_color: #4f46e5`, `display: standalone`, `lang: tr`.
- Icons: `/pwa-192.png`, `/pwa-512.png` (purpose any + maskable).

**Yeni icon gerekirse:**
```bash
# public/pwa-source.svg güncelle (SVG kaynağı)
npm run pwa:icons         # 32/180/192/512 PNG'ları regenerate eder
```

**Yapmayacakların:**
- Service worker'ı manuel `navigator.serviceWorker.register()` ile kayıt — plugin yönetir.
- Dev ortamında SW açmak (devOptions.enabled=true) — Vite HMR + cache çakışır.
- API endpoint'ini cache-first yapmak — stale data 4xx/5xx response döndürür.

## Buton Renkleri — Primary = Site Mavisi (indigo-600)

> **Kural:** Ana (primary) aksiyon butonları **ASLA siyah olmamalı.** `<Button>`
> varsayılan `default` varyantı `bg-primary`'dir ve bu projede `--primary` neredeyse
> siyahtır (`0 0% 9%`). Primary aksiyonlar sitenin mavisi **indigo-600** (hover
> `indigo-700`) ile gösterilir — `CreateTest`/`Tünel` ekranlarındaki tüm "Kaydet,
> Devam, Onaya Gönder, Satın Al, Yeni X, Düzenle" butonları bu tonu kullanır.

```jsx
// İYİ — primary aksiyon site mavisi
<Button className="bg-indigo-600 text-white hover:bg-indigo-700" onClick={save}>
  Kaydet
</Button>

// KÖTÜ — default varyant = siyaha yakın bg-primary
<Button onClick={save}>Kaydet</Button>
```

- **Primary** (asıl eylem): `className="bg-indigo-600 text-white hover:bg-indigo-700"`.
- **İkincil**: `variant="outline"` veya `variant="ghost"` (zaten siyah değil) — olduğu gibi bırak.
- **Yıkıcı/semantik**: sil/red → `bg-rose-600 hover:bg-rose-700`; onayla/başarı → `bg-emerald-600 hover:bg-emerald-700`. Bunlar bilinçli renklerdir, indigo'ya çevirme.
- Koşullu varyantta yalnız `default` (siyah) dalına indigo class ekle:
  `className={editable ? "bg-indigo-600 text-white hover:bg-indigo-700" : ""}`.
- İleride doğrusu: `button.jsx` `default` varyantını indigo yapmak (tek kaynak). O yapılana kadar yeni primary butonlarda yukarıdaki class zorunlu.

## Yapmayacakların

- Component içinde direkt `fetch`/`axios` — `dalClient` kullan.
- `useEffect` içinde fetch — TanStack Query kullan.
- `<a href>` SPA içi navigation için — `<Link to>` kullan.
- Button olmayan element'e onClick — a11y kırar.
- `style` inline — Tailwind kullan.
- Tailwind dinamik class (`bg-${color}-500`, `dark:bg-${...}`) — JIT taramaz.
- **Primary buton'u siyah (`<Button>` default varyant) bırakmak** — site mavisi
  `bg-indigo-600 hover:bg-indigo-700` ekle (bkz. "Buton Renkleri").
- Default export — **sadece `pages/` altında React.lazy için istisna**.
- Server Component / Server Action öner — bu proje SPA.

## Sentry Frontend Entegrasyonu

`@sentry/react` yüklü. `main.jsx`'te `Sentry.init()` App import'undan **önce** çağrılıyor:

```js
// main.jsx — App'ten önce
import * as Sentry from '@sentry/react';
if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
  });
}
```

Manuel yakalamak istersen (örn. query callback'inde):
```js
import * as Sentry from '@sentry/react';
Sentry.captureException(error);
```

`VITE_SENTRY_DSN` env yoksa (dev ortamı) Sentry init çalışmaz, `captureException` no-op'tur.

## Hızlı Tanı — "Component Render Olmuyor"

| Belirti | Sebep |
|---------|-------|
| Boş ekran | Error throw etmiş, ErrorBoundary yutmuş veya yok |
| Sürekli yükleniyor | Query başarılı ama `isLoading` false dönmüyor — `enabled` kontrolü |
| Veri eski kalıyor | invalidateQueries yanlış key veya çağrılmamış |
| 404 sayfası açılıyor | Route tanımlı değil veya path yanlış |
| Component import error | Sayfa default export vermemiş (lazy import için zorunlu) |
| Tailwind class çalışmıyor | Dinamik class oluşturmuş, JIT göremiyor |
| Tema flash (white → dark) | `index.html`'e inline tema script'i eklenmemiş |
| Click çalışmıyor | onClick yanlış element'te (parent veya wrapper'da) |

## Checklist (her component için)

- [ ] Named export mu (sayfa ise default + named ikisi)?
- [ ] Props destructure ediliyor mu?
- [ ] Loading + error state'leri var mı?
- [ ] Semantic HTML + aria attribute'ları yerli yerinde mi?
- [ ] Tailwind dinamik class yok, sabit utility'ler mi?
- [ ] Dark mode için `dark:` varyantları eklendi mi?
- [ ] Primary buton site mavisi mi (`bg-indigo-600 hover:bg-indigo-700`), siyah `default` varyant bırakılmadı mı?
- [ ] Component testi var mı (Vitest + Testing Library)?
- [ ] Mutation varsa `form-mutation` skill checklist'i çalıştırıldı mı?
- [ ] Yeni sayfa ise `pages.config.js` (lazy import) + `routeRoles.js` güncellendi mi?

Skill'ler: `form-mutation` form akışı için, `error-handling` hata yönetimi için, `api-contract` endpoint sözleşmesi için, `pagination` cursor listeler için, `accessibility` a11y için.
