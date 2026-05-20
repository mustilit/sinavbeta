// @ts-nocheck
import { IExamRepository, ExamWithQuestions } from '../../../domain/interfaces/IExamRepository';
import { IAuditLogRepository } from '../../../domain/interfaces/IAuditLogRepository';
import { IUserRepository } from '../../../domain/interfaces/IUserRepository';
import { AppError } from '../../errors/AppError';
import { ensureEducatorActive } from '../../policies/ensureEducatorActive';
import { PrismaFollowRepository } from '../../../infrastructure/repositories/PrismaFollowRepository';
import { RedisCache } from '../../../infrastructure/cache/RedisCache';
import { prisma } from '../../../infrastructure/database/prisma';

export class PublishTestUseCase {
  static MIN_QUESTIONS = 5;

  constructor(
    private readonly examRepository: IExamRepository,
    private readonly auditLogRepository: IAuditLogRepository,
    private readonly userRepository: IUserRepository,
    private readonly followRepository?: any,
    private readonly cache?: RedisCache
  ) {
    if (!this.followRepository) this.followRepository = new PrismaFollowRepository();
    if (!this.cache) this.cache = new RedisCache();
  }

  /**
   * Validates publish rules using a single query (exam with questions+options).
   * Educator must be approved and not suspended (ensureEducatorActive).
   */
  async execute(testId: string, actorId?: string): Promise<ExamWithQuestions> {
    // Kill-switch: test publishing disabled
    const settings = await prisma.adminSettings.findFirst({ where: { id: 1 } });
    if (settings && settings.testPublishingEnabled === false) {
      throw new AppError('TEST_PUBLISHING_DISABLED', 'Test yayınlama geçici olarak durdurulmuştur', 503);
    }

    if (actorId) {
      const user = await this.userRepository.findById(actorId);
      if (!user) {
        throw new AppError('USER_NOT_FOUND', 'User not found', 404);
      }
      ensureEducatorActive(user);
    }

    const test = await this.examRepository.findById(testId);
    if (!test) {
      throw new AppError('TEST_NOT_FOUND', 'Test not found', 400);
    }

    // Taxonomy: examTypeId required for publish (FR-E-03); topic optional — check first
    if (!(test as any).examTypeId) {
      throw new AppError('TEST_TAXONOMY_REQUIRED', 'Test must have an exam type to be published', 409);
    }

    // Minimum questions
    const qCount = test.questions?.length ?? 0;
    if (qCount < PublishTestUseCase.MIN_QUESTIONS) {
      throw new AppError(
        'MIN_QUESTIONS_VIOLATION',
        `At least ${PublishTestUseCase.MIN_QUESTIONS} questions required`,
        400,
      );
    }

    // Per-question validations: options count (2-5), exactly one correct
    for (const q of test.questions) {
      const opts = q.options ?? [];
      if (opts.length < 2 || opts.length > 5) {
        throw new AppError(
          'QUESTION_OPTIONS_VIOLATION',
          `Question ${q.id} must have between 2 and 5 options`,
          400,
        );
      }
      const correctCount = opts.filter((o) => (o as any).isCorrect).length;
      if (correctCount !== 1) {
        throw new AppError(
          'ONE_CORRECT_OPTION_VIOLATION',
          `Question ${q.id} must have exactly one correct option`,
          400,
        );
      }
    }

    // Price validation if present
    if (typeof (test as any).price === 'number' && (test as any).price <= 0) {
      throw new AppError('PRICE_MUST_BE_POSITIVE', 'Price must be > 0', 400);
    }

    // If timed, ensure duration present and > 0
    if (test.isTimed && (test.duration === null || test.duration === undefined || test.duration <= 0)) {
      throw new AppError('DURATION_REQUIRED_FOR_TIMED_TEST', 'Timed tests must have a positive duration', 400);
    }

    // Solutions completeness check: if hasSolutions=true, every question must have a solution
    if ((test as any).hasSolutions) {
      const missing = (test.questions ?? []).filter(
        (q: any) => !q.solutionText?.trim() && !q.solutionMediaUrl?.trim(),
      );
      if (missing.length > 0) {
        throw new AppError(
          'MISSING_SOLUTIONS',
          `${missing.length} soru için çözüm eksik. Çözümlü testlerde tüm sorulara çözüm eklenmesi zorunludur.`,
          400,
        );
      }
    }

    // Ownership check: if actorId provided, must match educatorId
    if (actorId && test.educatorId && test.educatorId !== actorId) {
      throw new AppError('FORBIDDEN_NOT_OWNER', 'Only the educator who owns the test can publish it', 403);
    }

    // Perform publish (repository handles persistence)
    const published = (await this.examRepository.publish(testId)) as ExamWithQuestions | null;
    if (!published) {
      throw new AppError('PUBLISH_FAILED', 'Failed to publish test', 400);
    }

    // Create audit log entry (best-effort)
    try {
      await this.auditLogRepository.create({
        action: 'TEST_PUBLISHED',
        entityType: 'ExamTest',
        entityId: testId,
        actorId: actorId ?? null,
        metadata: { title: test.title },
      });
    } catch {
      // Audit failure should not block publish; log or handle elsewhere.
    }
    // Invalidate home recommendation cache for followers
    try {
      const followerEduc = test.educatorId ? await this.followRepository.listFollowersForEducator(test.educatorId) : [];
      const examTypeId = (test as { examTypeId?: string }).examTypeId;
      const followerExamType = examTypeId ? await this.followRepository!.listFollowersForExamType(examTypeId) : [];
      const allFollowers = Array.from(new Set([...(followerEduc ?? []), ...(followerExamType ?? [])]));
      await Promise.all(allFollowers.map((fid: string) => this.cache!.delByPrefix(`home:rec:${fid}:`)));
    } catch (e) {
      // do not block publish on cache errors
      console.warn('Cache invalidation failed for publish', e);
    }

    // enqueue stats refresh for this test (followers may want updated aggregates)
    try {
      const { QueueService } = require('../../../infrastructure/queue/queue.service');
      const qs = new QueueService();
      await qs.enqueueJob('stats-queue', 'refresh', { testId });
    } catch {}

    return published;
  }
}

