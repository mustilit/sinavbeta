# Proposed `.claude/` Eklemeleri — KALITE-DEGERLENDIRME Aksiyonları

Bu klasör, `KALITE-DEGERLENDIRME.md` raporundaki öneriler doğrultusunda **yeni eklenmesi önerilen** skill ve agent dosyalarını içerir. Oturum güvenliği nedeniyle Cowork doğrudan `.claude/` altına yazamadığı için aynı dizin yapısı burada hazırlandı; aşağıdaki komutla aktif `.claude/` ağacına kopyalanır.

## İçerik

```
docs/proposed-claude/
├── agents/
│   └── security-auditor.md           ← YENİ: OWASP/CSRF/XSS/permission matrix denetimi
└── skills/
    ├── coverage-discipline/SKILL.md  ← YENİ: Jest coverage threshold, Stryker mutation
    ├── idempotency/SKILL.md          ← YENİ: Idempotency-Key + webhook HMAC + replay
    ├── observability/SKILL.md        ← YENİ: SLO, circuit breaker, runbook, Sentry derin
    ├── release-engineering/SKILL.md  ← YENİ: Dependabot, conventional commits, CHANGELOG
    └── security-hardening/SKILL.md   ← YENİ: 2FA, audit log, CSRF, file upload, OWASP
```

## Yükleme (PowerShell)

Repo kökünde:

```powershell
Copy-Item -Recurse -Force `
  docs/proposed-claude/skills/*  .claude/skills/

Copy-Item -Force `
  docs/proposed-claude/agents/*.md  .claude/agents/
```

Cmd alternatifi:

```cmd
xcopy /E /I /Y docs\proposed-claude\skills .claude\skills
xcopy /Y       docs\proposed-claude\agents .claude\agents
```

## Sonra

1. `CLAUDE.md` dosyasındaki `## İmportlar` bölümüne yeni skill referansları eklenebilir (opsiyonel — agentlar zaten skill'leri keşfeder).
2. `git add .claude/ docs/proposed-claude/` ile commit.
3. `docs/proposed-claude/` kopyalandıktan sonra silinebilir veya referans olarak tutulabilir.

## Rapor → Skill/Agent eşlemesi

| Rapor maddesi | Eklenen |
|---|---|
| §2 Güvenilirlik — circuit breaker, SLO, runbook | `skills/observability` |
| §5 Bakım — boy/karmaşıklık metrikleri, lint | `skills/coverage-discipline` (kısmen), mevcut `tdd-workflow` ile çakışmaz |
| §7 Güvenlik — 2FA, audit log, CSRF, file upload, OWASP | `skills/security-hardening` + `agents/security-auditor` |
| §9 Kod Kalitesi — mutation test, coverage threshold | `skills/coverage-discipline` |
| §11 Test Kalitesi — coverage, mutation, contract | `skills/coverage-discipline` (mevcut `tdd-workflow` ile tamamlayıcı) |
| §12 Süreç — Dependabot, branch protection, conv. commits, CHANGELOG | `skills/release-engineering` |
| §1+§2 — Webhook + idempotency | `skills/idempotency` |
