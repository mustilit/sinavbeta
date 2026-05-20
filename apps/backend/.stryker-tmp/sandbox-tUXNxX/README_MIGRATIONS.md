# Migration Runbook — Stage 1 & Stage 2 (Prod-safe)

This runbook describes a safe two-stage migration strategy to add price and questionCount fields without data loss.

Stage 1 — Add nullable fields (safe)
1. Update schema.prisma (already): add fields as nullable.
2. Generate & apply migration (dev):
   - npx prisma migrate dev --name stage1_add_fields_nullable
   - OR in production, use your deploy pipeline with `prisma migrate deploy`
3. Backfill:
   - npm run db:backfill
   - npm run db:backfill:price
   The `db:backfill` script fills `questionCount`.
   The `db:backfill:price` script reports tests with null `priceCents` into `apps/backend/scripts/reports/price-backfill-report-*.json`.
4. Review the price report and fix critical missing prices manually (admin UI or SQL).

Stage 2 — Enforce NOT NULL (only after data cleaned)
1. Ensure there are no tests with null `priceCents` (review report).
2. Update schema.prisma: make `priceCents` and `amountCents` NOT NULL (with default or manual).
3. Create migration:
   - npx prisma migrate dev --name stage2_enforce_not_null
4. Apply in production via your migration deploy process.

Notes & Safety
- Do NOT run stage2 until NULL price entries are fixed.
- Backups: take DB backup before applying migrations in production.
- Tests: run unit & smoke tests after migration.
- If you need assistance creating SQL patches for stage2, request generator of raw SQL.

Preflight & admin fixes
- Before running Stage2 in production, run the preflight guard:
  - npm run db:preflight:stage2
  This will fail if any of the following counts are non-zero:
  - ExamTest.priceCents IS NULL
  - ExamTest.questionCount IS NULL
  - Purchase.amountCents IS NULL

- If preflight fails, inspect the generated reports (apps/backend/scripts/reports/) and fix records.
- You can set prices manually with the admin CLI:
  - npm run admin:set-price -- --testId=<id> --priceCents=<int> [--currency=TRY]
  This will update the price and write an audit log entry (actorId = SYSTEM_ADMIN_SCRIPT).

Stage2 deploy example (prod):
- npm run db:preflight:stage2
- If OK, run migration deploy:
  - npm run db:stage2:apply

CI Gate
-------
- Stage2 migration must be gated by CI. Use the provided GitHub Actions workflow:
  - .github/workflows/backend-migrate-and-test.yml
- The pipeline executes `npm run db:preflight:stage2` before allowing migration deploy.
- The actual migration deploy step is tied to the `production` environment and requires manual approval in GitHub Environments.
- Do NOT run Stage2 directly on prod without first passing the CI preflight.

Drift check
-----------
- The CI pipeline runs `npx prisma migrate status` as a drift check before preflight. If the status indicates drift or unapplied migrations, the pipeline will fail.
- To diagnose drift locally:
  - npx prisma migrate status --schema=apps/backend/prisma/schema.prisma
  - If drift detected: reconcile schema or migrations; consider generating a new migration and testing in dev.
- After resolving drift, re-run the pipeline.

