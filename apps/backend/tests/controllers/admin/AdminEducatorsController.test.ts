/**
 * AdminEducatorsController unit testleri.
 */
import { AdminEducatorsController } from '../../../src/nest/controllers/admin.educators.controller';

describe('AdminEducatorsController', () => {
  let controller: AdminEducatorsController;
  let mockApproveEducator: { execute: jest.Mock };
  let mockRejectEducator: { execute: jest.Mock };
  let mockSuspendEducator: { execute: jest.Mock };
  let mockUnsuspendEducator: { execute: jest.Mock };

  beforeEach(() => {
    mockApproveEducator = { execute: jest.fn().mockResolvedValue({ id: 'edu-1', status: 'APPROVED' }) };
    mockRejectEducator = { execute: jest.fn().mockResolvedValue({ id: 'edu-1', status: 'REJECTED' }) };
    mockSuspendEducator = { execute: jest.fn().mockResolvedValue({ id: 'edu-1', status: 'SUSPENDED' }) };
    mockUnsuspendEducator = { execute: jest.fn().mockResolvedValue({ id: 'edu-1', status: 'ACTIVE' }) };

    // Controller constructor sırası: approve, reject, suspend, unsuspend
    controller = new AdminEducatorsController(
      mockApproveEducator as any,
      mockRejectEducator as any,
      mockSuspendEducator as any,
      mockUnsuspendEducator as any,
    );
  });

  describe('approve', () => {
    it('eğiticiyi onaylar', async () => {
      const req = { user: { id: 'admin-1' } };
      const result = await controller.approve('edu-1', req as any);
      expect(mockApproveEducator.execute).toHaveBeenCalledWith('admin-1', 'edu-1');
      expect(result).toHaveProperty('status', 'APPROVED');
    });
  });

  describe('suspend', () => {
    it('eğiticiyi askıya alır', async () => {
      const req = { user: { id: 'admin-1' } };
      const result = await controller.suspend('edu-1', req as any);
      expect(mockSuspendEducator.execute).toHaveBeenCalledWith('admin-1', 'edu-1');
      expect(result).toHaveProperty('status', 'SUSPENDED');
    });
  });

  describe('unsuspend', () => {
    it('eğiticinin askısını kaldırır', async () => {
      const req = { user: { id: 'admin-1' } };
      const result = await controller.unsuspend('edu-1', req as any);
      expect(mockUnsuspendEducator.execute).toHaveBeenCalledWith('admin-1', 'edu-1');
      expect(result).toHaveProperty('status', 'ACTIVE');
    });
  });
});
