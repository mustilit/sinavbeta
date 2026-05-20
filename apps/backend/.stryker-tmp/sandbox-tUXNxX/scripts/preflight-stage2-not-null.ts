#!/usr/bin/env ts-node
// @ts-nocheck
import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  try {
    const testsNullPrice = await prisma.examTest.count({ where: { priceCents: null } });
    const testsNullQuestionCount = await prisma.examTest.count({ where: { questionCount: null } });
    const purchasesNullAmount = await prisma.purchase.count({ where: { amountCents: null } });

    let ok = true;
    if (testsNullPrice > 0) {
      ok = false;
      console.error(`ExamTest with null priceCents: ${testsNullPrice}`);
      const rows = await prisma.examTest.findMany({ where: { priceCents: null }, select: { id: true }, take: 10 });
      console.error('Sample testIds with null priceCents:', rows.map((r) => r.id));
    }
    if (testsNullQuestionCount > 0) {
      ok = false;
      console.error(`ExamTest with null questionCount: ${testsNullQuestionCount}`);
      const rows = await prisma.examTest.findMany({ where: { questionCount: null }, select: { id: true }, take: 10 });
      console.error('Sample testIds with null questionCount:', rows.map((r) => r.id));
    }
    if (purchasesNullAmount > 0) {
      ok = false;
      console.error(`Purchase with null amountCents: ${purchasesNullAmount}`);
      const rows = await prisma.purchase.findMany({ where: { amountCents: null }, select: { id: true }, take: 10 });
      console.error('Sample purchaseIds with null amountCents:', rows.map((r) => r.id));
    }

    if (!ok) {
      console.error('Preflight failed: non-zero null counts found. Fix records before running Stage2 migration.');
      process.exit(1);
    }

    console.log('OK for Stage2');
    process.exit(0);
  } catch (e) {
    console.error('Preflight script failed', e);
    process.exit(2);
  } finally {
    await prisma.$disconnect();
  }
}

main();

