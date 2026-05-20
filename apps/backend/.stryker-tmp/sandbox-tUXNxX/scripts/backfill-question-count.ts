#!/usr/bin/env ts-node
// @ts-nocheck
import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  try {
    const tests = await prisma.examTest.findMany({ select: { id: true } });
    console.log(`Found ${tests.length} tests`);
    for (const t of tests) {
      const count = await prisma.examQuestion.count({ where: { testId: t.id } });
      console.log(`Test ${t.id} has ${count} questions`);
      // Update questionCount; if priceCents is null, just log (should be defaulted by migration)
      await prisma.examTest.update({ where: { id: t.id }, data: { questionCount: count } });
    }
    console.log('Backfill complete');
  } catch (e) {
    console.error('Backfill failed', e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();

