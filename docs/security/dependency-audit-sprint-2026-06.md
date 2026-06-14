# Bağımlılık Güvenlik Sprinti — 2026-06

`npm audit` high/critical açıklarının temizlenmesi + CI denetim kapısının canlı ama
yeşil hale getirilmesi.

## Kök sebep (asıl CI kırmızısı)

`backend-migrate-and-test.yml` job'ı **ilk adımda `npm ci` ile** patlıyordu:

```
@nestjs/serve-static@^5.0.5  →  peer @nestjs/common@^11   (proje Nest 10'da)
ERESOLVE could not resolve  →  npm ci exit 1  →  build_test job FAIL
```

- `@nestjs/serve-static` kodda **hiç kullanılmıyordu** (ölü bağımlılık).
- Staging Docker `npm ci --legacy-peer-deps` kullandığından deploy etkilenmiyordu;
  yalnız CI'nın düz `npm ci`'si kırılıyordu.
- **Çözüm:** ölü dep kaldırıldı → `npm ci` exit 0.

## Uygulanan güvenli düzeltmeler

| Alan | Önce | Sonra | Yöntem |
|---|---|---|---|
| Backend | 10 high, 0 critical | **4 high, 0 critical** | `@nestjs/serve-static` sil + `npm audit fix` (esbuild/minimatch/path-to-regexp/picomatch/tsx) + nodemailer 6→9 |
| Frontend | 8 high, 2 critical | **3 high, 1 critical** | `npm audit fix` (axios/dompurify/lodash/jspdf/flatted/react-router…) |

- **nodemailer 6→9:** SMTP command injection + addressparser DoS giderildi (runtime,
  `SmtpProvider`). API stabil — tsc temiz, 2314 backend testi geçti.
- Doğrulama: backend tsc+build+2314 test; frontend build+247 test — hepsi yeşil.

## Kabul edilen residual'lar (allowlist)

Aşağıdakiler ya yalnız **dev/test araçlarında**, ya **NestJS 10→11 majör geçişi**
gerektiriyor, ya da **npm düzeltmesi yok**. `.audit-allowlist.json` (her app) +
`scripts/ci-audit-gate.cjs` ile CI yeşil kalır; **yeni** high/critical yine bloklar.

### Backend
| Paket | Advisory | Neden bekliyor |
|---|---|---|
| lodash | GHSA-r5fr / f23m / xxjr | `@nestjs/swagger@7` transitive; NestJS 11 + swagger 11 ile çözülür. `_.template` (r5fr) npm-fix yok, yalnız OpenAPI üretiminde. |
| multer | GHSA-xf7r / v52c / 5528 | `@nestjs/platform-express@10` multer@1 bundle'ı; bağımsız override tree'yi bozuyor → NestJS 11 (multer 2) gerekli. |
| tmp | GHSA-52f5 / ph9p | yalnız `@stryker-mutator` (mutation testing, **dev-only**); üretimde yok. |

### Frontend
| Paket | Advisory | Neden bekliyor |
|---|---|---|
| esbuild | GHSA-67mh / gv7w | yalnız **dev sunucusu** (vite/vitest); üretim derlemesinde etkisi yok. vite@8. |
| vite | GHSA-4w7w | optimized-deps path traversal, yalnız **dev sunucusu** (üretimde nginx statik servis). vite@8. |
| vitest | GHSA-5xrq (critical) | vitest **UI sunucusu**; CI/üretimde UI açılmaz. vitest@4. |
| xlsx | GHSA-4r6h / 5pgg | SheetJS npm yayınını bıraktı → **düzeltme yok**. Uygulama yalnız Excel **üretiyor** (export), güvensiz dosya **parse etmiyor** → istismar yüzeyi yok. |

## Sonraki sprint — planlanan iş

1. **NestJS 10 → 11 geçişi** (express 5 dahil): lodash, multer, @nestjs/platform-express,
   body-parser, qs, js-yaml high/moderate'lerini kapatır. Express 5 routing/middleware
   kırıcı değişiklikleri gerçek HTTP testleriyle doğrulanmalı — ayrı, dikkatli sprint.
2. **Frontend dev araç majörleri:** vite@8 + vitest@4 (build/PWA/brotli + test config
   regresyon testi). Yalnız dev-only açıklar olduğu için düşük öncelik.
3. **xlsx → exceljs** değerlendirmesi (bakımlı alternatif) veya kullanımın export-only
   kaldığının teyidi.

## CI denetim kapısı

`scripts/ci-audit-gate.cjs`: `npm audit --json` çalıştırır, `.audit-allowlist.json`
dışındaki high/critical'da exit 1. `backend-migrate-and-test.yml → security_audit`
job'ı bunu kullanır. Allowlist kayıtları `reviewBy: 2026-09-14` ile işaretli —
o tarihte (veya NestJS 11 sprintinde) yeniden değerlendirilecek.
