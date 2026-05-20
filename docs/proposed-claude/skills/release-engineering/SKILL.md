---
name: release-engineering
description: Dependabot konfigürasyonu, branch protection, conventional commits + commitlint, CHANGELOG otomasyonu (changesets/semantic-release), PR/issue şablonları, release süreci (image promotion), DORA metrikleri. Versiyon yayını, sürüm süreci tasarımı, CI/CD policy yazımı yapılırken referans alın.
---

# Release Engineering — Sınav Salonu

KALITE-DEGERLENDIRME §12 "Süreç Kalitesi 7/10"'u 9/10'a taşıyacak rehber. Tek geliştirici de çalışsa süreç disiplini hata kapatır.

## 1. Dependabot (haftalık, gruplu)

`.github/dependabot.yml`:

```yaml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/apps/backend"
    schedule:
      interval: "weekly"
      day: "monday"
      time: "06:00"
      timezone: "Europe/Istanbul"
    open-pull-requests-limit: 10
    groups:
      backend-prod-minor-patch:
        dependency-type: "production"
        update-types: ["minor", "patch"]
      backend-dev-minor-patch:
        dependency-type: "development"
        update-types: ["minor", "patch"]
      backend-major:
        update-types: ["major"]
    commit-message:
      prefix: "chore(backend-deps)"
    labels:
      - "dependencies"
      - "backend"

  - package-ecosystem: "npm"
    directory: "/apps/frontend"
    schedule:
      interval: "weekly"
      day: "monday"
      time: "06:00"
      timezone: "Europe/Istanbul"
    open-pull-requests-limit: 10
    groups:
      frontend-prod-minor-patch:
        dependency-type: "production"
        update-types: ["minor", "patch"]
      frontend-dev-minor-patch:
        dependency-type: "development"
        update-types: ["minor", "patch"]
      frontend-major:
        update-types: ["major"]
    commit-message:
      prefix: "chore(frontend-deps)"
    labels:
      - "dependencies"
      - "frontend"

  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
    commit-message:
      prefix: "chore(ci)"
    labels:
      - "dependencies"
      - "ci"

  - package-ecosystem: "docker"
    directory: "/infra/docker"
    schedule:
      interval: "monthly"
    commit-message:
      prefix: "chore(docker)"
```

### Auto-merge minor/patch

`.github/workflows/dependabot-auto-merge.yml`:

```yaml
name: Dependabot auto-merge
on: pull_request_target

permissions:
  contents: write
  pull-requests: write

jobs:
  auto-merge:
    runs-on: ubuntu-latest
    if: github.actor == 'dependabot[bot]'
    steps:
      - id: meta
        uses: dependabot/fetch-metadata@v2
      - name: Approve
        if: steps.meta.outputs.update-type == 'version-update:semver-patch' || steps.meta.outputs.update-type == 'version-update:semver-minor'
        run: gh pr review --approve "$PR_URL"
        env:
          PR_URL: ${{ github.event.pull_request.html_url }}
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      - name: Enable auto-merge
        if: steps.meta.outputs.update-type == 'version-update:semver-patch' || steps.meta.outputs.update-type == 'version-update:semver-minor'
        run: gh pr merge --auto --squash "$PR_URL"
        env:
          PR_URL: ${{ github.event.pull_request.html_url }}
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

## 2. Branch Protection (main)

GitHub Settings → Branches → Add rule → `main`:

- ✅ Require pull request before merging (1 approval)
- ✅ Dismiss stale approvals on new commit
- ✅ Require status checks to pass: `backend-migrate-and-test`, `docker`, `frontend-test`, `frontend-build`
- ✅ Require branches to be up to date before merging
- ✅ Require linear history
- ✅ Require signed commits (opsiyonel ama önerilir)
- ✅ Restrict who can push to matching branches (Admin'ler `bypass` ile)
- ❌ Allow force pushes (asla)
- ❌ Allow deletions (asla)

Bunu IaC olarak da yazılabilir (Terraform `github_branch_protection`).

## 3. Conventional Commits + commitlint

```bash
npm i -D @commitlint/cli @commitlint/config-conventional husky
npx husky add .husky/commit-msg 'npx --no -- commitlint --edit "$1"'
```

`commitlint.config.cjs`:

```js
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [2, 'always', [
      'feat', 'fix', 'docs', 'style', 'refactor',
      'perf', 'test', 'build', 'ci', 'chore', 'revert',
    ]],
    'scope-enum': [2, 'always', [
      'backend', 'frontend', 'infra', 'ci', 'docs',
      'auth', 'test', 'purchase', 'live', 'admin', 'live-session',
      'attempt', 'discount', 'objection', 'refund', 'ad', 'package',
      'review', 'contract', 'report', 'notification', 'security',
      'a11y', 'i18n', 'observability', 'deps',
    ]],
    'header-max-length': [2, 'always', 100],
  },
};
```

Geçerli örnekler:

```
feat(purchase): idempotency-key support
fix(backend): N+1 query in ListPublishedTests
docs(observability): add runbook for db-down
chore(backend-deps): bump prisma to 5.20
```

## 4. PR Template

`.github/pull_request_template.md`:

```markdown
## Özet
<!-- Ne değiştirdin? 2-3 cümle. -->

## Etkilenen Alanlar
- [ ] Backend (use case / controller / migration)
- [ ] Frontend (sayfa / component)
- [ ] Infra / CI
- [ ] Dokümantasyon
- [ ] Test

## Test
- [ ] Unit test eklendi / güncellendi
- [ ] E2E (Playwright) eklendi / güncellendi
- [ ] a11y testi gerekiyorsa eklendi
- [ ] Manuel test edildi

## Breaking Change
- [ ] Hayır
- [ ] Evet → CHANGELOG'a `BREAKING CHANGE` notu eklendi

## Migration / Veri
- [ ] Migration yok
- [ ] Migration var → ek review label'ı atandı (`needs-migration-review`)
- [ ] Geri alınabilir (rollback planı): ...

## Güvenlik
- [ ] Yetki kontrolü gerekiyor mu? Test edildi mi?
- [ ] Yeni dependency var mı? `npm audit` temiz mi?
- [ ] PII handling değişti mi?

## Ekran Görüntüleri (UI değişikliği)
<!-- before/after -->
```

## 5. Issue Template

`.github/ISSUE_TEMPLATE/bug.md`:

```markdown
---
name: Bug
about: Hata bildirimi
labels: bug
---

**Beklenen davranış**
**Gerçekleşen davranış**
**Yeniden üretme adımları**
1.
2.
3.

**Ortam**
- Tarayıcı / Cihaz:
- Kullanıcı rolü:
- Tenant:

**Sentry / log link**
```

`.github/ISSUE_TEMPLATE/feature.md`, `.github/ISSUE_TEMPLATE/security.md` (security için private vulnerability reporting tercih).

## 6. CHANGELOG Otomasyonu

İki seçenek:

### a) Changesets (önerilen — monorepo dostu)

```bash
npm i -D @changesets/cli
npx changeset init
```

Her PR'da geliştirici `npx changeset` ile değişikliği yazar:

```md
---
'@sinavsalonu/backend': minor
'@sinavsalonu/frontend': patch
---

feat(purchase): idempotency-key support
```

Release workflow:

```yaml
# .github/workflows/release.yml
name: Release
on:
  push:
    branches: [main]

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - uses: changesets/action@v1
        with:
          publish: npm run release
          version: npm run changeset:version
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### b) semantic-release (commit message tabanlı)

Conventional commits'ten otomatik sürüm + CHANGELOG. PR template'i daha hafif.

## 7. Release Süreci (image promotion)

```
[main push] → CI build → Docker image (tag: SHA) → Staging deploy (SHA)
       └─ Manual approval → Production deploy (SAME SHA — yeniden build YOK)
```

`docker.yml` workflow'una `workflow_dispatch` ile environment seçimi:

```yaml
on:
  workflow_dispatch:
    inputs:
      env:
        type: choice
        options: [staging, production]
      sha:
        description: 'Image SHA (default: HEAD)'

jobs:
  deploy:
    environment: ${{ inputs.env }}  # production environment'da required reviewers var
    steps:
      - name: Pull existing image
        run: docker pull ghcr.io/${{ github.repository }}:${{ inputs.sha }}
      - name: Tag and push to ${{ inputs.env }}
        run: |
          docker tag ghcr.io/${{ github.repository }}:${{ inputs.sha }} \
                     ghcr.io/${{ github.repository }}:${{ inputs.env }}
          docker push ghcr.io/${{ github.repository }}:${{ inputs.env }}
```

## 8. Migration Safety Check

PR'a Prisma migration eklendiğinde otomatik label + ekstra review:

`.github/workflows/migration-check.yml`:

```yaml
name: Migration safety check
on: pull_request

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - name: Detect migration files
        id: detect
        run: |
          changed=$(git diff --name-only origin/${{ github.base_ref }}...HEAD | grep '^apps/backend/prisma/migrations/' || true)
          echo "files=$changed" >> $GITHUB_OUTPUT
      - name: Add label
        if: steps.detect.outputs.files != ''
        uses: actions-ecosystem/action-add-labels@v1
        with:
          labels: needs-migration-review
      - name: Detect destructive ops
        if: steps.detect.outputs.files != ''
        run: |
          if grep -E 'DROP COLUMN|DROP TABLE|ALTER TYPE' ${{ steps.detect.outputs.files }}; then
            echo "::error::Destructive migration detected — needs ops sign-off"
            exit 1
          fi
```

## 9. Performance Budget

CI'da:

- **Bundle size:** `dist/assets/*.js` toplam < 500KB gz (mevcut bundle analyzer artifact kullan).
- **Lighthouse:** Home, Explore, Login için Performance ≥ 80, Accessibility ≥ 95.

```yaml
# .github/workflows/perf-budget.yml (frontend deploy sonrası)
- name: Lighthouse CI
  uses: treosh/lighthouse-ci-action@v11
  with:
    urls: |
      https://staging.sinavsalonu.com/
      https://staging.sinavsalonu.com/Explore
      https://staging.sinavsalonu.com/Login
    budgetPath: .lighthouserc.json
    uploadArtifacts: true
```

## 10. DORA Metrikleri

Ölç ve dashboard'a yansıt:

| Metric | Tanım | Hedef |
|---|---|---|
| Deployment Frequency | Üretim deploy / hafta | ≥ 5 |
| Lead Time for Changes | Commit → prod median | < 24h |
| MTTR (Mean Time to Restore) | Incident süresi median | < 1h |
| Change Failure Rate | Hotfix gerektiren deploy oranı | < %15 |

Bunlar GitHub API + Sentry release ID + statuspage'den otomatik çekilebilir.

## Checklist (release süreci sağlık)

- [ ] `.github/dependabot.yml` var mı?
- [ ] Branch protection main üzerinde aktif mi?
- [ ] CHANGELOG son release ile güncel mi?
- [ ] Conventional commits zorunlu mu (commitlint)?
- [ ] PR template uygulanıyor mu?
- [ ] Security workflow (Trivy/audit) yeşil mi?
- [ ] Last 30 gün DORA metrikleri targetin üzerinde mi?

İlgili skill'ler: `observability` (deploy sonrası health), `security-hardening` (dependency scan).
