#!/usr/bin/env ts-node
// @ts-nocheck
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  const prisma = new PrismaClient();
  const report: { nullPriceTests: string[] } = { nullPriceTests: [] };
  try {
    const tests = await prisma.examTest.findMany({ select: { id: true, priceCents: true } });
    for (const t of tests) {
      if (t.priceCents === null || typeof t.priceCents === 'undefined') {
        report.nullPriceTests.push(t.id);
        console.warn(`Test ${t.id} has null priceCents`);
      }
    }
    const outDir = path.join(process.cwd(), 'apps', 'backend', 'scripts', 'reports');
    fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, `price-backfill-report-${Date.now()}.json`);
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');
    console.log(`Report written to ${outPath}`);
    console.log(`Found ${report.nullPriceTests.length} tests with null priceCents.`);
  } catch (e) {
    console.error('Backfill price cents failed', e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();

