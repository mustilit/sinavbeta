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

  // --- Temel güncelleme ---

  it('test başlığını günceller', async () => {
    const examRepo = makeExamRepo(makeTest());
    const uc = new UpdateTestUseCase(examRepo as any, makeAuditRepo() as any, makeUserRepo(makeEducator()) as any);
    await uc.execute('test-1', { title: 'Yeni Başlık' }, 'edu-1');
    expect(examRepo.updateTestMetadata).toHaveBeenCalledWith('test-1', expect.objectContaining({ title: 'Yeni Başlık' }));
  });

  // --- Hata senaryoları ---

  it('test bulunamazsa TEST_NOT_FOUND fırlatır', async () => {
    const uc = new UpdateTestUseCase(makeExamRepo(null) as any, makeAuditRepo() as any, makeUserRepo(makeEducator()) as any);
    await expect(uc.execute('bad-id', { title: 'x' }, 'edu-1')).rejects.toMatchObject({
      code: 'TEST_NOT_FOUND',
      message: expect.stringMatching(/\S/),
    });
  });

  it('başkasının testini güncellemeye çalışırsa FORBIDDEN_NOT_OWNER fırlatır', async () => {
    const uc = new UpdateTestUseCase(
      makeExamRepo(makeTest({ educatorId: 'other' })) as any,
      makeAuditRepo() as any,
      makeUserRepo(makeEducator({ id: 'wrong-edu' })) as any,
    );
    await expect(uc.execute('test-1', { title: 'x' }, 'wrong-edu')).rejects.toMatchObject({
      code: 'FORBIDDEN_NOT_OWNER',
      message: expect.stringMatching(/\S/),
    });
  });

  it('aktör kullanıcı bulunamazsa USER_NOT_FOUND fırlatır', async () => {
    const uc = new UpdateTestUseCase(makeExamRepo(makeTest()) as any, makeAuditRepo() as any, makeUserRepo(null) as any);
    await expect(uc.execute('test-1', { title: 'x' }, 'edu-1')).rejects.toMatchObject({
      code: 'USER_NOT_FOUND',
      message: expect.stringMatching(/\S/),
    });
  });

  it('updateTestMetadata null döndürürse UPDATE_FAILED fırlatır', async () => {
    // if (!updated) → if (false) mutantını öldürür
    const examRepo = {
      findById: jest.fn(async () => makeTest()),
      updateTestMetadata: jest.fn(async () => null),
    };
    const uc = new UpdateTestUseCase(examRepo as any, makeAuditRepo() as any, makeUserRepo(makeEducator()) as any);
    await expect(uc.execute('test-1', { title: 'x' }, 'edu-1')).rejects.toMatchObject({
      code: 'UPDATE_FAILED',
      message: expect.stringMatching(/\S/),
    });
  });

  // --- actorId yoksa kullanıcı sorgusunun ve sahiplik kontrolünün atlanması ---
  // (if (actorId) → if (true) ve if (actorId && ...) → if (true && ...) mutantlarını öldürür)

  it('actorId undefined ise kullanıcı sorgusu yapılmaz', async () => {
    const userRepo = makeUserRepo(null); // repo null döndürse de hata olmamalı
    const examRepo = makeExamRepo(makeTest());
    const uc = new UpdateTestUseCase(examRepo as any, makeAuditRepo() as any, userRepo as any);
    await expect(uc.execute('test-1', { title: 'x' })).resolves.toBeDefined();
    expect(userRepo.findById).not.toHaveBeenCalled();
  });

  it('actorId undefined ise başka educatorId olsa bile FORBIDDEN fırlatılmaz', async () => {
    // if (actorId && ...) → if (true && ...) mutantını öldürür
    const uc = new UpdateTestUseCase(
      makeExamRepo(makeTest({ educatorId: 'someone-else' })) as any,
      makeAuditRepo() as any,
      makeUserRepo() as any,
    );
    await expect(uc.execute('test-1', { title: 'x' })).resolves.toBeDefined();
  });

  // --- Fiyat değişimi ve audit log (typeof, actorId, entityType, metadata mutantlarını öldürür) ---

  it('fiyat değişince audit log tam içerikle yazılır', async () => {
    // Öldürülen mutantlar:
    //   - actorId ?? null → actorId && null  (actorId değeri kontrol edilir)
    //   - metadata: {} yerine { oldPriceCents, newPriceCents }
    //   - entityType: '' yerine 'ExamTest'
    const auditRepo = makeAuditRepo();
    const uc = new UpdateTestUseCase(makeExamRepo(makeTest({ priceCents: 1000 })) as any, auditRepo as any, makeUserRepo(makeEducator()) as any);
    await uc.execute('test-1', { priceCents: 2000 }, 'edu-1');
    expect(auditRepo.create).toHaveBeenCalledWith({
      action: 'PRICE_CHANGED',
      entityType: 'ExamTest',
      entityId: 'test-1',
      actorId: 'edu-1',
      metadata: { oldPriceCents: 1000, newPriceCents: 2000 },
    });
  });

  it('actorId yokken fiyat değişirse audit log actorId null olur', async () => {
    // actorId ?? null — null branch'ini de test eder
    const auditRepo = makeAuditRepo();
    const uc = new UpdateTestUseCase(makeExamRepo(makeTest({ priceCents: 1000 })) as any, auditRepo as any, makeUserRepo() as any);
    await uc.execute('test-1', { priceCents: 3000 }); // actorId yok
    expect(auditRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      actorId: null,
      metadata: { oldPriceCents: 1000, newPriceCents: 3000 },
    }));
  });

  it('fiyat değişmezse audit log yazılmaz', async () => {
    const auditRepo = makeAuditRepo();
    const uc = new UpdateTestUseCase(makeExamRepo(makeTest({ priceCents: 1000 })) as any, auditRepo as any, makeUserRepo(makeEducator()) as any);
    await uc.execute('test-1', { priceCents: 1000 }, 'edu-1');
    expect(auditRepo.create).not.toHaveBeenCalled();
  });

  it('priceCents number değil (undefined) ise audit log yazılmaz', async () => {
    // typeof newPriceCents === 'number' → true mutantını öldürür
    const auditRepo = makeAuditRepo();
    const uc = new UpdateTestUseCase(makeExamRepo(makeTest({ priceCents: 1000 })) as any, auditRepo as any, makeUserRepo(makeEducator()) as any);
    await uc.execute('test-1', { title: 'Sadece başlık' }, 'edu-1'); // priceCents yok → undefined
    expect(auditRepo.create).not.toHaveBeenCalled();
  });

  it('audit log hatası ana akışı kesmez', async () => {
    const auditRepo = { create: jest.fn(async () => { throw new Error('audit fail'); }) };
    const uc = new UpdateTestUseCase(makeExamRepo(makeTest()) as any, auditRepo as any, makeUserRepo(makeEducator()) as any);
    await expect(uc.execute('test-1', { priceCents: 5000 }, 'edu-1')).resolves.toBeDefined();
  });
});
