import { Injectable } from '@nestjs/common';
import { ModerationActionType } from '@prisma/client';
import { prisma } from '../database/prisma';
import {
  CreateModerationActionData,
  IModerationActionRepository,
  ModerationActionRecord,
} from '../../domain/interfaces/IModerationActionRepository';

const ACTION_SELECT = {
  id: true,
  tenantId: true,
  userId: true,
  actorId: true,
  actionType: true,
  reason: true,
  metadata: true,
  expiresAt: true,
  createdAt: true,
} as const;

@Injectable()
export class PrismaModerationActionRepository
  implements IModerationActionRepository
{
  async create(data: CreateModerationActionData): Promise<ModerationActionRecord> {
    return prisma.moderationAction.create({
      data: {
        tenantId: data.tenantId,
        userId: data.userId,
        actorId: data.actorId ?? null,
        actionType: data.actionType,
        reason: data.reason ?? null,
        metadata: (data.metadata ?? {}) as any,
        expiresAt: data.expiresAt ?? null,
      },
      select: ACTION_SELECT,
    });
  }

  async findById(id: string): Promise<ModerationActionRecord | null> {
    return prisma.moderationAction.findUnique({
      where: { id },
      select: ACTION_SELECT,
    });
  }

  async findByUser(
    userId: string,
    tenantId: string,
    opts?: { limit?: number },
  ): Promise<ModerationActionRecord[]> {
    return prisma.moderationAction.findMany({
      where: { userId, tenantId },
      select: ACTION_SELECT,
      orderBy: { createdAt: 'desc' },
      take: opts?.limit ?? 50,
    });
  }

  async findActivesuspension(
    userId: string,
    tenantId: string,
  ): Promise<ModerationActionRecord | null> {
    return prisma.moderationAction.findFirst({
      where: {
        userId,
        tenantId,
        actionType: 'ACCOUNT_SUSPENDED',
        expiresAt: { gt: new Date() },
      },
      select: ACTION_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }
}
