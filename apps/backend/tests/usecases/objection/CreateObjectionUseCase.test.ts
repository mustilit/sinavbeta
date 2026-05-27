/**
 * CreateObjectionUseCase testleri
 *
 * Doğrulanan davranışlar:
 * - actorId eksik → UNAUTHORIZED
 * - Geçersiz attemptId UUID → INVALID_UUID
 * - Geçersiz questionId UUID → INVALID_UUID
 * - reason < 5 karakter → REASON_TOO_SHORT
 * - Attempt bulunamazsa → ATTEMPT_NOT_FOUND
 * - Attempt başkasına ait → FORBIDDEN_NOT_OWNER
 * - Question bulunamazsa → QUESTION_NOT_FOUND
 * - Soru bu teste ait değil → QUESTION_NOT_IN_TEST
 * - Aynı soru için itiraz var → OBJECTION_ALREADY_EXISTS
 * - Test başına limit doldu → OBJECTION_LIMIT_EXCEEDED
 * - Başarı: itiraz oluşturulur, audit log yazılır
 */

import { CreateObjectionUseCase } from '../../../src/application/use-cases/objection/CreateObjectionUseCase';

const VALID_UUID = '12345678-1234-4234-89ab-123456789012';
const VALID_QUESTION_UUID = '87654321-4321-4321-89ab-987654321098';

function makeAttemptRepo(attempt: any) {
  return { findAttemptById: jest.fn().mockResolvedValue(attempt) };
}

function makeExamRepo(question: any) {
  return { findQuestionById: jest.fn().mockResolvedValue(question) };
}

function makeObjectionRepo(overrides: Partial<any> = {}) {
  return {
    findByAttemptAndQuestion: jest.fn().mockResolvedValue(null),
    countByTestAndCandidate: jest.fn().mockResolvedValue(0),
    create: jest.fn().mockResolvedValue({
      id: 'obj-1',
      attemptId: VALID_UUID,
      questionId: VALID_QUESTION_UUID,
      reporterId: 'u1',
      reason: 'Yanlış cevap',
      createdAt: new Date(),
    }),
    ...overrides,
  };
}

function makeAuditRepo() {
  return { create: jest.fn().mockResolvedValue({}) };
}

function makeAttempt(overrides: Record<string, any> = {}) {
  return { id: VALID_UUID, candidateId: 'u1', testId: 'test-1', ...overrides };
}

function makeQuestion(overrides: Record<string, any> = {}) {
  return { id: VALID_QUESTION_UUID, testId: 'test-1', content: 'Soru 1', ...overrides };
}

const BASE_INPUT = {
  attemptId: VALID_UUID,
  questionId: VALID_QUESTION_UUID,
  reason: 'Yanlış cevap bu soru hatalı',
};

describe('CreateObjectionUseCase', () => {
  it('actorId eksik ise UNAUTHORIZED fırlatır', async () => {
    const uc = new CreateObjectionUseCase(makeObjectionRepo() as any, makeAttemptRepo(makeAttempt()) as any, makeExamRepo(makeQuestion()) as any, makeAuditRepo() as any);
    await expect(uc.execute(BASE_INPUT, undefined)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('geçersiz attemptId UUID → INVALID_UUID fırlatır', async () => {
    const uc = new CreateObjectionUseCase(makeObjectionRepo() as any, makeAttemptRepo(makeAttempt()) as any, makeExamRepo(makeQuestion()) as any, makeAuditRepo() as any);
    await expect(uc.execute({ ...BASE_INPUT, attemptId: 'not-a-uuid' }, 'u1')).rejects.toMatchObject({ code: 'INVALID_UUID' });
  });

  it('geçersiz questionId UUID → INVALID_UUID fırlatır', async () => {
    const uc = new CreateObjectionUseCase(makeObjectionRepo() as any, makeAttemptRepo(makeAttempt()) as any, makeExamRepo(makeQuestion()) as any, makeAuditRepo() as any);
    await expect(uc.execute({ ...BASE_INPUT, questionId: 'invalid' }, 'u1')).rejects.toMatchObject({ code: 'INVALID_UUID' });
  });

  it('reason < 5 karakter → REASON_TOO_SHORT fırlatır', async () => {
    const uc = new CreateObjectionUseCase(makeObjectionRepo() as any, makeAttemptRepo(makeAttempt()) as any, makeExamRepo(makeQuestion()) as any, makeAuditRepo() as any);
    await expect(uc.execute({ ...BASE_INPUT, reason: 'Hata' }, 'u1')).rejects.toMatchObject({ code: 'REASON_TOO_SHORT' });
  });

  it('attempt bulunamazsa ATTEMPT_NOT_FOUND fırlatır', async () => {
    const uc = new CreateObjectionUseCase(makeObjectionRepo() as any, makeAttemptRepo(null) as any, makeExamRepo(makeQuestion()) as any, makeAuditRepo() as any);
    await expect(uc.execute(BASE_INPUT, 'u1')).rejects.toMatchObject({ code: 'ATTEMPT_NOT_FOUND' });
  });

  it('attempt başkasına ait ise FORBIDDEN_NOT_OWNER fırlatır', async () => {
    const uc = new CreateObjectionUseCase(makeObjectionRepo() as any, makeAttemptRepo(makeAttempt({ candidateId: 'other-user' })) as any, makeExamRepo(makeQuestion()) as any, makeAuditRepo() as any);
    await expect(uc.execute(BASE_INPUT, 'u1')).rejects.toMatchObject({ code: 'FORBIDDEN_NOT_OWNER' });
  });

  it('question bulunamazsa QUESTION_NOT_FOUND fırlatır', async () => {
    const uc = new CreateObjectionUseCase(makeObjectionRepo() as any, makeAttemptRepo(makeAttempt()) as any, makeExamRepo(null) as any, makeAuditRepo() as any);
    await expect(uc.execute(BASE_INPUT, 'u1')).rejects.toMatchObject({ code: 'QUESTION_NOT_FOUND' });
  });

  it('soru bu teste ait değilse QUESTION_NOT_IN_TEST fırlatır', async () => {
    const uc = new CreateObjectionUseCase(makeObjectionRepo() as any, makeAttemptRepo(makeAttempt()) as any, makeExamRepo(makeQuestion({ testId: 'other-test' })) as any, makeAuditRepo() as any);
    await expect(uc.execute(BASE_INPUT, 'u1')).rejects.toMatchObject({ code: 'QUESTION_NOT_IN_TEST' });
  });

  it('aynı soru için itiraz varsa OBJECTION_ALREADY_EXISTS fırlatır', async () => {
    const objRepo = makeObjectionRepo({ findByAttemptAndQuestion: jest.fn().mockResolvedValue({ id: 'existing' }) });
    const uc = new CreateObjectionUseCase(objRepo as any, makeAttemptRepo(makeAttempt()) as any, makeExamRepo(makeQuestion()) as any, makeAuditRepo() as any);
    await expect(uc.execute(BASE_INPUT, 'u1')).rejects.toMatchObject({ code: 'OBJECTION_ALREADY_EXISTS' });
  });

  it('test başına limit dolduğunda OBJECTION_LIMIT_EXCEEDED fırlatır', async () => {
    const objRepo = makeObjectionRepo({ countByTestAndCandidate: jest.fn().mockResolvedValue(100) });
    const uc = new CreateObjectionUseCase(objRepo as any, makeAttemptRepo(makeAttempt()) as any, makeExamRepo(makeQuestion()) as any, makeAuditRepo() as any);
    await expect(uc.execute(BASE_INPUT, 'u1')).rejects.toMatchObject({ code: 'OBJECTION_LIMIT_EXCEEDED' });
  });

  it('başarı: itiraz oluşturulur, id döner', async () => {
    const uc = new CreateObjectionUseCase(makeObjectionRepo() as any, makeAttemptRepo(makeAttempt()) as any, makeExamRepo(makeQuestion()) as any, makeAuditRepo() as any);
    const result = await uc.execute(BASE_INPUT, 'u1');
    expect(result.id).toBe('obj-1');
    expect(result.reporterId).toBe('u1');
  });

  it('audit log yazılır', async () => {
    const auditRepo = makeAuditRepo();
    const uc = new CreateObjectionUseCase(makeObjectionRepo() as any, makeAttemptRepo(makeAttempt()) as any, makeExamRepo(makeQuestion()) as any, auditRepo as any);
    await uc.execute(BASE_INPUT, 'u1');
    expect(auditRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'OBJECTION_CREATED' }),
    );
  });
});
