import { PublishTestUseCase } from '../../src/application/use-cases/test/PublishTestUseCase';
import { UnpublishTestUseCase } from '../../src/application/use-cases/test/UnpublishTestUseCase';

// QueueService mock — UnpublishTestUseCase içinde dinamik require ile çağrılır;
// gerçek bağlantı olmadığında 20sn timeout'a düşmemesi için mock edilir.
// Prisma mock — PublishTestUseCase kill-switch icin adminSettings okur; gercek client gerekmez
jest.mock('../../src/infrastructure/database/prisma', () => ({
  prisma: {
    adminSettings: {
      findFirst: jest.fn(async () => ({ id: 1, testPublishingEnabled: true })),
    },
    follow: {
      findMany: jest.fn(async () => []),
    },
  },
}));

jest.mock('../../src/infrastructure/queue/queue.service', () => ({
  QueueService: jest.fn().mockImplementation(() => ({
    enqueueJob: jest.fn().mockResolvedValue(undefined),
  })),
}));

class FakeExamRepo {
  private store: any = {};
  async findById(id: string) {
    return this.store[id] ?? null;
  }
  async publish(id: string) {
    const t = this.store[id];
    if (!t) return null;
    t.publishedAt = new Date();
    t.status = 'PUBLISHED';
    return t;
  }
  async unpublish(id: string) {
    const t = this.store[id];
    if (!t) return null;
    t.publishedAt = null;
    t.status = 'DRAFT';
    return t;
  }
  seed(test: any) {
    this.store[test.id] = test;
  }
}

class FakeAuditRepo {
  created: any[] = [];
  async create(input: any) {
    this.created.push(input);
    return input;
  }
}

describe('Publish/Unpublish UseCases', () => {
  it('publishes when rules satisfied and logs audit', async () => {
    const repo = new FakeExamRepo();
    const audit = new FakeAuditRepo();
    const approvedEducator = { id: 'e1', role: 'EDUCATOR', status: 'ACTIVE', educatorApprovedAt: new Date() };
    const userRepo = { findById: async (id: string) => (id === 'e1' ? approvedEducator : null) };
    const test = { id: 't1', title: 'T', educatorId: 'e1', examTypeId: 'et1', questions: [{ id: 'q1', options: [{ id: 'o1', isCorrect: true }, { id: 'o2' }] }, { id: 'q2', options: [{ id: 'o3', isCorrect: true }, { id: 'o4' }] }, { id: 'q3', options: [{ id: 'o5', isCorrect: true }, { id: 'o6' }] }, { id: 'q4', options: [{ id: 'o7', isCorrect: true }, { id: 'o8' }] }, { id: 'q5', options: [{ id: 'o9', isCorrect: true }, { id: 'o10' }] }] };
    repo.seed(test);
    const uc = new PublishTestUseCase(repo as any, audit as any, userRepo as any);
    const published = await uc.execute('t1', 'e1');
    expect(published.publishedAt).toBeTruthy();
    expect(audit.created.length).toBe(1);
  });

  it('unpublishes and logs audit', async () => {
    const repo = new FakeExamRepo();
    const audit = new FakeAuditRepo();
    const test = { id: 't2', title: 'T2', questions: [{ id: 'q1', options: [{ id: 'o1', isCorrect: true }, { id: 'o2' }] }, { id: 'q2', options: [{ id: 'o3', isCorrect: true }, { id: 'o4' }] }, { id: 'q3', options: [{ id: 'o5', isCorrect: true }, { id: 'o6' }] }, { id: 'q4', options: [{ id: 'o7', isCorrect: true }, { id: 'o8' }] }, { id: 'q5', options: [{ id: 'o9', isCorrect: true }, { id: 'o10' }] }], educatorId: 'e2', publishedAt: new Date(), status: 'PUBLISHED' };
    repo.seed(test);
    const uc = new UnpublishTestUseCase(repo as any, audit as any);
    const res = await uc.execute('t2', 'e2');
    expect(res.publishedAt).toBeNull();
  });
});
