// @ts-nocheck
import { prisma } from '../../../infrastructure/database/prisma';

export class ListLiveSessionTiersUseCase {
  async execute(onlyActive = true) {
    return prisma.liveSessionTier.findMany({
      where: onlyActive ? { isActive: true } : undefined,
      orderBy: { order: 'asc' },
    });
  }
}
