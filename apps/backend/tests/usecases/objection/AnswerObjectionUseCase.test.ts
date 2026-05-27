/**
 * AnswerObjectionUseCase testleri
 *
 * Doğrulanan davranışlar:
 * - actorId yoksa UNAUTHORIZED
 * - Kullanıcı bulunamazsa USER_NOT_FOUND
 * - Askıya alınmış eğitici yanıt veremez
 * - İtiraz bulunamazsa OBJECTION_NOT_FOUND
 * - Test sahibi değilse FORBIDDEN_NOT_OWNER
 * - answerText 4 karakter ise ANSWER_TOO_SHORT
 * - SLA 10 gün geçtiyse OBJECTION_SLA_EXPIRED ve eskalasyon yapılır
 * - Başarı: yanıt kaydedilir ve audit log yazılır
 */

import { AnswerObjectionUseCase } from '../../../src/application/use-cases/objection/AnswerObjectionUseCase';

function makeUser(overrides: any = {}) {
  return {
    id: 'edu-1',
    role: 'EDUCATOR',
    status: 'ACTIVE',
    educatorApprovedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

function makeObjection(overrides: any = {}) {
  return {
    id: 'obj-1',
    status: 'OPEN',
    createdAt: new Date(), // fresh — within SLA
    answerText: null,
    answeredAt: null,
    ...overrides,
  };
}

function makeObjectionRepo(result: any = null, educatorId = 'edu-1') {
  return {
    findByIdWithTestOwner: jest.fn().mockResolvedValue(
      result !== null ? { objection: result, educatorId } : null,
    ),
    updateAnswer: jest.fn().mockImplementation(async (id: string, data: any) => ({
      id,
      status: data.status,
      answerText: data.answerText,
      answeredAt: data.answeredAt,
    })),
    escalate: jest.fn().mockResolvedValue({}),
    findById: jest.fn().mockResolvedValue(result),
  };
}

function makeUserRepo(user: any = null) {
  return { findById: jest.fn().mockResolvedValue(user) };
}

function makeAuditRepo() {
  return { create: jest.fn().mockResolvedValue({}) };
}

describe('AnswerObjectionUseCase', () => {
  it('actorId yoksa UNAUTHORIZED fırlatır', async () => {
    const uc = new AnswerObjectionUseCase(
      makeObjectionRepo(makeObjection()) as any,
      makeUserRepo(makeUser()) as any,
      makeAuditRepo() as any,
    );
    await expect(
      uc.execute({ objectionId: 'obj-1', answerText: 'Uzun bir yanıt metni' }, undefined),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('kullanıcı bulunamazsa USER_NOT_FOUND fırlatır', async () => {
    const uc = new AnswerObjectionUseCase(
      makeObjectionRepo(makeObjection()) as any,
      makeUserRepo(null) as any,
      makeAuditRepo() as any,
    );
    await expect(
      uc.execute({ objectionId: 'obj-1', answerText: 'Uzun bir yanıt metni' }, 'edu-1'),
    ).rejects.toMatchObject({ code: 'USER_NOT_FOUND' });
  });

  it('askıya alınmış eğitici yanıt veremez', async () => {
    const uc = new AnswerObjectionUseCase(
      makeObjectionRepo(makeObjection()) as any,
      makeUserRepo(makeUser({ status: 'SUSPENDED' })) as any,
      makeAuditRepo() as any,
    );
    await expect(
      uc.execute({ objectionId: 'obj-1', answerText: 'Uzun bir yanıt metni' }, 'edu-1'),
    ).rejects.toBeDefined();
  });

  it('itiraz bulunamazsa OBJECTION_NOT_FOUND fırlatır', async () => {
    const uc = new AnswerObjectionUseCase(
      makeObjectionRepo(null) as any,
      makeUserRepo(makeUser()) as any,
      makeAuditRepo() as any,
    );
    await expect(
      uc.execute({ objectionId: 'bad-obj', answerText: 'Uzun bir yanıt metni' }, 'edu-1'),
    ).rejects.toMatchObject({ code: 'OBJECTION_NOT_FOUND' });
  });

  it('test sahibi değilse FORBIDDEN_NOT_OWNER fırlatır', async () => {
    const uc = new AnswerObjectionUseCase(
      makeObjectionRepo(makeObjection(), 'other-edu') as any,
      makeUserRepo(makeUser()) as any,
      makeAuditRepo() as any,
    );
    await expect(
      uc.execute({ objectionId: 'obj-1', answerText: 'Uzun bir yanıt metni' }, 'edu-1'),
    ).rejects.toMatchObject({ code: 'FORBIDDEN_NOT_OWNER' });
  });

  it('answerText 4 karakter ise ANSWER_TOO_SHORT fırlatır', async () => {
    const uc = new AnswerObjectionUseCase(
      makeObjectionRepo(makeObjection()) as any,
      makeUserRepo(makeUser()) as any,
      makeAuditRepo() as any,
    );
    await expect(
      uc.execute({ objectionId: 'obj-1', answerText: 'kısa' }, 'edu-1'),
    ).rejects.toMatchObject({ code: 'ANSWER_TOO_SHORT' });
  });

  it('SLA 10 gün geçtiyse OBJECTION_SLA_EXPIRED fırlatır ve eskalasyon yapar', async () => {
    const oldDate = new Date(Date.now() - 11 * 24 * 60 * 60 * 1000); // 11 gün önce
    const objectionRepo = makeObjectionRepo(makeObjection({ createdAt: oldDate }));
    const uc = new AnswerObjectionUseCase(
      objectionRepo as any,
      makeUserRepo(makeUser()) as any,
      makeAuditRepo() as any,
    );
    await expect(
      uc.execute({ objectionId: 'obj-1', answerText: 'Uzun bir yanıt metni' }, 'edu-1'),
    ).rejects.toMatchObject({ code: 'OBJECTION_SLA_EXPIRED' });
    expect(objectionRepo.escalate).toHaveBeenCalled();
  });

  it('başarı: yanıt ANSWERED olarak kaydedilir ve audit log yazılır', async () => {
    const objectionRepo = makeObjectionRepo(makeObjection());
    const auditRepo = makeAuditRepo();
    const uc = new AnswerObjectionUseCase(objectionRepo as any, makeUserRepo(makeUser()) as any, auditRepo as any);
    const result = await uc.execute(
      { objectionId: 'obj-1', answerText: 'Bu itiraz hatalıdır, yanıtlıyorum.' },
      'edu-1',
    );
    expect(result.status).toBe('ANSWERED');
    expect(result.answerText).toBe('Bu itiraz hatalıdır, yanıtlıyorum.');
    expect(auditRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'OBJECTION_ANSWERED', actorId: 'edu-1' }),
    );
  });
});
