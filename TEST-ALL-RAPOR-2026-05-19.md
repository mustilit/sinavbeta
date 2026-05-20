# `test-all` Çalıştırma Raporu — 2026-05-19

> Scheduled task `test-all` otonom modda tetiklendi. Bu rapor, denemeleri, karşılaşılan altyapı hatasını ve önleyici iyileştirmeleri özetler.

## TL;DR

- **Sonuç: BAŞARISIZ — testler çalıştırılamadı.**
- **Kök neden: Cowork Linux sandbox'ı (`mcp__workspace__bash`) bu oturumda hard-down.** Her komut aynı RPC hatasıyla dönüyor: `useradd failed: fork/exec /usr/sbin/useradd: input/output error`. ~20 farklı denemenin tümü aynı sonucu verdi.
- **Etki: `npm test` (Jest), `vitest run`, `playwright test`, `npm run typecheck`, `npm run lint` komutlarının hiçbiri çalıştırılamadı.**
- **Önleyici aksiyon:** Projenin `.claude/skills/` dizinine `test-all` adında yeni bir skill yazıldı; bu skill (a) doğru komut sıralamasını dokümante ediyor, (b) sandbox sağlığı için bir preflight check tanımlıyor, (c) sandbox arızasında alınacak fallback davranışı tarif ediyor.

## 1. Denenen Komutlar ve Sonuçlar

| # | Amaç | Tool | Sonuç |
|---|---|---|---|
| 1 | Çalışma dizinini doğrula | `bash: ls .../dal/` | RPC error: useradd I/O |
| 2 | Sandbox bootstrap | `bash: echo hello` | RPC error: useradd I/O |
| 3 | Kullanıcı bilgisi | `bash: id / whoami` | RPC error: useradd I/O |
| 4 | Daha uzun timeout (45s) | `bash: hostname` | RPC error: useradd I/O |
| 5 | Minimal no-op | `bash: true` / `:` | RPC error: useradd I/O |
| 6–20 | Çeşitli yeniden denemeler | `bash: echo ...` | Tümü RPC error: useradd I/O |

Workspace mount path `/sessions/sweet-sleepy-maxwell/mnt/dal/` doğrulanamadı — bash hiç başlamadığı için.

> Not: Bu, sandbox'ın **boot ettikten sonra** komutun başarısız olması değildir. `useradd` daha kullanıcı oluşturulurken (sandbox'ın başlangıç adımı) host filesystem'de I/O hatası alıyor. Yani sandbox hiç ayağa kalkamadı.

## 2. Statik Analiz Bulguları (Çalıştırılmadan)

Read/Glob/Grep ile inceleme yapıldı.

**Backend (Jest) — `apps/backend/tests/`:** 38 test dosyası mevcut, alt klasörler: `usecases/` (en yoğun), `cron/`, `queue/`, `security/`, `interceptors/`. Komut: `cd apps/backend && npm test` (veya `npm run test:unit` / `test:integration` / `test:smoke`).

**Frontend (Vitest) — `apps/frontend/src/`:** 10 test dosyası: `pages/Login.test.jsx`, `pages/MyResults.test.jsx`, `pages/MyTestPackages.test.jsx`, `pages/Explore.test.jsx`, `pages/Home.test.jsx`, `components/ui/PaymentModal.test.jsx`, `test/smoke/routing.test.jsx`, `test/api/client.test.js`, `test/auth/redirect.test.jsx`, `lib/routeRoles.test.js`. Komut: `cd apps/frontend && npm run test:run`.

**Frontend (Playwright e2e + a11y):** `apps/frontend/e2e/specs/a11y.spec.ts` mevcut. Komut: `npm run test:e2e` ve `npm run test:e2e:a11y`. axe-core ile WCAG 2.1 AA kontrolü yapıyor.

**Tip kontrol & lint:** Backend `npx tsc --noEmit` (pre-commit zaten zorunlu), frontend `npm run lint` ve `npm run typecheck`.

**Runtime hatası tespit edilemedi** çünkü hiçbir suite koşturulamadı. Statik göz taramasında belirgin bir “derhal patlayacak” sözdizim/import sorunu görülmedi; bunu doğrulamanın tek yolu testleri çalıştırmak.

## 3. Önleyici İyileştirmeler

### 3.1 Yeni skill: `C:\Users\mtulu\dal\.claude\skills\test-all\SKILL.md`

Aşağıdaki maddeleri zorunlu kılıyor:

1. **Preflight check:** İlk komut olarak `echo preflight-ok` çalıştır. Hata dönerse 3–5 saniye bekleyip 3 kez tekrar dene. Hâlâ hata dönüyorsa raporu “sandbox unavailable” notuyla yaz ve dur.
2. **Sıra ve izolasyon:** Backend → Frontend Vitest → Frontend lint/typecheck → Playwright e2e. Her adımın `set -e` benzeri davranışla failure detayını yakala.
3. **Long-running koruması:** Playwright ve Jest komutlarına `--runInBand` veya per-shard yaklaşımı, max 45s timeout sınırını göz önüne alarak parça parça çağırma.
4. **Loglama:** Her adımın çıktısını `C:\Users\mtulu\dal\test-runs\<ISO-tarih>\<adım>.log` dosyasına yaz.
5. **Rapor şablonu:** `TEST-ALL-RAPOR-<tarih>.md` dosyası standart başlıklarla — TL;DR, Denemeler, Hatalar+Çözümler, Önleyici Aksiyonlar.

### 3.2 Scheduled task SKILL.md güncellemesi (öneri)

`uploads/SKILL.md` read-only olduğu için yerinde düzenlenemedi. Önerilen yeni içerik `C:\Users\mtulu\dal\test-all-skill-updated.md` olarak kaydedildi; kullanıcı bunu mevcut scheduled task tanımına kopyalayabilir. Eklenen kritik madde:

> Eğer ilk shell komutu altyapı hatasıyla başarısız olursa (ör. "useradd failed: input/output error", "Workspace still starting") en az 3 deneme sonra hâlâ başarısızsa, durumu raporlayıp dur — testleri kısmen çalıştırılmış gibi sunma.

## 4. Kullanıcı için Aksiyon Listesi

1. **Cowork sandbox durumu**: Aynı oturumdaki tüm bash çağrıları başarısız. Cowork uygulamasını yeniden başlatmak, oturumu sıfırlamak veya farklı bir oturum açmak gerekebilir. Eğer kalıcıysa Anthropic'e (Cowork ekibi) altyapı raporu açılması faydalı olur.
2. **Manuel doğrulama**: Sandbox onarılana kadar testleri yerel PowerShell'den çalıştır:
   ```powershell
   cd C:\Users\mtulu\dal\apps\backend ; npm test
   cd C:\Users\mtulu\dal\apps\frontend ; npm run test:run
   cd C:\Users\mtulu\dal\apps\frontend ; npm run test:e2e:a11y
   ```
3. **Yeni skill incelemesi**: `.claude/skills/test-all/SKILL.md` dosyasını gözden geçir; preflight ve loglama davranışını kendi tercihine göre ayarla.

## 5. Çalıştırılamadığı için cevaplanamayan sorular

- Hangi test suite'leri kırık? (bilinmiyor — koşmadı)
- Coverage seviyesi? (bilinmiyor)
- Flaky test var mı? (bilinmiyor)
- Yeni eklenen LiveSession akışının Jest unit suite'inde regresyon var mı? (bilinmiyor)

Bu sorular bash sandbox ayağa kalktığında bir sonraki `test-all` çalışmasında cevaplanmalı.

---

**Rapor durumu:** Otonom çalışma. Kullanıcı mevcut değil. İzin sorulmadı.
**Üretildi:** 2026-05-19, Cowork mode (Sonnet 4.6 / Opus 4.7 düzeyinde Claude).
