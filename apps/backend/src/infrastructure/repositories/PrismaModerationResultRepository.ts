import { Injectable } from '@nestjs/common';
import { ModerationStatus } from '@prisma/client';
import { prisma } from '../database/prisma';
import {
  CreateModerationResultData,
  IModerationResultRepository,
  ModerationResultRecord,
} from '../../domain/interfaces/IModerationResultRepository';

@Injectable()
export class PrismaModerationResultRepository
  implements IModerationResultRepository
{
  async create(data: CreateModerationResultData): Promise<ModerationResultRecord> {
    return prisma.moderationResult.create({
      data: {
        tenantId: data.tenantId,
        userId: data.userId,
        entityType: data.entityType,
        entityId: data.entityId,
        provider: data.provider,
        status: data.status,
        score: data.score ?? null,
        categories: data.categories ?? [],
        flaggedContent: data.flaggedContent ?? null,
        rawResponse: data.rawResponse ?? undefined,
      },
      select: {
        id: true,
        tenantId: true,
        userId: true,
        entityType: true,
        entityId: true,
        provider: true,
        status: true,
        score: true,
        categories: true,
        flaggedContent: true,
        reviewerNote: true,
        rawResponse: true,
        createdAt: true,
        reviewedAt: true,
      },
    });
  }

  async findById(id: string): Promise<ModerationResultRecord | null> {
    return prisma.moderationResult.findUnique({
      where: { id },
      select: {
        id: true,
        tenantId: true,
        userId: true,
        entityType: true,
        entityId: true,
        provider: true,
        status: true,
        score: true,
        categories: true,
        flaggedContent: true,
        reviewerNote: true,
        rawResponse: true,
        createdAt: true,
        reviewedAt: true,
      },
    });
  }

  async updateStatus(
    id: string,
    status: ModerationStatus,
    reviewerNote?: string,
  ): Promise<ModerationResultRecord> {
    return prisma.moderationResult.update({
      where: { id },
      data: {
        status,
        reviewerNote: reviewerNote ?? undefined,
        reviewedAt: new Date(),
      },
      select: {
        id: true,
        tenantId: true,
        userId: true,
        entityType: true,
        entityId: true,
        provider: true,
        status: true,
        score: true,
        categories: true,
        flaggedContent: true,
        reviewerNote: true,
        rawResponse: true,
        createdAt: true,
        reviewedAt: true,
      },
    });
  }

  async findByEntity(
    entityType: string,
    entityId: string,
  ): Promise<ModerationResultRecord[]> {
    return prisma.moderationResult.findMany({
      where: { entityType, entityId },
      select: {
        id: true,
        tenantId: true,
        userId: true,
        entityType: true,
        entityId: true,
        provider: true,
        status: true,
        score: true,
        categories: true,
        flaggedContent: true,
        reviewerNote: true,
        rawResponse: true,
        createdAt: true,
        reviewedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
