// @ts-nocheck
import { AnswerObjectionUseCase } from '../../src/application/use-cases/objection/AnswerObjectionUseCase';

function makeObjectionRepo(withOwner: any = null, updateAnswer: any = null) {
  return {
    findByIdWithTestOwner: jest.fn(async () => withOwner),
    updateAnswer: jest.fn(async () => updateAnswer ?? { id: 'obj-1', status: 'ANSWERED', answerText: 'Yanıt', answeredAt: new Date() }),
    escalate: jest.fn(async () => {}),
  };
}
function makeUserRepo(user: any = null) { return { findById: jest.fn(async () => user) }; }
function makeAuditRepo() { return { create: jest.fn(async () => ({})) }; }
function makeEducator(o: any = {}) { return { id: 'edu-1', role: 'EDUCATOR', status: 'ACTIVE', educatorApprovedAt: new Date('2024-01-01'), ...o }; }
function makeObjectionWithOwner(o: any = {}) {
  return {
    objection: { id: 'obj-1', status: 'OPEN', createdAt: new Date(), ...o },
    educatorId: 'edu-1',
  };
}

describe('AnswerObjectionUseCase', () => {
  it('eğitici itiraza yanıt verir', async () => {
    const objRepo = makeObjectionRepo(makeObjectionWithOwner());
    const uc = new AnswerObjectionUseCase(objRepo as any, makeUserRepo(makeEducator()) as any, makeAuditRepo() as any);
    const result = await uc.execute({ objectionId: 'obj-1', answerText: 'Düzeltme yapıldı' }, 'edu-1');
    expect(result.status).toBe('ANSWERED');
    expect(objRepo.updateAnswer).toHaveBeenCalledTimes(1);
  });

  it('actorId yoksa UNAUTHORIZED fırlatır', async () => {
    const uc = new AnswerObjectionUseCase(makeObjectionRepo() as any, makeUserRepo() as any, makeAuditRepo() as any);
    await expect(uc.execute({ objectionId: 'obj-1', answerText: 'Yanıt' }, undefined)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('kullanıcı bulunamazsa USER_NOT_FOUND fırlatır', async () => {
    const uc = new AnswerObjectionUseCase(makeObjectionRepo() as any, makeUserRepo(null) as any, makeAuditRepo() as any);
    await expect(uc.execute({ objectionId: 'obj-1', answerText: 'Yanıt' }, 'edu-1')).rejects.toMatchObject({ code: 'USER_NOT_FOUND' });
  });

  it('itiraz bulunamazsa OBJECTION_NOT_FOUND fırlatır', async () => {
    const uc = new AnswerObjectionUseCase(makeObjectionRepo(null) as any, makeUserRepo(makeEducator()) as any, makeAuditRepo() as any);
    await expect(uc.execute({ objectionId: 'bad', answerText: 'Yanıt' }, 'edu-1')).rejects.toMatchObject({ code: 'OBJECTION_NOT_FOUND' });
  });

  it('başkasının sorusunun itirazına yanıt verilemez → FORBIDDEN_NOT_OWNER', async () => {
    const ownerData = { ...makeObjectionWithOwner(), educatorId: 'other-edu' };
    const uc = new AnswerObjectionUseCase(makeObjectionRepo(ownerData) as any, makeUserRepo(makeEducator({ id: 'wrong-edu' })) as any, makeAuditRepo() as any);
    await expect(uc.execute({ objectionId: 'obj-1', answerText: 'Yanıt' }, 'wrong-edu')).rejects.toMatchObject({ code: 'FORBIDDEN_NOT_OWNER' });
  });

  it('yanıt 5 karakterden kısaysa ANSWER_TOO_SHORT fırlatır', async () => {
    const uc = new AnswerObjectionUseCase(makeObjectionRepo(makeObjectionWithOwner()) as any, makeUserRepo(makeEducator()) as any, makeAuditRepo() as any);
    await expect(uc.execute({ objectionId: 'obj-1', answerText: 'Kıs' }, 'edu-1')).rejects.toMatchObject({ code: 'ANSWER_TOO_SHORT' });
  });

  it('SLA süresi dolmuşsa OBJECTION_SLA_EXPIRED fırlatır ve eskalasyon yapar', async () => {
    const oldDate = new Date(Date.now() - 11 * 24 * 60 * 60 * 1000); // 11 gün önce
    const objRepo = makeObjectionRepo(makeObjectionWithOwner({ createdAt: oldDate, status: 'OPEN' }));
    const uc = new AnswerObjectionUseCase(objRepo as any, makeUserRepo(makeEducator()) as any, makeAuditRepo() as any);
    await expect(uc.execute({ objectionId: 'obj-1', answerText: 'Yanıt metnii' }, 'edu-1')).rejects.toMatchObject({ code: 'OBJECTION_SLA_EXPIRED' });
    expect(objRepo.escalate).toHaveBeenCalledTimes(1);
  });

  it('audit log hatası ana akışı kesmez', async () => {
    const auditRepo = { create: jest.fn(async () => { throw new Error('audit'); }) };
    const uc = new AnswerObjectionUseCase(makeObjectionRepo(makeObjectionWithOwner()) as any, makeUserRepo(makeEducator()) as any, auditRepo as any);
    await expect(uc.execute({ objectionId: 'obj-1', answerText: 'Yanıt metnii' }, 'edu-1')).resolves.toBeDefined();
  });
});
