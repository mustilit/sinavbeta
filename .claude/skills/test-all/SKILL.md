---
name: test-all
description: Sınav Salonu projesindeki tüm testleri (backend Jest, frontend Vitest, Playwright e2e + a11y, typecheck, lint) sırayla, izole ve loglanmış biçimde çalıştırır. Sandbox sağlığı bozulursa erken durur, kısmi sonuçları gizlemez. Scheduled / autonomous çalıştırmalar için optimize edilmiştir.
---

# Tüm Testleri Çalıştır (test-all)

Bu skill scheduled / autonomous bir agent çağrıldığında doğru sıralamayı ve hata-yönetimini garanti eder. **Önce çalıştır, sonra rapor yaz** — testleri çalıştırmadan "büyük ihtimalle geçer" demek YASAK.

## 0) Preflight — Sandbox sağlık kontrolü (ZORUNLU İLK ADIM)

```bash
echo preflight-ok && uname -a
```

- Komut **başarısız olursa** (örnek hatalar: `useradd failed: input/output error`, `Workspace still starting`, `RPC error`), 5 saniye bekle ve `echo preflight-ok` komutunu **3 kere daha** tekrarla.
- 4 deneme sonunda hâlâ başarısızsa: **DUR, testleri çalıştırma**. Doğrudan "Sandbox unavailable" raporu üret (bkz. §6). Asla "muhtemelen geçti", "kısmen koştu" gibi varsayımlarla rapor yazma.
- Başarılıysa devam.

## 1) Çalıştırma Sırası

Sırayla, **her biri ayrı bash çağrısında**, çıktıyı tam yakala:

| # | Adım | Komut | Beklenen sonuç |
|---|---|---|---|
| 1 | Backend typecheck | `cd /sessions/sweet-sleepy-maxwell/mnt/dal/apps/backend && npx tsc --noEmit` | exit 0 |
| 2 | Backend Jest | `cd /sessions/sweet-sleepy-maxwell/mnt/dal/apps/backend && npm test --silent 2>&1 \| tail -200` | "Tests: X passed" |
| 3 | Frontend lint | `cd /sessions/sweet-sleepy-maxwell/mnt/dal/apps/frontend && npm run lint --silent` | exit 0 |
| 4 | Frontend typecheck | `cd /sessions/sweet-sleepy-maxwell/mnt/dal/apps/frontend && npm run typecheck` | exit 0 |
| 5 | Frontend Vitest | `cd /sessions/sweet-sleepy-maxwell/mnt/dal/apps/frontend && npm run test:run --silent` | "Test Files X passed" |
| 6 | Playwright a11y | `cd /sessions/sweet-sleepy-maxwell/mnt/dal/apps/frontend && npx playwright install --with-deps chromium && npm run test:e2e:a11y` | exit 0 |
| 7 | Playwright e2e (full) | `cd /sessions/sweet-sleepy-maxwell/mnt/dal/apps/frontend && npm run test:e2e` | exit 0 |

**Önemli:** Cowork bash 45 saniye timeout'la sınırlı. Bir suite 45s'yi aşıyorsa:
- Jest için `--testPathPattern` ile parçala (örn. `--testPathPattern=tests/usecases/auth`).
- Vitest için klasör bazlı tek tek koş: `npm run test:run -- src/pages` gibi.
- Playwright için `--shard 1/N` kullan.

## 2) Hata Tespit & Düzeltme Döngüsü

Adımlardan biri başarısız olursa:

1. Çıktının **son 50 satırını** sakla; ilk başarısız test/dosyayı tespit et.
2. **Kök neden analizi** yap — yalnızca semptomu yamalama:
   - Import path / module not found → `tsconfig` paths, `package.json` exports kontrol et.
   - Prisma model yok → `prisma generate` ya da migration eksik.
   - Snapshot mismatch → kasıtlıysa `-u`, değilse koda dön.
   - Timeout → testin gerçekten yavaş mı yoksa fixture'da bir DB beklemesi mi olduğunu anla.
3. **Düzeltmeyi uygula** — proje kurallarına uygun (controller'da Prisma yok, `dalClient.js` üzerinden API, lazy import vs.).
4. Yalnızca düzeltilen suite'i yeniden koş, yeşilse adım sırasına geri dön.

## 3) Loglama

Her adımın stdout+stderr'ini şuraya yaz:

```
/sessions/sweet-sleepy-maxwell/mnt/dal/test-runs/<UTC-ISO-tarih>/<step-number>-<step-name>.log
```

Komut şablonu:
```bash
mkdir -p /sessions/sweet-sleepy-maxwell/mnt/dal/test-runs/$(date -u +%Y%m%dT%H%M%SZ)
# her adımdan sonra:
... 2>&1 | tee "$LOG_DIR/03-frontend-lint.log"
```

## 4) Yasaklar

- **`npm install`** çalıştırma — dependency değişikliği başka iş. Eğer `node_modules` eksikse raporda not düş.
- **Test dosyalarını silme** veya geçici skip etme — sorun varsa kaynağı düzelt.
- **`npm test -- -u`** otomatik snapshot güncellemesi YAPMA — sadece kasıtlı snapshot rotasyonu skill'i kullanıldığında.
- **Sandbox arızası varken** "geçti gibi" rapor yazma. Bu en kritik kural.

## 5) Rapor Şablonu

Çalıştırma bittiğinde `C:\Users\mtulu\dal\TEST-ALL-RAPOR-<YYYY-MM-DD>.md` yaz:

```markdown
# test-all Raporu — <tarih>

## TL;DR
- Genel sonuç: PASS / FAIL / PARTIAL
- Çalışan suite sayısı: backend X/Y, frontend X/Y, e2e X/Y

## Adım Sonuçları
| # | Adım | Durum | Süre | Not |

## Karşılaşılan Hatalar ve Çözümler
### <suite-adı> · <hata-başlığı>
- Belirti:
- Kök neden:
- Çözüm (commit/diff özeti):
- Önleyici aksiyon (skill/agent değişikliği var mı?):

## Önleyici Skill/Agent Güncellemeleri
(varsa hangi dosyalar değişti)

## Sonraki Çalıştırma için Notlar
```

## 6) Sandbox Arızası Şablonu

Preflight başarısızsa veya çalıştırma sırasında sandbox iletişim hatası verirse:

```markdown
# test-all Raporu — <tarih> — SANDBOX UNAVAILABLE

## Durum
- Cowork bash sandbox bu oturumda erişilemedi.
- Hata mesajı: <kopyala>
- Deneme sayısı: <N>

## Çalıştırılamayan Suite'ler
backend Jest, frontend Vitest, Playwright e2e — tümü.

## Statik İnceleme
(Read/Glob ile yapılabilen kontroller varsa)

## Kullanıcı Aksiyonu
1. Cowork uygulamasını yeniden başlat veya yeni oturum aç.
2. Kalıcıysa Anthropic'e altyapı raporu aç.
3. Lokal PowerShell ile manuel doğrulama:
   ```powershell
   cd C:\Users\mtulu\dal\apps\backend ; npm test
   cd C:\Users\mtulu\dal\apps\frontend ; npm run test:run
   cd C:\Users\mtulu\dal\apps\frontend ; npm run test:e2e:a11y
   ```
```

## Domain notu

`exam-domain` ve `nestjs-module` skill'lerini referans al — yeni use-case / Prisma model değişikliğinden gelen hatalarda buralardaki kuralları çiğnemiş bir test fix'i hayır.
