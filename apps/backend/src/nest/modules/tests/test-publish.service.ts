import { Injectable, Inject, NotFoundException, Logger } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';

/**
 * Test publish/unpublish (servis katmanı).
 *
 * NOT: Bu provider içerik domain'inde insert/update yapar. observability skill'i:
 * "Auth/admin/para/içerik domain'inde insert/update/error path'lerinde audit log yazılmalı."
 * → publish ve unpublish her ikisi de TEST_PUBLISHED / TEST_UNPUBLISHED action ile
 * AuditLog'a kayıt geçer. Audit yazımı `$transaction` içindedir, böylece update başarılı
 * olursa audit kesin yazılır, audit DB hatası olursa update de geri alınır (atomik).
 */
@Injectable()
export class TestPublishProvider {
  private readonly logger = new Logger(TestPublishProvider.name);

  constructor(@Inject('PRISMA') private readonly prisma: PrismaClient) {}

  async publish(testId: string, actorId?: string | null) {
    const test = await this.prisma.examTest.findUnique({ where: { id: testId } });
    if (!test) throw new NotFoundException('TEST_NOT_FOUND');
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.examTest.update({
        where: { id: testId },
        data: { status: 'PUBLISHED', publishedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          action: 'TEST_PUBLISHED',
          entityType: 'ExamTest',
          entityId: testId,
          actorId: actorId ?? null,
          metadata: { title: test.title } as object,
        },
      });
      return result;
    });
    this.logger.log({ msg: 'test.published', testId, actorId: actorId ?? null });
    return updated;
  }

  async unpublish(testId: string, actorId?: string | null) {
    const test = await this.prisma.examTest.findUnique({ where: { id: testId } });
    if (!test) throw new NotFoundException('TEST_NOT_FOUND');
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.examTest.update({
        where: { id: testId },
        data: { status: 'DRAFT', publishedAt: null },
      });
      await tx.auditLog.create({
        data: {
          action: 'TEST_UNPUBLISHED',
          entityType: 'ExamTest',
          entityId: testId,
          actorId: actorId ?? null,
          metadata: { title: test.title } as object,
        },
      });
      return result;
    });
    this.logger.log({ msg: 'test.unpublished', testId, actorId: actorId ?? null });
    return updated;
  }
}

