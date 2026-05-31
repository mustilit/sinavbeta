/**
 * reset.ts — E2E DB reset helper'ları (Sprint 17.2+)
 *
 * Spec'ler state mutasyonu yapar (rejected → pending, attempt oluşturma vb.).
 * beforeAll/afterAll'da pool'u temiz duruma çekmek için kullanılır.
 */
import { execSync } from 'node:child_process';

/** Tüm e2e user pool'unu idempotent yeniden seed et (rejected/pending dahil) */
export function reseedE2EUsers(): void {
  execSync('node ../frontend/e2e/setup/seed-e2e.cjs', {
    cwd: '../backend',
    stdio: 'pipe',
  });
}

/** Bir kullanıcının test attempt'larını sil (fresh state) — e-posta ile */
export function clearAttemptsByEmail(email: string): void {
  const script = `
    const { PrismaClient } = require('@prisma/client');
    const p = new PrismaClient();
    (async () => {
      const u = await p.user.findFirst({ where: { email: '${email}' } });
      if (!u) { await p.$disconnect(); return; }
      const ids = (await p.testAttempt.findMany({ where: { candidateId: u.id }, select: { id: true } })).map(a => a.id);
      if (ids.length) {
        await p.attemptAnswer.deleteMany({ where: { attemptId: { in: ids } } });
        await p.testAttempt.deleteMany({ where: { id: { in: ids } } });
      }
      await p.$disconnect();
    })().catch(e => { console.error(e); process.exit(1); });
  `;
  execSync(`node -e "${script.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`, {
    cwd: '../backend',
    stdio: 'pipe',
  });
}

/** Raw SQL ile bir kullanıcının status'unu set et (enum bypass) */
export function setUserStatusByEmail(email: string, status: string): void {
  const script = `
    const { PrismaClient } = require('@prisma/client');
    const p = new PrismaClient();
    (async () => {
      const rows = await p.$queryRaw\`SELECT id FROM users WHERE email = '${email}' LIMIT 1\`;
      if (rows[0]) {
        await p.$executeRawUnsafe(\`UPDATE users SET status = '${status}'::"UserStatus", "updatedAt" = NOW() WHERE id = $1\`, rows[0].id);
      }
      await p.$disconnect();
    })().catch(e => { console.error(e); process.exit(1); });
  `;
  execSync(`node -e "${script.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`, {
    cwd: '../backend',
    stdio: 'pipe',
  });
}
