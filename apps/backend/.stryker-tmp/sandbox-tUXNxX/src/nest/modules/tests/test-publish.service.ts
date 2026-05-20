// @ts-nocheck
import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';

@Injectable()
export class TestPublishProvider {
  constructor(@Inject('PRISMA') private readonly prisma: PrismaClient) {}

  async publish(testId: string) {
    const test = await this.prisma.examTest.findUnique({ where: { id: testId } });
    if (!test) throw new NotFoundException('TEST_NOT_FOUND');
    const updated = await this.prisma.examTest.update({
      where: { id: testId },
      data: { status: 'PUBLISHED', publishedAt: new Date() },
    });
    return updated;
  }

  async unpublish(testId: string) {
    const test = await this.prisma.examTest.findUnique({ where: { id: testId } });
    if (!test) throw new NotFoundException('TEST_NOT_FOUND');
    const updated = await this.prisma.examTest.update({
      where: { id: testId },
      data: { status: 'DRAFT', publishedAt: null },
    });
    return updated;
  }
}

