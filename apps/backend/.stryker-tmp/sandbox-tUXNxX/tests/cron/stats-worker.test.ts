// @ts-nocheck
const { makeStatsJobHandler } = require('../../src/infrastructure/queue/stats.worker');

describe('stats worker handler', () => {
  test('calls processor with prisma and testId', async () => {
    const fakePrisma = {};
    const processor = jest.fn().mockResolvedValue({ ok: true });
    const handler = makeStatsJobHandler(fakePrisma, processor);
    const job = { data: { testId: 't1' } };
    await handler(job);
    expect(processor).toHaveBeenCalledWith(fakePrisma, 't1');
  });

  test('throws when missing testId', async () => {
    const fakePrisma = {};
    const processor = jest.fn();
    const handler = makeStatsJobHandler(fakePrisma, processor);
    const job = { data: {} };
    await expect(handler(job)).rejects.toThrow('MISSING_TEST_ID');
  });
});

