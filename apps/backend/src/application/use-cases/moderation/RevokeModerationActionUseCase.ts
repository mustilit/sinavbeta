import { Injectable } from '@nestjs/common';
import { prisma } from '../../../infrastructure/database/prisma';
import { AppError } from '../../errors/AppError';
import { IModerationActionRepository } from '../../../domain/interfaces/IModerationActionRepository';

export interface RevokeModerationActionParams {
  actionId: string;
  actorId: string;
  tenantId: string;
}

@Injectable()
export class RevokeModerationActionUseCase {
  constructor(private readonly actionRepo: IModerationActionRepository) {}

  async execute(params: RevokeModerationActionParams): Promise<void> {
    const action = await this.actionRepo.findById(params.actionId);

    if (!action) {
      throw new AppError('ACTION_NOT_FOUND', 'Aksiyon bulunamadı', 404);
    }

    if (action.tenantId !== params.tenantId) {
      throw new AppError('FORBIDDEN', 'Bu aksiyona erişim yetkiniz yok', 403);
    }

    await prisma.$transaction(async (tx) => {
      // Kullanıcı durumunu geri al
      if (action.actionType === 'ACCOUNT_SUSPENDED') {
        await tx.user.update({
          where: { id: action.userId },
          data: { suspendedUntil: null },
        });
      } else if (action.actionType === 'ACCOUNT_BANNED') {
        await tx.user.update({
          where: { id: action.userId },
          data: { isBanned: false },
        });
      }

      // Audit iz bırak
      await tx.moderationAction.create({
        data: {
          tenantId: params.tenantId,
          userId: action.userId,
          actorId: params.actorId,
          actionType: 'WARN',
          reason: `Geri alındı: ${action.actionType} (id=${params.actionId})`,
          metadata: { revokedActionId: params.actionId },
        },
      });
    });
  }
}
