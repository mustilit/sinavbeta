// @ts-nocheck
import { prisma } from '../../../infrastructure/database/prisma';
import { AppError } from '../../errors/AppError';
import { ensureEducatorActive } from '../../policies/ensureEducatorActive';
import type { IUserRepository } from '../../../domain/interfaces/IUserRepository';

/** FR-E-07: Eğitici satın aldığı reklamları listeler */
export class ListEducatorAdPurchasesUseCase {
  constructor(private readonly userRepo: IUserRepository) {}

  async execute(educatorId: string) {
    const user = await this.userRepo.findById(educatorId);
    if (!user) throw new AppError('USER_NOT_FOUND', 'User not found', 404);
    ensureEducatorActive(user);

    const items = await prisma.adPurchase.findMany({
      where: { educatorId },
      include: { adPackage: true, test: { select: { id: true, title: true } } },
      orderBy: { createdAt: 'desc' },
    });

    return items.map((p) => ({
      id: p.id,
      adPackage: { id: p.adPackage.id, name: p.adPackage.name },
      test: p.test,
      validUntil: p.validUntil,
      impressionsRemaining: p.impressionsRemaining,
      createdAt: p.createdAt,
    }));
  }
}
