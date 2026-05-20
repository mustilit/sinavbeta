# Branch Protection Rehberi — `main`

KALITE-DEGERLENDIRME §12 önerisi. GitHub UI üzerinden uygulanır
(`Settings → Branches → Add rule`).

## Önerilen kural — `main`

| Ayar | Değer |
|---|---|
| Branch name pattern | `main` |
| Require a pull request before merging | ✅ |
| Required approvals | **1** (solo geliştirme ise self-approve istemiyorsan 0 ve auto-merge) |
| Dismiss stale pull request approvals when new commits are pushed | ✅ |
| Require review from Code Owners | ✅ (CODEOWNERS dosyası eklendiğinde) |
| Require status checks to pass before merging | ✅ |
| Require branches to be up to date before merging | ✅ |
| Status checks (zorunlu) | `Build & Test`, `Frontend Unit Tests + Coverage`, `Frontend Build + Bundle Analysis`, `Security Audit (npm audit)`, `Frontend A11y (Playwright + axe-core)`, `Smoke - public endpoints static checks` |
| Require conversation resolution before merging | ✅ |
| Require signed commits | ✅ (opsiyonel — kişisel imzalı commit teşviki) |
| Require linear history | ✅ |
| Require deployments to succeed before merging | ❌ (manuel promote akışı kullanılıyor) |
| Lock branch | ❌ |
| Do not allow bypassing the above settings | ✅ (admin bile bypass etmesin) |
| Restrict who can push to matching branches | ✅ — sadece release manager / bot |
| Allow force pushes | ❌ |
| Allow deletions | ❌ |

## Status check isimleri (kopyala-yapıştır)

GitHub UI'da "Search for status checks in the last week" alanına:

- `Build & Test`
- `Frontend Unit Tests + Coverage`
- `Frontend Build + Bundle Analysis`
- `Security Audit (npm audit)`
- `Smoke - public endpoints static checks`
- `E2E Smoke (ephemeral Postgres)`
- `Frontend A11y (Playwright + axe-core)`
- `Stage2 Preflight Guard`

Workflow job adları `.github/workflows/backend-migrate-and-test.yml` ile uyumlu.

## Solo geliştirme modu (geçici)

Tek geliştirici varsa `Required approvals: 0` + `Auto-merge` ile devam edilebilir;
ancak Dependabot otomatik merge için yine de CI yeşil olmalı. PR review zorunluluğu
ekipte 2+ kişi olunca açılır.

## IaC alternatifi (Terraform)

```hcl
resource "github_branch_protection" "main" {
  repository_id = data.github_repository.dal.node_id
  pattern       = "main"

  required_status_checks {
    strict   = true
    contexts = [
      "Build & Test",
      "Frontend Unit Tests + Coverage",
      "Frontend Build + Bundle Analysis",
      "Security Audit (npm audit)",
      "Smoke - public endpoints static checks",
      "E2E Smoke (ephemeral Postgres)",
      "Frontend A11y (Playwright + axe-core)",
    ]
  }

  required_pull_request_reviews {
    dismiss_stale_reviews           = true
    require_code_owner_reviews      = true
    required_approving_review_count = 1
  }

  enforce_admins         = true
  required_linear_history = true
  allows_force_pushes    = false
  allows_deletions       = false
}
```

## CODEOWNERS örneği

`.github/CODEOWNERS`:

```
# Backend genel
/apps/backend/                                    @sinavsalonu/backend-maintainers

# Domain alt klasörler
/apps/backend/src/application/use-cases/auth/     @sinavsalonu/security
/apps/backend/src/application/use-cases/purchase/ @sinavsalonu/payments
/apps/backend/src/application/use-cases/refund/   @sinavsalonu/payments
/apps/backend/src/application/use-cases/live/     @sinavsalonu/live-platform
/apps/backend/src/application/use-cases/admin/    @sinavsalonu/admin

# Migration'lar — ek review zorunlu
/apps/backend/prisma/migrations/                  @sinavsalonu/backend-maintainers @sinavsalonu/ops

# Frontend
/apps/frontend/                                   @sinavsalonu/frontend-maintainers
/apps/frontend/src/api/                           @sinavsalonu/backend-maintainers @sinavsalonu/frontend-maintainers

# Infra & CI
/infra/                                           @sinavsalonu/ops
/.github/workflows/                               @sinavsalonu/ops

# Skill ve agent dosyaları
/.claude/                                         @sinavsalonu/backend-maintainers @sinavsalonu/frontend-maintainers
```

> Team isimleri örnek; gerçek GitHub team handle'ları ile değiştir.

## Doğrulama

`Settings → Branches → Branch protection rules` ekranında kuralın aktif olduğunu
gör. PR aç, mock fail oluştur (örn. `process.exit(1)` ekle), `merge` butonunun
gri kaldığını doğrula.
