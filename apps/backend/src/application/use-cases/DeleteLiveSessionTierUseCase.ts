import { BadRequestException } from '@nestjs/common';
import { prisma } from '../../infrastructure/database/prisma';
import { AppError } from '../errors/AppError';

export class DeleteLiveSessionTierUseCase {
  async execute(id: string) {
    const tier = await prisma.liveSessionTier.findUnique({
      where: { id },
      include: { sessions: { take: 1 } },
    });
    if (!tier) throw new AppError('TIER_NOT_FOUND', 'Tier bulunamadı', 404);
    if (tier.sessions.length > 0) {
      throw new BadRequestException({
        code: 'TIER_IN_USE',
        message: 'Bu tiere ait oturumlar var, silinemez',
      });
    }
    await prisma.liveSessionTier.delete({ where: { id } });
    return { success: true };
  }
}
