/**
 * UnfollowUseCase testleri
 *
 * Doğrulanan davranışlar:
 * - followerId eksik → INVALID_INPUT
 * - followType eksik → INVALID_INPUT
 * - Başarı: followRepo.deleteFollow çağrılır
 * - Audit log yazılır
 * - Audit log hatası main flow'u kesmez
 */

import { UnfollowUseCase } from '../../../src/application/use-cases/educator/UnfollowUseCase';

function makeFollowRepo() {
  return { deleteFollow: jest.fn().mockResolvedValue(undefined) };
}

function makeAuditRepo() {
  return { create: jest.fn().mockResolvedValue({}) };
}

describe('UnfollowUseCase', () => {
  it('followerId eksik ise INVALID_INPUT hatası fırlatır', async () => {
    const uc = new UnfollowUseCase(makeFollowRepo() as any, makeAuditRepo() as any);
    await expect(uc.execute({ followerId: '', followType: 'EDUCATOR', educatorId: 'edu-1' })).rejects.toThrow('INVALID_INPUT');
  });

  it('followType eksik ise INVALID_INPUT hatası fırlatır', async () => {
    const uc = new UnfollowUseCase(makeFollowRepo() as any, makeAuditRepo() as any);
    await expect(uc.execute({ followerId: 'u1', followType: '' as any })).rejects.toThrow('INVALID_INPUT');
  });

  it('EDUCATOR takibini kaldırır: followRepo.deleteFollow çağrılır', async () => {
    const followRepo = makeFollowRepo();
    const uc = new UnfollowUseCase(followRepo as any, makeAuditRepo() as any);
    await uc.execute({ followerId: 'u1', followType: 'EDUCATOR', educatorId: 'edu-1' });
    expect(followRepo.deleteFollow).toHaveBeenCalledWith(
      expect.objectContaining({ followerId: 'u1', followType: 'EDUCATOR', educatorId: 'edu-1' }),
    );
  });

  it('EXAM_TYPE takibini kaldırır: followRepo.deleteFollow çağrılır', async () => {
    const followRepo = makeFollowRepo();
    const uc = new UnfollowUseCase(followRepo as any, makeAuditRepo() as any);
    await uc.execute({ followerId: 'u1', followType: 'EXAM_TYPE', examTypeId: 'et-1' });
    expect(followRepo.deleteFollow).toHaveBeenCalledWith(
      expect.objectContaining({ followType: 'EXAM_TYPE', examTypeId: 'et-1' }),
    );
  });

  it('audit log yazılır', async () => {
    const auditRepo = makeAuditRepo();
    const uc = new UnfollowUseCase(makeFollowRepo() as any, auditRepo as any);
    await uc.execute({ followerId: 'u1', followType: 'EDUCATOR', educatorId: 'edu-1' });
    expect(auditRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'FOLLOW_REMOVED' }),
    );
  });

  it('audit log hatası main flow u kesmez', async () => {
    const auditRepo = { create: jest.fn().mockRejectedValue(new Error('AUDIT_FAIL')) };
    const uc = new UnfollowUseCase(makeFollowRepo() as any, auditRepo as any);
    await expect(uc.execute({ followerId: 'u1', followType: 'EDUCATOR', educatorId: 'edu-1' })).resolves.toBeUndefined();
  });
});
