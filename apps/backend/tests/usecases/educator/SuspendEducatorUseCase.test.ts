/**
 * SuspendEducatorUseCase testleri
 *
 * Doğrulanan davranışlar:
 * - Kullanıcı bulunamazsa USER_NOT_FOUND
 * - EDUCATOR olmayan kullanıcı → USER_NOT_EDUCATOR
 * - Başarı: status SUSPENDED olur, audit log yazılır
 * - updateEducatorStatus null dönerse USER_NOT_FOUND
 * - Audit log hatası ana akışı kesmez
 */

import { SuspendEducatorUseCase } from '../../../src/application/use-cases/educator/SuspendEducatorUseCase';

function makeUser(overrides: any = {}) {
  return { id: 'edu-1', role: 'EDUCATOR', status: 'ACTIVE', ...overrides };
}

function makeUserRepo(user: any = null) {
  return {
    findById: jest.fn().mockResolvedValue(user),
    updateEducatorStatus: jest.fn().mockImplementation(async (id: string, data: any) => ({
      id,
      status: data.status,
    })),
  };
}

function makeAuditRepo() {
  return { create: jest.fn().mockResolvedValue({}) };
}

describe('SuspendEducatorUseCase', () => {
  it('kullanıcı bulunamazsa USER_NOT_FOUND fırlatır', async () => {
    const uc = new SuspendEducatorUseCase(makeUserRepo(null) as any, makeAuditRepo() as any);
    await expect(uc.execute('admin-1', 'edu-x')).rejects.toMatchObject({ code: 'USER_NOT_FOUND' });
  });

  it('EDUCATOR olmayan kullanıcıyı askıya almaya çalışırsa USER_NOT_EDUCATOR fırlatır', async () => {
    const uc = new SuspendEducatorUseCase(
      makeUserRepo(makeUser({ role: 'CANDIDATE' })) as any,
      makeAuditRepo() as any,
    );
    await expect(uc.execute('admin-1', 'edu-1')).rejects.toMatchObject({ code: 'USER_NOT_EDUCATOR' });
  });

  it('başarı: status SUSPENDED olur', async () => {
    const userRepo = makeUserRepo(makeUser());
    const uc = new SuspendEducatorUseCase(userRepo as any, makeAuditRepo() as any);
    const result = await uc.execute('admin-1', 'edu-1');
    expect(result.status).toBe('SUSPENDED');
    expect(userRepo.updateEducatorStatus).toHaveBeenCalledWith('edu-1', { status: 'SUSPENDED' });
  });

  it('audit log EDUCATOR_SUSPENDED action ile yazılır', async () => {
    const auditRepo = makeAuditRepo();
    const uc = new SuspendEducatorUseCase(makeUserRepo(makeUser()) as any, auditRepo as any);
    await uc.execute('admin-1', 'edu-1');
    expect(auditRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'EDUCATOR_SUSPENDED', actorId: 'admin-1', entityId: 'edu-1' }),
    );
  });

  it('updateEducatorStatus null dönerse USER_NOT_FOUND fırlatır', async () => {
    const userRepo = makeUserRepo(makeUser());
    userRepo.updateEducatorStatus.mockResolvedValue(null);
    const uc = new SuspendEducatorUseCase(userRepo as any, makeAuditRepo() as any);
    await expect(uc.execute('admin-1', 'edu-1')).rejects.toMatchObject({ code: 'USER_NOT_FOUND' });
  });

  it('audit log hatası ana akışı kesmez', async () => {
    const auditRepo = { create: jest.fn().mockRejectedValue(new Error('FAIL')) };
    const uc = new SuspendEducatorUseCase(makeUserRepo(makeUser()) as any, auditRepo as any);
    await expect(uc.execute('admin-1', 'edu-1')).resolves.toBeDefined();
  });
});
