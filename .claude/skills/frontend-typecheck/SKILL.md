# Frontend Typecheck Disiplini (checkJs)

## Arka Plan

Frontend TypeScript'e geçmedi — JavaScript + JSX + `jsconfig.json`'da `checkJs: true` ile tip denetimi alır (`npm run typecheck` → `tsc -p ./jsconfig.json`). 2026-07'de bu komut **4266 hata** birikmiş halde bulundu ve sıfıra indirildi. Sebep basitti: `npm run typecheck` ne pre-commit hook'ta ne CI'da hiç çalıştırılmıyordu — sadece backend `tsc --noEmit` pre-commit'teydi. Artık **frontend typecheck de pre-commit'te** (`.lintstagedrc.cjs`) — bu skill, hatalar tekrar birikmesin diye hem "neden kırılıyor" hem "nasıl önceden önlenir" bilgisini taşır.

**Altın kural:** Yeni bir `.js`/`.jsx` dosyası veya değişiklik yazdıktan sonra `cd apps/frontend && npm run typecheck` çalıştır. Pre-commit zaten çalıştırıyor ama commit anında 900+ dosyalık projede kaynağı bulmak yorucu — kendi değişikliğini yazarken erken çalıştırmak ucuz.

## checkJs Neden Hata Üretir (ve Nasıl Önlenir)

### 1. `components/ui/*.jsx` tipsiz shadcn primitive'leri

`components/ui` klasörü `jsconfig.json`'da **exclude** — kendi içi denetlenmez. Ama tüketen sayfalar (`<Button variant="outline" size="sm">`) her kullanımda prop tipini kontrol eder; tipsiz `.jsx` dosyası `{}` prop tipine düşer ve `variant`/`size`/`className` gibi her prop **yanlış-pozitif** hata üretir (tek başına ~3400 hataydı).

**Çözüm zaten kurulu:** `apps/frontend/scripts/generate-ui-dts.mjs` her `components/ui/*.jsx` için yanına `.d.ts` üretir (export'ları `any` olarak bildirir — runtime'a dokunmaz, salt typecheck).

```bash
cd apps/frontend
node scripts/generate-ui-dts.mjs
```

**Ne zaman yeniden çalıştırılır:**
- `components/ui`'a yeni bir dosya eklendiğinde (yeni shadcn bileşeni).
- Mevcut bir `ui/*.jsx` dosyasının `export` listesi değiştiğinde (yeni named export eklendi/kaldırıldı).
- Script otomatik değil — CI/pre-commit'te çalışmaz, **elle** tetiklenir. Script idempotent, zararsız fazladan çalıştırma.

Script çalışmazsa veya `.d.ts` güncel değilse: yeni export kullanan sayfa "has no exported member" (TS2305) hatası alır — bu, script'in yeniden çalıştırılması gerektiğinin işaretidir.

### 2. `jsconfig.json` — kapsam ve types

```json
{
  "compilerOptions": {
    "types": ["vite/client"],
    ...
  },
  "include": ["src/components/**/*.js", "src/pages/**/*.jsx", "src/Layout.jsx", "src/types/**/*.d.ts"],
  "exclude": [
    "node_modules", "dist", "src/vite-plugins",
    "src/components/ui", "src/api", "src/lib",
    "src/**/__tests__/**", "src/**/*.test.jsx", "src/**/*.test.js"
  ]
}
```

- `types: ["vite/client"]` — `import.meta.env.VITE_*` erişimi olmadan her env kullanımı hata verir.
- Test dosyaları (`__tests__/`, `*.test.jsx`) **kasıtlı olarak dışarıda** — `vitest`/`@testing-library/jest-dom` global matcher'ları (`toBeInTheDocument` vb.) `chai`'nin tipleriyle çakışıyor, binlerce sahte hata üretiyor. Test dosyalarının kendi doğruluğu Vitest'in kendisi tarafından garanti edilir, `tsc` değil.
- `src/api` ve `src/lib` exclude ama **içindekiler yine de tüketen dosyalardan denetlenir** — `dalClient.js`'teki bir fonksiyonun JSDoc'u yanlışsa, `dalClient.js`'in kendisi hata vermez ama onu çağıran `pages/*.jsx` hata verir. Yani bu dosyaları JSDoc'suz/gevşek bırakmak hatayı **kendi üzerinden değil çağıranlar üzerinden** üretir — kaynağı bulmak zorlaşır. `src/api/dalClient.js` ve `src/lib/**` yeni fonksiyon eklerken yine de doğru JSDoc yaz (bkz. aşağıki bölüm).

### 3. `src/types/global.d.ts` — ambient tipler

Runtime'da var olan ama TS'in bilmediği global'ler burada tanımlanır (üçüncü parti scriptlerin eklediği `window.*` alanları, hata nesnelerinin gerçek şekli):

```ts
interface Error {
  response?: { status?: number; data?: any; retryAfter?: number };
  code?: string;
  status?: number;
  data?: any;
}

interface Window {
  turnstile?: any;
  __turnstileOnLoad?: () => void;
  __sinavSalonuOffline?: boolean;
}
```

**Ne zaman genişletilir:** Axios/fetch hata nesnesinden yeni bir alan okumaya başladığında (`err.someNewField`) veya `window.<yeniScript>` global'i eklendiğinde. Tek satırlık ekleme — dosyayı aç, ilgili interface'e alan ekle.

## JSDoc Disiplini — `dalClient.js` ve `src/lib/**`

Bu iki klasör `jsconfig` exclude'unda ama fonksiyon imzaları **tüketen tüm sayfalar için sözleşmedir**. Yanlış/eksik JSDoc → çağıran her yerde hata.

**Opsiyonel obje parametresi olan fonksiyonlar:**

```js
// KÖTÜ — TS obje şeklini boş {} 'den çıkarır, her alan "does not exist" hatası verir
list: async ({ q, limit = 20 } = {}) => { ... }

// İYİ — obje literal yerine destructure + default, ya JSDoc ile tipi belirt
/**
 * @param {{ q?: string, limit?: number }} [params]
 */
list: async (params = {}) => {
  const { q, limit = 20 } = params;
  ...
}
```

Gerçek kural daha basit: **JSDoc'taki `@param` şekli, fonksiyonun gerçekten kabul ettiği ve çağıranların gerçekten gönderdiği alanlarla birebir eşleşsin.** dalClient'ta bu eşleşme 2026-07 öncesi kaymıştı (örn. `notes.create` JSDoc'u `{ body, questionId, testId, attemptId }` diyordu ama `NoteWidget.jsx` `{ source, contextId, contextQuestionId, questionOrder }` da gönderiyordu) — JSDoc'u gerçek çağrı yerlerine göre güncelle, çağrı yerini JSDoc'a göre değil.

**Belirsiz `{}` başlangıçlı state/parametreler:**

```js
// KÖTÜ — TS tipi {} olarak donar, sonraki alan atamaları hata verir
const [formData, setFormData] = useState({});
mutationFn: ({ id, body }) => api.update(id, body),

// İYİ — checkJs'e "buraya güvenme" de
const [formData, setFormData] = useState(/** @type {any} */ ({}));
mutationFn: (/** @type {any} */ { id, body }) => api.update(id, body),
```

Bu `any` cast'i "tip güvenliğini kapat" değil — proje zaten TS'e geçmediği için bu veri yapıları büyük ölçüde dinamik. Amaç gürültüyü susturup gerçek hataları görünür bırakmak.

## TanStack Query v5 Pattern'leri

`refetchInterval` callback imzası, `keepPreviousData`, `useQuery` `onSuccess`/`onError` kaldırılması gibi v4→v5 farkları **davranış hatası** kaynağıdır, sadece typecheck değil — detaylı örnekler ve doğru pattern'ler için `react-component` skill'i, "TanStack Query v5 — Bilinen Tuzaklar" bölümü.

## Enforcement — Pre-commit

`.lintstagedrc.cjs`'te frontend JS/JSX staged olduğunda **hem ESLint hem `npm run typecheck`** çalışır (backend'in `tsc --noEmit` pattern'iyle simetrik — tek dosya değil, tüm proje kontrol edilir çünkü tsc staged dosya argümanı kabul etmez ve tip hataları dosya sınırını aşabilir).

```js
'apps/frontend/**/*.{js,jsx}': (files) => {
  if (files.length === 0) return [];
  const args = files.map((f) => `"${f}"`).join(' ');
  return [
    `node scripts/lint-staged-frontend.js ${args}`,
    'npm --prefix apps/frontend run typecheck',
  ];
},
```

Bu adım ~50 saniye sürer (backend tsc ~39 saniye ile aynı mertebede) — mevcut pre-commit maliyetine büyük bir ek değil, ama commit'i bekletir. `git commit --no-verify` ile atlanabilir ama **önerilmez**: bu tam olarak 4266 hatanın nasıl biriktiğidir.

## Yeni Dosya/Değişiklik Checklist

- [ ] `cd apps/frontend && npm run typecheck` değişiklikten sonra 0 hata mı?
- [ ] Yeni `components/ui/*.jsx` eklediysen `node scripts/generate-ui-dts.mjs` çalıştırdın mı?
- [ ] `dalClient.js`'e yeni fonksiyon eklediysen JSDoc gerçek çağrı şekliyle eşleşiyor mu (opsiyonel alanlar `?` ile)?
- [ ] `useQuery`'ye `onSuccess`/`onError` yazmadın mı (v5'te ölü kod)?
- [ ] `refetchInterval` fonksiyon formu `(query) => query.state.data...` mı (`(data) => data...` değil)?
- [ ] `keepPreviousData: true` yerine `placeholderData: keepPreviousData` mi?
- [ ] Belirsiz `{}`/destructure parametreleri gerekiyorsa `/** @type {any} */` ile işaretlendi mi?
- [ ] `window.<yeni-global>` veya `err.<yeni-alan>` kullandıysan `src/types/global.d.ts`'e eklendi mi?

İlgili skill'ler: `react-component` (TanStack Query v5 detayları + component pattern'leri), `coverage-discipline` (test/coverage disiplini — bu skill'in test-dosyası-hariç-tutma mantığıyla birlikte okunmalı).
