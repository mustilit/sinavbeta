/**
 * UpdateEducatorProfileUseCase testleri
 *
 * Doğrulanan davranışlar:
 * - actorId yoksa UNAUTHORIZED
 * - Kullanıcı bulunamazsa USER_NOT_FOUND
 * - EDUCATOR rolü değilse FORBIDDEN
 * - Whitelist dışı alanlar filtrelenir
 * - Güncellenecek alan yoksa repo.update çağrılmaz
 * - Başarı: auditRepo.create çağrılır
 */

import { UpdateEducatorProfileUseCase } from '../../../src/application/use-cases/educator/UpdateEducatorProfileUseCase';

function makeUser(overrides: any = {}) {
  return {
    id: 'edu-1',
    email: 'edu@test.com',
    username: 'educator1',
    role: 'EDUCATOR',
    status: 'ACTIVE',
    createdAt: new Date(),
    ...overrides,
  };
}

function makeUserRepo(user: any = null) {
  return {
    findById: jest.fn().mockResolvedValue(user),
    updateEducatorProfile: jest.fn().mockImplementation(async (id: string, data: any) => ({ ...makeUser(), ...data.metadata })),
  };
}

function makeAuditRepo() {
  return { create: jest.fn().mockResolvedValue({}) };
}

describe('UpdateEducatorProfileUseCase', () => {
  it('actorId yoksa UNAUTHORIZED fırlatır', async () => {
    const uc = new UpdateEducatorProfileUseCase(makeUserRepo() as any, makeAuditRepo() as any);
    await expect(uc.execute(undefined, { metadata: { bio: 'Test bio' } })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('kullanıcı bulunamazsa USER_NOT_FOUND fırlatır', async () => {
    const uc = new UpdateEducatorProfileUseCase(makeUserRepo(null) as any, makeAuditRepo() as any);
    await expect(uc.execute('edu-1', { metadata: { bio: 'Bio' } })).rejects.toMatchObject({
      code: 'USER_NOT_FOUND',
    });
  });

  it('CANDIDATE rolü ise FORBIDDEN fırlatır', async () => {
    const uc = new UpdateEducatorProfileUseCase(
      makeUserRepo(makeUser({ role: 'CANDIDATE' })) as any,
      makeAuditRepo() as any,
    );
    await expect(uc.execute('edu-1', { metadata: { bio: 'Bio' } })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('whitelist dışı alanlar filtrelenerek güncelleme yapılmaz', async () => {
    const userRepo = makeUserRepo(makeUser());
    const uc = new UpdateEducatorProfileUseCase(userRepo as any, makeAuditRepo() as any);
    // 'dangerousField' whitelist'te yok
    const result = await uc.execute('edu-1', { metadata: { dangerousField: 'hack' } });
    expect(userRepo.updateEducatorProfile).not.toHaveBeenCalled();
    expect(result.id).toBe('edu-1');
  });

  it('metadata boş ise repo güncelleme yapmaz', async () => {
    const userRepo = makeUserRepo(makeUser());
    const uc = new UpdateEducatorProfileUseCase(userRepo as any, makeAuditRepo() as any);
    await uc.execute('edu-1', {});
    expect(userRepo.updateEducatorProfile).not.toHaveBeenCalled();
  });

  it('başarı: whitelist alanlar güncellenir ve audit log yazılır', async () => {
    const userRepo = makeUserRepo(makeUser());
    const auditRepo = makeAuditRepo();
    const uc = new UpdateEducatorProfileUseCase(userRepo as any, auditRepo as any);
    await uc.execute('edu-1', { metadata: { bio: 'Yeni bio', displayName: 'Ahmet Hoca' } });
    expect(userRepo.updateEducatorProfile).toHaveBeenCalledWith(
      'edu-1',
      expect.objectContaining({ metadata: { bio: 'Yeni bio', displayName: 'Ahmet Hoca' } }),
    );
    expect(auditRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'EDUCATOR_PROFILE_UPDATED', actorId: 'edu-1' }),
    );
  });

  it('whitelist alanları: bio, avatarUrl, displayName, linkedIn, website kabul edilir', async () => {
    const userRepo = makeUserRepo(makeUser());
    const uc = new UpdateEducatorProfileUseCase(userRepo as any, makeAuditRepo() as any);
    await uc.execute('edu-1', {
      metadata: { bio: 'Bio', avatarUrl: 'http://img', displayName: 'Ad', linkedIn: 'li', website: 'web' },
    });
    const call = userRepo.updateEducatorProfile.mock.calls[0][1].metadata;
    expect(Object.keys(call)).toEqual(['bio', 'avatarUrl', 'displayName', 'linkedIn', 'website']);
  });
});
