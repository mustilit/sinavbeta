// @ts-nocheck
import { UpdateTestUseCase } from '../../src/application/use-cases/test/UpdateTestUseCase';

function makeExamRepo(test: any = null) {
  return {
    findById: jest.fn(async () => test),
    updateTestMetadata: jest.fn(async (_id: string, u: any) => ({ id: _id, ...u })),
  };
}
function makeAuditRepo() { return { create: jest.fn(async () => ({})) }; }
function makeUserRepo(user: any = null) { return { findById: jest.fn(async () => user) }; }
function makeTest(o: any = {}) { return { id: 'test-1', educatorId: 'edu-1', priceCents: 1000, ...o }; }
function makeEducator(o: any = {}) { return { id: 'edu-1', role: 'EDUCATOR', status: 'ACTIVE', educatorApprovedAt: new Date('2024-01-01'), ...o }; }

describe('UpdateTestUseCase', () => {
  it('test başlığını günceller', async () => {
    const examRepo = makeExamRepo(makeTest());
    const uc = new UpdateTestUseCase(examRepo as any, makeAuditRepo() as any, makeUserRepo(makeEducator()) as any);
    await uc.execute('test-1', { title: 'Yeni Başlık' }, 'edu-1');
    expect(examRepo.updateTestMetadata).toHaveBeenCalledWith('test-1', expect.objectContaining({ title: 'Yeni Başlık' }));
  });

  it('test bulunamazsa TEST_NOT_FOUND fırlatır', async () => {
    const uc = new UpdateTestUseCase(makeExamRepo(null) as any, makeAuditRepo() as any, makeUserRepo(makeEducator()) as any);
    await expect(uc.execute('bad-id', { title: 'x' }, 'edu-1')).rejects.toMatchObject({ code: 'TEST_NOT_FOUND' });
  });

  it('başkasının testini güncellemeye çalışırsa FORBIDDEN_NOT_OWNER', async () => {
    const uc = new UpdateTestUseCase(
      makeExamRepo(makeTest({ educatorId: 'other' })) as any,
      makeAuditRepo() as any,
      makeUserRepo(makeEducator({ id: 'wrong-edu' })) as any,
    );
    await expect(uc.execute('test-1', { title: 'x' }, 'wrong-edu')).rejects.toMatchObject({ code: 'FORBIDDEN_NOT_OWNER' });
  });

  it('fiyat değişince audit log yazılır', async () => {
    const auditRepo = makeAuditRepo();
    const uc = new UpdateTestUseCase(makeExamRepo(makeTest({ priceCents: 1000 })) as any, auditRepo as any, makeUserRepo(makeEducator()) as any);
    await uc.execute('test-1', { priceCents: 2000 }, 'edu-1');
    expect(auditRepo.create).toHaveBeenCalledWith(expect.objectContaining({ action: 'PRICE_CHANGED' }));
  });

  it('fiyat değişmezse audit log yazılmaz', async () => {
    const auditRepo = makeAuditRepo();
    const uc = new UpdateTestUseCase(makeExamRepo(makeTest({ priceCents: 1000 })) as any, auditRepo as any, makeUserRepo(makeEducator()) as any);
    await uc.execute('test-1', { priceCents: 1000 }, 'edu-1');
    expect(auditRepo.create).not.toHaveBeenCalled();
  });

  it('audit log hatası ana akışı kesmez', async () => {
    const auditRepo = { create: jest.fn(async () => { throw new Error('audit fail'); }) };
    const uc = new UpdateTestUseCase(makeExamRepo(makeTest()) as any, auditRepo as any, makeUserRepo(makeEducator()) as any);
    await expect(uc.execute('test-1', { priceCents: 5000 }, 'edu-1')).resolves.toBeDefined();
  });

  it('aktör kullanıcı bulunamazsa USER_NOT_FOUND', async () => {
    const uc = new UpdateTestUseCase(makeExamRepo(makeTest()) as any, makeAuditRepo() as any, makeUserRepo(null) as any);
    await expect(uc.execute('test-1', { title: 'x' }, 'edu-1')).rejects.toMatchObject({ code: 'USER_NOT_FOUND' });
  });
});
