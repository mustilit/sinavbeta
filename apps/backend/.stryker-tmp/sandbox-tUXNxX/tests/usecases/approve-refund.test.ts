// @ts-nocheck
import { ApproveRefundUseCase } from '../../src/application/use-cases/refund/ApproveRefundUseCase';

describe('ApproveRefundUseCase', () => {
  const makeProcessor = () => ({ process: jest.fn().mockResolvedValue(undefined) });

  it('calls refundRepo.approve and processor.process on success', async () => {
    const refund = { id: 'r1', purchaseId: 'p1', status: 'EDUCATOR_APPROVED', decidedAt: new Date().toISOString() };
    const approveMock = jest.fn().mockResolvedValue(refund);
    const refundRepo: any = {
      findById: jest.fn().mockResolvedValue(refund),
      approve: approveMock,
    };
    const auditRepo: any = { create: jest.fn().mockResolvedValue(null) };
    const processor = makeProcessor();

    const uc = new ApproveRefundUseCase(refundRepo, auditRepo, processor);
    const result = await uc.execute('r1', 'admin1');

    expect(approveMock).toHaveBeenCalledWith('r1', 'admin1', expect.any(Date));
    expect(processor.process).toHaveBeenCalledWith(refund);
    expect(result.status).toBe('EDUCATOR_APPROVED');
  });

  it('throws UNAUTHORIZED when actorId is missing', async () => {
    const refundRepo: any = { findById: jest.fn() };
    const auditRepo: any = {};
    const processor = makeProcessor();
    const uc = new ApproveRefundUseCase(refundRepo, auditRepo, processor);
    await expect(uc.execute('r1', undefined)).rejects.toThrow();
  });

  it('throws REFUND_NOT_FOUND when refund does not exist', async () => {
    const refundRepo: any = { findById: jest.fn().mockResolvedValue(null) };
    const auditRepo: any = {};
    const processor = makeProcessor();
    const uc = new ApproveRefundUseCase(refundRepo, auditRepo, processor);
    await expect(uc.execute('r1', 'admin1')).rejects.toThrow();
  });

  it('throws REFUND_NOT_ACTIONABLE for PENDING status', async () => {
    const refund = { id: 'r1', status: 'PENDING' };
    const refundRepo: any = {
      findById: jest.fn().mockResolvedValue(refund),
      approve: jest.fn(),
    };
    const auditRepo: any = {};
    const processor = makeProcessor();
    const uc = new ApproveRefundUseCase(refundRepo, auditRepo, processor);
    await expect(uc.execute('r1', 'admin1')).rejects.toThrow();
  });

  it('propagates error when approve() throws (simulates tx rollback — purchase.status unchanged)', async () => {
    const refund = { id: 'r1', purchaseId: 'p1', status: 'ESCALATED' };
    // approve() fails mid-transaction (e.g., purchase update fails inside tx)
    const refundRepo: any = {
      findById: jest.fn().mockResolvedValue(refund),
      approve: jest.fn().mockRejectedValue(new Error('DB_TX_ROLLBACK')),
    };
    const auditRepo: any = { create: jest.fn() };
    const processor = makeProcessor();

    const uc = new ApproveRefundUseCase(refundRepo, auditRepo, processor);

    // Expect the error to propagate — purchase.status is not changed because tx rolled back
    await expect(uc.execute('r1', 'admin1')).rejects.toThrow('DB_TX_ROLLBACK');
    // processor.process should NOT have been called since approve() threw
    expect(processor.process).not.toHaveBeenCalled();
  });
});
