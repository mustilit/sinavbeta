#!/usr/bin/env ts-node
// @ts-nocheck
import { PrismaClient } from '@prisma/client';

function parseArg(name: string) {
  const prefix = `--${name}=`;
  const arg = process.argv.find((a) => a.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : undefined;
}

async function main() {
  const testId = parseArg('testId');
  const priceCentsRaw = parseArg('priceCents');
  const currency = parseArg('currency') || 'TRY';

  if (!testId || !priceCentsRaw) {
    console.error('Usage: npm run admin:set-price -- --testId=<id> --priceCents=<int> [--currency=TRY]');
    process.exit(1);
  }

  const priceCents = Number(priceCentsRaw);
  if (!Number.isInteger(priceCents) || priceCents < 0) {
    console.error('priceCents must be a non-negative integer');
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const test = await prisma.examTest.findUnique({ where: { id: testId } });
    if (!test) {
      console.error(`Test ${testId} not found`);
      process.exit(1);
    }

    const oldPrice = (test as any).priceCents ?? null;
    const updated = await prisma.examTest.update({
      where: { id: testId },
      data: { priceCents, currency },
    });

    // create audit log entry
    await prisma.auditLog.create({
      data: {
        action: 'PRICE_CHANGED',
        entityType: 'ExamTest',
        entityId: testId,
        actorId: 'SYSTEM_ADMIN_SCRIPT',
        metadata: { testId, oldPriceCents: oldPrice, newPriceCents: priceCents },
      },
    });

    console.log(`Updated test ${testId}: priceCents ${oldPrice} -> ${priceCents} (${currency})`);
    process.exit(0);
  } catch (e) {
    console.error('Failed to update price', e);
    process.exit(2);
  } finally {
    await prisma.$disconnect();
  }
}

main();

