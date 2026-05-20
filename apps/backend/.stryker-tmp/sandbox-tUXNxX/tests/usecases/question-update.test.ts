// @ts-nocheck
import { UpdateQuestionUseCase } from '../../src/application/use-cases/question/UpdateQuestionUseCase';

function makeExamRepo(question: any = null, test: any = null) {
  return {
    findQuestionById: jest.fn(async () => question),
    findById: jest.fn(async () => test),
    updateQuestion: jest.fn(async (id: string, u: any) => ({ id, ...u })),
  };
}
function makeUserRepo(user: any = null) { return { findById: jest.fn(async () => user) }; }
function makeAttemptRepo() { return {}; }
function makeQuestion(o: any = {}) { return { id: 'q-1', testId: 'test-1', content: 'Eski soru', ...o }; }
function makeTest(o: any = {}) { return { id: 'test-1', educatorId: 'edu-1', status: 'DRAFT', ...o }; }
function makeEducator(o: any = {}) { return { id: 'edu-1', role: 'EDUCATOR', status: 'ACTIVE', educatorApprovedAt: new Date('2024-01-01'), ...o }; }

describe('UpdateQuestionUseCase', () => {
  it('soru içeriğini günceller', async () => {
    const examRepo = makeExamRepo(makeQuestion(), makeTest());
    const uc = new UpdateQuestionUseCase(examRepo as any, makeUserRepo(makeEducator()) as any, makeAttemptRepo() as any);
    await uc.execute('q-1', { content: 'Yeni içerik' }, 'edu-1');
    expect(examRepo.updateQuestion).toHaveBeenCalledWith('q-1', expect.objectContaining({ content: 'Yeni içerik' }));
  });

  it('soru bulunamazsa QUESTION_NOT_FOUND fırlatır', async () => {
    const uc = new UpdateQuestionUseCase(makeExamRepo(null, makeTest()) as any, makeUserRepo(makeEducator()) as any, makeAttemptRepo() as any);
    await expect(uc.execute('bad-q', { content: 'x' }, 'edu-1')).rejects.toMatchObject({ code: 'QUESTION_NOT_FOUND' });
  });

  it('test bulunamazsa TEST_NOT_FOUND fırlatır', async () => {
    const uc = new UpdateQuestionUseCase(makeExamRepo(makeQuestion(), null) as any, makeUserRepo(makeEducator()) as any, makeAttemptRepo() as any);
    await expect(uc.execute('q-1', { content: 'x' }, 'edu-1')).rejects.toMatchObject({ code: 'TEST_NOT_FOUND' });
  });

  it('başkasının sorusunu güncellemeye çalışırsa FORBIDDEN_NOT_OWNER', async () => {
    const uc = new UpdateQuestionUseCase(
      makeExamRepo(makeQuestion(), makeTest({ educatorId: 'other' })) as any,
      makeUserRepo(makeEducator({ id: 'wrong-edu' })) as any,
      makeAttemptRepo() as any,
    );
    await expect(uc.execute('q-1', { content: 'x' }, 'wrong-edu')).rejects.toMatchObject({ code: 'FORBIDDEN_NOT_OWNER' });
  });

  it('actorId verilmezse sahiplik kontrolü atlanır', async () => {
    const examRepo = makeExamRepo(makeQuestion(), makeTest());
    const uc = new UpdateQuestionUseCase(examRepo as any, makeUserRepo() as any, makeAttemptRepo() as any);
    await expect(uc.execute('q-1', { content: 'x' })).resolves.toBeDefined();
  });

  it('aktör kullanıcı bulunamazsa USER_NOT_FOUND', async () => {
    const uc = new UpdateQuestionUseCase(makeExamRepo(makeQuestion(), makeTest()) as any, makeUserRepo(null) as any, makeAttemptRepo() as any);
    await expect(uc.execute('q-1', { content: 'x' }, 'edu-1')).rejects.toMatchObject({ code: 'USER_NOT_FOUND' });
  });
});
