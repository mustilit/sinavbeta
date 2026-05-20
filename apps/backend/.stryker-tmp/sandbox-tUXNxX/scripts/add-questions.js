#!/usr/bin/env node
// @ts-nocheck
const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  try {
    // parse testId from arg --testId= or env TEST_ID or positional arg
    const arg = process.argv.find(a => a.startsWith('--testId='));
    const testId = arg ? arg.split('=')[1] : process.env.TEST_ID || process.argv[2];
    if (!testId) {
      console.error('Usage: node scripts/add-questions.js --testId=<TEST_ID>');
      process.exit(1);
    }

    console.log('Adding questions for testId=', testId);

    const existing = await prisma.examQuestion.findMany({ where: { testId } });
    if (existing && existing.length > 0) {
      console.log('Test already has questions, skipping. Count=', existing.length);
      return;
    }

    for (let i = 1; i <= 5; i++) {
      await prisma.examQuestion.create({
        data: {
          testId,
          content: `Seed Question ${i}`,
          order: i,
          options: {
            create: [
              { content: 'Option A', isCorrect: false },
              { content: 'Option B', isCorrect: true },
            ],
          },
        },
      });
      console.log('Created question', i);
    }

    console.log('Done adding questions.');
  } catch (e) {
    console.error('Error adding questions', e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();

