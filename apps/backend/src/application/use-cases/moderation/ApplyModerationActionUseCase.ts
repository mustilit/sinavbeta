import { Injectable } from '@nestjs/common';
import { ModerationActionType } from '@prisma/client';
import { prisma } from '../../../infrastructure/database/prisma';
import { AppError } from '../../errors/AppError';
import { IModerationActionRepository } from '../../../domain/interfaces/IModerationActionRepository';
import { ModerationActionRecord } from '../../../domain/interfaces/IModerationActionRepository';

export interface ApplyModerationActionParams {
  tenantId: string;
  userId: string;
  actorId: string;
  actionType: ModerationActionType;
  reason: string;
  durationDays?: number | null;
  violationId?: string | null;
}

@Injectable()
export class ApplyModerationActionUseCase {
  constructor(private readonly actionRepo: IModerationActionRepository) {}

  async execute(params: ApplyModerationActionParams): Promise<ModerationActionRecord> {
    if (!params.reason || params.reason.trim().length < 20) {
      throw new AppError(
        'REASON_TOO_SHORT',
        'Gerekçe en az 20 karakter olmalıdır',
        400,
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: params.userId },
      select: { id: true, isBanned: true, suspendedUntil: true },
    });

    if (!user) {
      throw new AppError('USER_NOT_FOUND', 'Kullanıcı bulunamadı', 404);
    }

    let expiresAt: Date | null = null;
    if (
      params.actionType === 'ACCOUNT_SUSPENDED' &&
      params.durationDays != null
    ) {
      expiresAt = new Date(
        Date.now() + params.durationDays * 24 * 60 * 60 * 1000,
      );
    }

    const metadata: Record<string, unknown> = {
      reason: params.reason,
      ...(params.violationId && { violationId: params.violationId }),
    };

    // actionRepo.create ve user.update aynı transaction içinde atomik olarak çalışır
    const action = await prisma.$transaction(async (tx) => {
      const created = await tx.moderationAction.create({
        data: {
          tenantId: params.tenantId,
          userId: params.userId,
          actorId: params.actorId ?? null,
          actionType: params.actionType,
          reason: params.reason ?? null,
          metadata: metadata as any,
          expiresAt,
        },
        select: {
          id: true,
          tenantId: true,
          userId: true,
          actorId: true,
          actionType: true,
          reason: true,
          metadata: true,
          expiresAt: true,
          createdAt: true,
        },
      });

      if (params.actionType === 'ACCOUNT_SUSPENDED') {
        await tx.user.update({
          where: { id: params.userId },
          data: { suspendedUntil: expiresAt },
        });
      } else if (params.actionType === 'ACCOUNT_BANNED') {
        await tx.user.update({
          where: { id: params.userId },
          data: { isBanned: true },
        });
      }

      return created;
    });

    return action;
  }
}
