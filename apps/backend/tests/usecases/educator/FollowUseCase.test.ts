/**
 * FollowUseCase testleri
 *
 * Doğrulanan davranışlar:
 * - followerId eksik → INVALID_INPUT
 * - followType eksik → INVALID_INPUT
 * - EDUCATOR follow tipi ama educatorId yoksa → INVALID_INPUT
 * - EXAM_TYPE follow tipi ama examTypeId yoksa → INVALID_INPUT
 * - Başarı: followRepo.upsertFollow çağrılır
 * - Audit log yazılır
 * - Audit log hatası main flow'u kesmez
 */

import { FollowUseCase } from '../../../src/application/use-cases/educator/FollowUseCase';

function makeFollowRepo() {
  return { upsertFollow: jest.fn().mockResolvedValue(undefined) };
}

function makeAuditRepo() {
  return { create: jest.fn().mockResolvedValue({}) };
}

describe('FollowUseCase', () => {
  it('followerId eksik ise INVALID_INPUT hatası fırlatır', async () => {
    const uc = new FollowUseCase(makeFollowRepo() as any, makeAuditRepo() as any);
    await expect(uc.execute({ followerId: '', followType: 'EDUCATOR', educatorId: 'edu-1' })).rejects.toThrow('INVALID_INPUT');
  });

  it('followType eksik ise INVALID_INPUT hatası fırlatır', async () => {
    const uc = new FollowUseCase(makeFollowRepo() as any, makeAuditRepo() as any);
    await expect(uc.execute({ followerId: 'u1', followType: '' as any, educatorId: 'edu-1' })).rejects.toThrow('INVALID_INPUT');
  });

  it('EDUCATOR tipinde educatorId yoksa INVALID_INPUT fırlatır', async () => {
    const uc = new FollowUseCase(makeFollowRepo() as any, makeAuditRepo() as any);
    await expect(uc.execute({ followerId: 'u1', followType: 'EDUCATOR' })).rejects.toThrow('INVALID_INPUT');
  });

  it('EXAM_TYPE tipinde examTypeId yoksa INVALID_INPUT fırlatır', async () => {
    const uc = new FollowUseCase(makeFollowRepo() as any, makeAuditRepo() as any);
    await expect(uc.execute({ followerId: 'u1', followType: 'EXAM_TYPE' })).rejects.toThrow('INVALID_INPUT');
  });

  it('EDUCATOR takibi: followRepo.upsertFollow çağrılır', async () => {
    const followRepo = makeFollowRepo();
    const uc = new FollowUseCase(followRepo as any, makeAuditRepo() as any);
    await uc.execute({ followerId: 'u1', followType: 'EDUCATOR', educatorId: 'edu-1' });
    expect(followRepo.upsertFollow).toHaveBeenCalledWith(
      expect.objectContaining({ followerId: 'u1', followType: 'EDUCATOR', educatorId: 'edu-1' }),
    );
  });

  it('EXAM_TYPE takibi: followRepo.upsertFollow çağrılır', async () => {
    const followRepo = makeFollowRepo();
    const uc = new FollowUseCase(followRepo as any, makeAuditRepo() as any);
    await uc.execute({ followerId: 'u1', followType: 'EXAM_TYPE', examTypeId: 'et-1' });
    expect(followRepo.upsertFollow).toHaveBeenCalledWith(
      expect.objectContaining({ followType: 'EXAM_TYPE', examTypeId: 'et-1' }),
    );
  });

  it('audit log yazılır', async () => {
    const auditRepo = makeAuditRepo();
    const uc = new FollowUseCase(makeFollowRepo() as any, auditRepo as any);
    await uc.execute({ followerId: 'u1', followType: 'EDUCATOR', educatorId: 'edu-1' });
    expect(auditRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'FOLLOW_CREATED' }),
    );
  });

  it('audit log hatası main flow u kesmez', async () => {
    const auditRepo = { create: jest.fn().mockRejectedValue(new Error('AUDIT_FAIL')) };
    const uc = new FollowUseCase(makeFollowRepo() as any, auditRepo as any);
    await expect(uc.execute({ followerId: 'u1', followType: 'EDUCATOR', educatorId: 'edu-1' })).resolves.toBeUndefined();
  });

  it('notificationsEnabled parametresi repo a iletilir', async () => {
    const followRepo = makeFollowRepo();
    const uc = new FollowUseCase(followRepo as any, makeAuditRepo() as any);
    await uc.execute({ followerId: 'u1', followType: 'EDUCATOR', educatorId: 'edu-1', notificationsEnabled: true });
    expect(followRepo.upsertFollow).toHaveBeenCalledWith(
      expect.objectContaining({ notificationsEnabled: true }),
    );
  });
});
