# Özet

<!--
Bu PR ne değiştiriyor? 2-3 cümle. Issue varsa "Closes #123" satırı ekle.
-->

## Etkilenen Alanlar

<!-- İlgili kutuları işaretle -->

- [ ] Backend (use case / controller / service / migration)
- [ ] Frontend (sayfa / component / API client)
- [ ] Veritabanı şeması (Prisma migration)
- [ ] Infra / CI (`infra/`, `.github/workflows/`, Docker)
- [ ] Dokümantasyon (`docs/`, `CLAUDE.md`, `README.md`)
- [ ] Test (unit / integration / e2e / a11y)
- [ ] Skill veya agent (`.claude/`)

## Domain Kapsamı

<!-- Etkilenen domain'leri işaretle (CLAUDE.md sözlüğüyle uyumlu) -->

- [ ] auth
- [ ] educator
- [ ] test / question / attempt
- [ ] purchase / refund / discount
- [ ] review / objection
- [ ] ad / package / live
- [ ] admin / contract / report / notification

## Test

- [ ] Unit test eklendi veya güncellendi
- [ ] Integration / E2E (Playwright) eklendi veya güncellendi
- [ ] A11y testi gerekiyorsa `e2e/specs/a11y.spec.js`'e eklendi
- [ ] Manuel test edildi (adımlar yorum olarak veya aşağıda)
- [ ] Test eklenmedi çünkü: _açıkla_

## Breaking Change

- [ ] Hayır
- [ ] Evet → CHANGELOG'a `BREAKING CHANGE` notu eklendi ve aşağıda açıklandı

<!-- Breaking change varsa: -->

## Migration / Veri

- [ ] Migration yok
- [ ] Migration var → `needs-migration-review` label'ı atandı
- [ ] Geri alınabilir mi? Rollback planı:
- [ ] Veri backfill gerekli mi? Script:

## Güvenlik

- [ ] Yeni endpoint mu? `@Roles()` + permission matrix testi eklendi mi?
- [ ] PII / hassas alan değişti mi? Sentry filter ve log'lar gözden geçirildi mi?
- [ ] Yeni dependency var mı? `npm audit` yeşil mi?
- [ ] Idempotency / webhook eklendiyse `IdempotencyInterceptor` ve imza doğrulama var mı?
- [ ] Kullanıcı içeriği render ediliyorsa `DOMPurify` zorunlu mu?

## Performans

- [ ] Yeni Prisma sorgusu cursor pagination'da mı (büyüyebilecek liste)?
- [ ] WHERE + ORDER BY composite index'i Prisma şemasında var mı?
- [ ] N+1 riski denetlendi mi?
- [ ] Yeni sayfa `pages.config.js`'te lazy import mu?

## Ekran Görüntüleri / Demo

<!-- UI değişikliği varsa: before/after veya kısa kayıt -->

## Kontrol Listesi (yazılım kuralları)

- [ ] Pre-commit hook'lar yeşil (`tsc --noEmit`, eslint)
- [ ] CLAUDE.md kodlama kurallarına uyumlu (controller ince, use case'te iş mantığı, DTO + validator)
- [ ] Dark mode için `dark:` utility eklendi (UI değişikliği varsa)
- [ ] Yeni sayfa `routeRoles.js` ve `pages.config.js`'e kaydedildi
- [ ] API çağrıları sadece `dalClient.js` üzerinden
- [ ] Türkçe/İngilizce ayrımı: kod İngilizce, UI Türkçe

---

<!-- Reviewer için not: -->
<!-- @code-reviewer agent ile inceleme istenebilir: /review -->
