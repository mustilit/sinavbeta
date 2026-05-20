// @ts-nocheck
import { AppError } from '../../errors/AppError';
import { OBJECTION_LIMIT_PER_TEST } from '../../constants';
import { IObjectionRepository } from '../../../domain/interfaces/IObjectionRepository';
import { IAttemptRepository } from '../../../domain/interfaces/IAttemptRepository';
import { IExamRepository } from '../../../domain/interfaces/IExamRepository';
import { IAuditLogRepository } from '../../../domain/interfaces/IAuditLogRepository';

/** UUID formatı doğrulama; gelen ID'lerin geçerli olduğunu giriş katmanında kontrol eder */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Aday tarafından soru hata bildirimi (itiraz) oluşturur.
 *
 * İş kuralları:
 *   - Sadece denemeye (attempt) sahip aday itiraz oluşturabilir
 *   - Aynı soru için aynı denemede yalnızca bir itiraz olabilir
 *   - Her sınav için maksimum OBJECTION_LIMIT_PER_TEST itiraz hakkı
 */
export class CreateObjectionUseCase {
  constructor(
    private readonly objectionRepo: IObjectionRepository,
    private readonly attemptRepo: IAttemptRepository,
    private readonly examRepo: IExamRepository,
    private readonly auditRepo: IAuditLogRepository,
  ) {}

  async execute(
    input: { attemptId: string; questionId: string; reason: string },
    actorId: string | undefined,
  ): Promise<{ id: string; attemptId: string; questionId: string; reporterId: string; reason: string; createdAt: Date }> {
    if (!actorId) {
      throw new AppError('UNAUTHORIZED', 'Authentication required', 401);
    }
    // UUID formatı kontrolü — SQL injection / type coercion saldırısını önler
    if (!UUID_REGEX.test(input.attemptId)) {
      throw new AppError('INVALID_UUID', 'Invalid attemptId', 400);
    }
    if (!UUID_REGEX.test(input.questionId)) {
      throw new AppError('INVALID_UUID', 'Invalid questionId', 400);
    }
    const reason = input.reason?.trim() ?? '';
    // Çok kısa gerekçe bildirimlerin niteliksiz olmasını önler
    if (reason.length < 5) {
      throw new AppError('REASON_TOO_SHORT', 'Reason must be at least 5 characters', 400);
    }

    const attempt = await this.attemptRepo.findAttemptById(input.attemptId);
    if (!attempt) {
      throw new AppError('ATTEMPT_NOT_FOUND', 'Attempt not found', 404);
    }
    // Deneme sahipliği kontrolü — başkasının denemesi adına itiraz yapılamaz
    if (attempt.candidateId !== actorId) {
      throw new AppError('FORBIDDEN_NOT_OWNER', 'Only the candidate who owns the attempt can create an objection', 403);
    }

    const question = await this.examRepo.findQuestionById(input.questionId);
    if (!question) {
      throw new AppError('QUESTION_NOT_FOUND', 'Question not found', 404);
    }
    // Sorunun bu denemenin testine ait olduğunu doğrula
    if (question.testId !== attempt.testId) {
      throw new AppError('QUESTION_NOT_IN_TEST', 'Question does not belong to this attempt\'s test', 409);
    }

    // Aynı soru için tekrarlı itirazı engelle
    const existing = await this.objectionRepo.findByAttemptAndQuestion(input.attemptId, input.questionId);
    if (existing) {
      throw new AppError('OBJECTION_ALREADY_EXISTS', 'An objection already exists for this attempt and question', 409);
    }

    // Test başına itiraz limitini kontrol et
    const count = await this.objectionRepo.countByTestAndCandidate(attempt.testId, actorId);
    if (count >= OBJECTION_LIMIT_PER_TEST) {
      throw new AppError('OBJECTION_LIMIT_EXCEEDED', `Maximum ${OBJECTION_LIMIT_PER_TEST} objections per test reached`, 429);
    }

    const objection = await this.objectionRepo.create({
      attemptId: input.attemptId,
      questionId: input.questionId,
      reporterId: actorId,
      reason,
    });

    try {
      await this.auditRepo.create({
        action: 'OBJECTION_CREATED',
        entityType: 'OBJECTION',
        entityId: objection.id,
        actorId,
        metadata: { attemptId: input.attemptId, questionId: input.questionId },
      });
    } catch {
      // best-effort audit
    }

    return {
      id: objection.id,
      attemptId: objection.attemptId,
      questionId: objection.questionId,
      reporterId: objection.reporterId,
      reason: objection.reason,
      createdAt: objection.createdAt,
    };
  }
}
