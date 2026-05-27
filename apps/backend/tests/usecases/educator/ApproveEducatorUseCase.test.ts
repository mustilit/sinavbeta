/**
 * ApproveEducatorUseCase testleri
 *
 * Doğrulanan davranışlar:
 * - Kullanıcı bulunamazsa USER_NOT_FOUND
 * - EDUCATOR olmayan kullanıcı → USER_NOT_EDUCATOR
 * - Zaten onaylı ise idempotent yanıt döner (yeni güncelleme yok)
 * - Başarı: updateEducatorStatus çağrılır, audit log yazılır
 * - updateEducatorStatus null dönerse USER_NOT_FOUND
 */

import { ApproveEducatorUseCase } from '../../../src/application/use-cases/educator/ApproveEducatorUseCase';

function makeUser(overrides: any = {}) {
  return {
    id: 'edu-1',
    role: 'EDUCATOR',
    status: 'PENDING',
    educatorApprovedAt: null,
    ...overrides,
  };
}

function makeUserRepo(user: any = null) {
  return {
    findById: jest.fn().mockResolvedValue(user),
    updateEducatorStatus: jest.fn().mockImplementation(async (id: string, data: any) => ({
      id,
      ...data,
    })),
  };
}

function makeAuditRepo() {
  return { create: jest.fn().mockResolvedValue({}) };
}

describe('ApproveEducatorUseCase', () => {
  it('kullanıcı bulunamazsa USER_NOT_FOUND fırlatır', async () => {
    const uc = new ApproveEducatorUseCase(makeUserRepo(null) as any, makeAuditRepo() as any);
    await expect(uc.execute('admin-1', 'edu-x')).rejects.toMatchObject({ code: 'USER_NOT_FOUND' });
  });

  it('EDUCATOR olmayan kullanıcıyı onaylamaya çalışırsa USER_NOT_EDUCATOR fırlatır', async () => {
    const uc = new ApproveEducatorUseCase(
      makeUserRepo(makeUser({ role: 'CANDIDATE' })) as any,
      makeAuditRepo() as any,
    );
    await expect(uc.execute('admin-1', 'edu-1')).rejects.toMatchObject({ code: 'USER_NOT_EDUCATOR' });
  });

  it('zaten ACTIVE ve onaylıysa idempotent — tekrar güncelleme yapmaz', async () => {
    const approvedAt = new Date('2024-01-01');
    const userRepo = makeUserRepo(makeUser({ status: 'ACTIVE', educatorApprovedAt: approvedAt }));
    const uc = new ApproveEducatorUseCase(userRepo as any, makeAuditRepo() as any);
    const result = await uc.execute('admin-1', 'edu-1');
    expect(result.status).toBe('ACTIVE');
    expect(userRepo.updateEducatorStatus).not.toHaveBeenCalled();
  });

  it('başarı: status ACTIVE yapılır ve audit log yazılır', async () => {
    const userRepo = makeUserRepo(makeUser());
    const auditRepo = makeAuditRepo();
    const uc = new ApproveEducatorUseCase(userRepo as any, auditRepo as any);
    const result = await uc.execute('admin-1', 'edu-1');
    expect(result.status).toBe('ACTIVE');
    expect(userRepo.updateEducatorStatus).toHaveBeenCalledWith(
      'edu-1',
      expect.objectContaining({ status: 'ACTIVE', educatorApprovedAt: expect.any(Date) }),
    );
    expect(auditRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'EDUCATOR_APPROVED', actorId: 'admin-1' }),
    );
  });

  it('updateEducatorStatus null dönerse USER_NOT_FOUND fırlatır', async () => {
    const userRepo = makeUserRepo(makeUser());
    userRepo.updateEducatorStatus.mockResolvedValue(null);
    const uc = new ApproveEducatorUseCase(userRepo as any, makeAuditRepo() as any);
    await expect(uc.execute('admin-1', 'edu-1')).rejects.toMatchObject({ code: 'USER_NOT_FOUND' });
  });

  it('audit log hatası ana akışı kesmez', async () => {
    const userRepo = makeUserRepo(makeUser());
    const auditRepo = { create: jest.fn().mockRejectedValue(new Error('AUDIT_DB_DOWN')) };
    const uc = new ApproveEducatorUseCase(userRepo as any, auditRepo as any);
    await expect(uc.execute('admin-1', 'edu-1')).resolves.toBeDefined();
  });
});
