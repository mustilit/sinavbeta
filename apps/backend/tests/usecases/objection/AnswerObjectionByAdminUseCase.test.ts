/**
 * AnswerObjectionByAdminUseCase testleri
 *
 * Doğrulanan davranışlar:
 * - actorId yoksa UNAUTHORIZED
 * - adminAnswerText 4 karakter ise ADMIN_ANSWER_TOO_SHORT
 * - İtiraz bulunamazsa OBJECTION_NOT_FOUND
 * - updateAdminAnswer null dönerse OBJECTION_NOT_FOUND
 * - Başarı: itirazı günceller ve audit log yazar
 * - Audit log hatası ana akışı kesmez
 */

import { AnswerObjectionByAdminUseCase } from '../../../src/application/use-cases/objection/AnswerObjectionByAdminUseCase';

function makeObjection(overrides: any = {}) {
  return { id: 'obj-1', status: 'OPEN', createdAt: new Date(), ...overrides };
}

function makeObjectionRepo(objection: any = null) {
  return {
    findById: jest.fn().mockResolvedValue(objection),
    updateAdminAnswer: jest.fn().mockImplementation(async (id: string, data: any) => ({
      id,
      adminAnswerText: data.adminAnswerText,
      adminAnsweredAt: data.adminAnsweredAt,
      adminAnswererId: data.adminAnswererId,
    })),
  };
}

function makeAuditRepo() {
  return { create: jest.fn().mockResolvedValue({}) };
}

describe('AnswerObjectionByAdminUseCase', () => {
  it('actorId yoksa UNAUTHORIZED fırlatır', async () => {
    const uc = new AnswerObjectionByAdminUseCase(makeObjectionRepo() as any, makeAuditRepo() as any);
    await expect(
      uc.execute({ objectionId: 'obj-1', adminAnswerText: 'Yanıt metni' }, undefined),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('adminAnswerText 4 karakter ise ADMIN_ANSWER_TOO_SHORT fırlatır', async () => {
    const uc = new AnswerObjectionByAdminUseCase(
      makeObjectionRepo(makeObjection()) as any,
      makeAuditRepo() as any,
    );
    await expect(
      uc.execute({ objectionId: 'obj-1', adminAnswerText: 'kısa' }, 'admin-1'),
    ).rejects.toMatchObject({ code: 'ADMIN_ANSWER_TOO_SHORT' });
  });

  it('itiraz bulunamazsa OBJECTION_NOT_FOUND fırlatır', async () => {
    const uc = new AnswerObjectionByAdminUseCase(makeObjectionRepo(null) as any, makeAuditRepo() as any);
    await expect(
      uc.execute({ objectionId: 'bad-obj', adminAnswerText: 'Yeterince uzun yanıt' }, 'admin-1'),
    ).rejects.toMatchObject({ code: 'OBJECTION_NOT_FOUND' });
  });

  it('updateAdminAnswer null dönerse OBJECTION_NOT_FOUND fırlatır', async () => {
    const objectionRepo = makeObjectionRepo(makeObjection());
    objectionRepo.updateAdminAnswer.mockResolvedValue(null);
    const uc = new AnswerObjectionByAdminUseCase(objectionRepo as any, makeAuditRepo() as any);
    await expect(
      uc.execute({ objectionId: 'obj-1', adminAnswerText: 'Yeterince uzun yanıt' }, 'admin-1'),
    ).rejects.toMatchObject({ code: 'OBJECTION_NOT_FOUND' });
  });

  it('başarı: yanıt kaydedilir ve audit log yazılır', async () => {
    const objectionRepo = makeObjectionRepo(makeObjection());
    const auditRepo = makeAuditRepo();
    const uc = new AnswerObjectionByAdminUseCase(objectionRepo as any, auditRepo as any);
    const result = await uc.execute(
      { objectionId: 'obj-1', adminAnswerText: 'Admin yanıtı burada' },
      'admin-1',
    );
    expect(result.adminAnswerText).toBe('Admin yanıtı burada');
    expect(result.adminAnswererId).toBe('admin-1');
    expect(auditRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 'admin-1', entityId: 'obj-1' }),
    );
  });

  it('yanıt metni trim edilir (leading/trailing whitespace)', async () => {
    const objectionRepo = makeObjectionRepo(makeObjection());
    const uc = new AnswerObjectionByAdminUseCase(objectionRepo as any, makeAuditRepo() as any);
    await uc.execute({ objectionId: 'obj-1', adminAnswerText: '  Admin yanıtı  ' }, 'admin-1');
    expect(objectionRepo.updateAdminAnswer).toHaveBeenCalledWith(
      'obj-1',
      expect.objectContaining({ adminAnswerText: 'Admin yanıtı' }),
    );
  });

  it('audit log hatası ana akışı kesmez', async () => {
    const objectionRepo = makeObjectionRepo(makeObjection());
    const auditRepo = { create: jest.fn().mockRejectedValue(new Error('AUDIT_FAIL')) };
    const uc = new AnswerObjectionByAdminUseCase(objectionRepo as any, auditRepo as any);
    await expect(
      uc.execute({ objectionId: 'obj-1', adminAnswerText: 'Yeterince uzun yanıt' }, 'admin-1'),
    ).resolves.toBeDefined();
  });
});
