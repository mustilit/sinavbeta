// @ts-nocheck
import { IExamRepository } from '../../../domain/interfaces/IExamRepository';
import { IAuditLogRepository } from '../../../domain/interfaces/IAuditLogRepository';
import { BadRequestException, ForbiddenException } from '@nestjs/common';

export class UnpublishTestUseCase {
  constructor(private readonly examRepository: IExamRepository, private readonly auditLogRepository: IAuditLogRepository) {}

  async execute(testId: string, actorId?: string) {
    const test = await this.examRepository.findById(testId);
    if (!test) {
      throw new BadRequestException({ code: 'TEST_NOT_FOUND', message: 'Test not found' });
    }

    // Ownership check: only enforce if actorId provided
    if (actorId && test.educatorId && test.educatorId !== actorId) {
      throw new ForbiddenException({ code: 'FORBIDDEN_NOT_OWNER', message: 'Only the educator who owns the test can unpublish it' });
    }

    const unpub = await this.examRepository.unpublish(testId);
    if (!unpub) {
      throw new BadRequestException({ code: 'UNPUBLISH_FAILED', message: 'Failed to unpublish test' });
    }

    try {
      await this.auditLogRepository.create({
        action: 'TEST_UNPUBLISHED',
        entityType: 'ExamTest',
        entityId: testId,
        actorId: actorId ?? null,
        metadata: { title: test.title },
      });
    } catch {
      // don't block on audit failure
    }

    try {
      const { QueueService } = require('../../../infrastructure/queue/queue.service');
      const qs = new QueueService();
      await qs.enqueueJob('stats-queue', 'refresh', { testId });
    } catch {}
    return unpub;
  }
}

