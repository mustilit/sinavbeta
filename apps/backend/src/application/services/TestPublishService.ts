import type { PrismaClient } from '@prisma/client';
import { ExamWithQuestions } from '../../domain/interfaces/IExamRepository';
import { IExamRepository } from '../../domain/interfaces/IExamRepository';
import { AuditLogService } from './AuditLogService';
import { AppError } from '../errors/AppError';

/**
 * TestPublishService
 * İş kuralları Controller'da değil Service katmanında uygulanır.
 * Kritik işlemler (Publish/Unpublish) AuditLog ile loglanır.
 * Publish + audit log yazımı tek prisma.$transaction içinde — atomik.
 */
export class TestPublishService {
  private static readonly MIN_QUESTIONS = 5;
  private static readonly ENTITY_TYPE = 'ExamTest';

  constructor(
    private readonly examRepository: IExamRepository,
    private readonly auditLogService: AuditLogService,
    private readonly prisma: PrismaClient,
  ) {}

  /**
   * Test yayınlama - tüm validasyonlar Service katmanında.
   * examTest.update + auditLog.create aynı transaction içinde.
   */
  async publish(testId: string, actorId?: string | null): Promise<ExamWithQuestions> {
    const test = await this.examRepository.findById(testId);
    if (!test) {
      throw new Error('TEST_NOT_FOUND');
    }

    // 1. Min 5 soru kontrolü
    this.validateMinQuestions(test);

    // 2. Her soruda tam 1 doğru şık zorunluluğu
    this.validateOneCorrectOptionPerQuestion(test);

    // 3. Süreli test ise duration null olamaz
    this.validateDurationForTimedTest(test);

    // 4. Moderasyon kontrolü — tüm sorular APPROVED olmalı
    await this.validateModerationStatus(testId);

    // Publish + audit atomik
    const published = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.examTest.update({
        where: { id: testId },
        data: { status: 'PUBLISHED', publishedAt: new Date() },
        include: {
          questions: { include: { options: true }, orderBy: { order: 'asc' } },
        },
      });
      await tx.auditLog.create({
        data: {
          action: 'TEST_PUBLISHED' as any,
          entityType: TestPublishService.ENTITY_TYPE,
          entityId: testId,
          actorId: actorId ?? null,
          metadata: {},
        },
      });
      return updated;
    });

    if (!published) throw new Error('TEST_NOT_FOUND');
    return this.toDomain(published);
  }

  /**
   * Test yayından kaldırma — unpublish + audit atomik.
   */
  async unpublish(testId: string, actorId?: string | null): Promise<ExamWithQuestions> {
    const test = await this.examRepository.findById(testId);
    if (!test) throw new Error('TEST_NOT_FOUND');

    const unpublished = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.examTest.update({
        where: { id: testId },
        data: { status: 'DRAFT', publishedAt: null },
        include: {
          questions: { include: { options: true }, orderBy: { order: 'asc' } },
        },
      });
      await tx.auditLog.create({
        data: {
          action: 'TEST_UNPUBLISHED' as any,
          entityType: TestPublishService.ENTITY_TYPE,
          entityId: testId,
          actorId: actorId ?? null,
          metadata: {},
        },
      });
      return updated;
    });

    if (!unpublished) throw new Error('TEST_NOT_FOUND');
    return this.toDomain(unpublished);
  }

  private async validateModerationStatus(testId: string): Promise<void> {
    const pendingCount = await this.prisma.examQuestion.count({
      where: {
        testId,
        moderationStatus: { in: ['PENDING_REVIEW', 'REJECTED', 'ESCALATED'] },
      },
    });
    if (pendingCount > 0) {
      throw new AppError(
        'MODERATION_PENDING',
        'Bu testin bazı soruları moderasyon onayı bekliyor veya reddedildi. Yayımlamadan önce tüm soruların onaylanması gerekir.',
        400,
      );
    }
  }

  private validateMinQuestions(test: ExamWithQuestions): void {
    const questionCount = test.questions?.length ?? 0;
    if (questionCount < TestPublishService.MIN_QUESTIONS) {
      throw new Error(
        `MIN_QUESTIONS_VIOLATION: Test yayınlanabilmesi için minimum ${TestPublishService.MIN_QUESTIONS} soru gerekir. Mevcut: ${questionCount}`
      );
    }
  }

  private validateOneCorrectOptionPerQuestion(test: ExamWithQuestions): void {
    for (const question of test.questions) {
      const correctCount = question.options?.filter((o) => o.isCorrect).length ?? 0;
      if (correctCount !== 1) {
        throw new Error(
          `ONE_CORRECT_OPTION_VIOLATION: Her soruda tam 1 doğru şık olmalı. Soru "${question.content.substring(0, 30)}..." - doğru şık sayısı: ${correctCount}`
        );
      }
    }
  }

  private validateDurationForTimedTest(test: ExamWithQuestions): void {
    if (test.isTimed && (test.duration == null || test.duration <= 0)) {
      throw new Error(
        'DURATION_REQUIRED: Süreli test için duration (dakika) zorunludur ve 0\'dan büyük olmalıdır.'
      );
    }
  }

  /** Prisma row → domain object (PrismaExamRepository.toDomain ile aynı yapı) */
  private toDomain(row: any): ExamWithQuestions {
    return {
      id: row.id,
      title: row.title,
      isTimed: row.isTimed,
      duration: row.duration,
      status: row.status ?? 'DRAFT',
      educatorId: row.educatorId ?? null,
      examTypeId: row.examTypeId ?? null,
      topicId: row.topicId ?? null,
      metadata: row.metadata ?? {},
      publishedAt: row.publishedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      questionCount: row.questions?.length ?? 0,
      hasSolutions: row.hasSolutions ?? false,
      priceCents: row.priceCents ?? null,
      packageId: row.packageId ?? null,
      questions: (row.questions ?? []).map((q: any) => ({
        id: q.id,
        testId: row.id,
        content: q.content,
        order: q.order,
        mediaUrl: q.mediaUrl ?? null,
        options: (q.options ?? []).map((o: any) => ({
          id: o.id,
          questionId: q.id,
          content: o.content,
          isCorrect: o.isCorrect,
          mediaUrl: o.mediaUrl ?? null,
        })),
        solutionText: q.solutionText ?? null,
        solutionMediaUrl: q.solutionMediaUrl ?? null,
      })),
    };
  }
}
