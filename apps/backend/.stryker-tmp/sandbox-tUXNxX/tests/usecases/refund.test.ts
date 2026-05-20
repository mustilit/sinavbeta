// @ts-nocheck
import { CreateRefundRequestUseCase } from '../../src/application/use-cases/refund/CreateRefundRequestUseCase';
import { ResolveRefundRequestUseCase } from '../../src/application/use-cases/refund/ResolveRefundRequestUseCase';

// Prisma mock — CreateRefundRequestUseCase.getTestIdFromPurchase içinde require ile kullanılır
jest.mock('../../src/infrastructure/database/prisma', () => ({
  prisma: {
    purchase: {
      findUnique: jest.fn().mockResolvedValue({ id: 'p1', testId: 't1', userId: 'c1' }),
    },
  },
}));

test('create refund fails if objections <10', async () => {
  const refundRepo: any = { findByPurchaseId: async () => null, create: async () => null };
  const objectionRepo: any = { countByTestAndCandidate: async () => 5 };
  const auditRepo: any = { create: async () => null };
  const uc = new CreateRefundRequestUseCase(refundRepo, objectionRepo, auditRepo);
  await expect(uc.execute('p1', 'c1')).rejects.toThrow();
});

test('create refund succeeds if objections >=10', async () => {
  const created = { id: 'r1', purchaseId: 'p1', candidateId: 'c1', testId: 't1' };
  const refundRepo: any = { findByPurchaseId: async () => null, create: async () => created };
  const objectionRepo: any = { countByTestAndCandidate: async () => 12 };
  const auditRepo: any = { create: async () => null };
  const uc = new CreateRefundRequestUseCase(refundRepo, objectionRepo, auditRepo);
  const res = await uc.execute('p1', 'c1');
  expect(res).toEqual(created);
});

test('duplicate refund -> conflict', async () => {
  const refundRepo: any = { findByPurchaseId: async () => ({ id: 'r1' }), create: async () => null };
  const objectionRepo: any = { countByTestAndCandidate: async () => 12 };
  const auditRepo: any = { create: async () => null };
  const uc = new CreateRefundRequestUseCase(refundRepo, objectionRepo, auditRepo);
  await expect(uc.execute('p1', 'c1')).rejects.toThrow();
});

test('admin approve -> status updated', async () => {
  const refundRepo: any = { findById: async () => ({ id: 'r1', status: 'PENDING' }), updateStatus: async (id: any, s: any) => ({ id, status: s }) };
  const auditRepo: any = { create: async () => null };
  const queue: any = { enqueueEmail: jest.fn().mockResolvedValue(true) };
  const uc = new ResolveRefundRequestUseCase(refundRepo, auditRepo, queue);
  const res = await uc.execute('r1', 'APPROVED', 'admin1');
  expect(res.status).toBe('APPROVED');
});

test('admin reject -> status updated', async () => {
  const refundRepo: any = { findById: async () => ({ id: 'r1', status: 'PENDING' }), updateStatus: async (id: any, s: any) => ({ id, status: s }) };
  const auditRepo: any = { create: async () => null };
  const uc = new ResolveRefundRequestUseCase(refundRepo, auditRepo);
  const res = await uc.execute('r1', 'REJECTED', 'admin1');
  expect(res.status).toBe('REJECTED');
});
