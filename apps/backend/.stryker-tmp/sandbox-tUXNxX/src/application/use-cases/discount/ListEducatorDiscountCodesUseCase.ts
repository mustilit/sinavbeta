// @ts-nocheck
import { prisma } from '../../../infrastructure/database/prisma';
import { AppError } from '../../errors/AppError';
import type { IUserRepository } from '../../../domain/interfaces/IUserRepository';

/** FR-E-09: Eğitici kendi indirim kodlarını listeler */
export class ListEducatorDiscountCodesUseCase {
  constructor(private readonly userRepo: IUserRepository) {}

  async execute(educatorId: string) {
    const user = await this.userRepo.findById(educatorId);
    if (!user) throw new AppError('USER_NOT_FOUND', 'User not found', 404);
    if (user.role !== 'EDUCATOR') throw new AppError('USER_NOT_EDUCATOR', 'User is not an educator', 403);
    if (user.status === 'SUSPENDED') throw new AppError('EDUCATOR_SUSPENDED', 'Educator account is suspended', 403);

    // $queryRaw: Prisma client yeniden üretilmeden isActive okunamaz (DLL kilidi geçici workaround)
    const items = await prisma.$queryRaw<
      Array<{ id: string; code: string; percentOff: number; maxUses: number | null;
               usedCount: number; isActive: boolean; validFrom: Date | null;
               validUntil: Date | null; description: string | null; createdAt: Date }>
    >`SELECT id, code, "percentOff", "maxUses", "usedCount", "isActive",
             "validFrom", "validUntil", description, "createdAt"
      FROM discount_codes WHERE "createdById" = ${educatorId}
      ORDER BY "createdAt" DESC`;

    return items.map((d) => ({
      id: d.id,
      code: d.code,
      percentOff: d.percentOff,
      maxUses: d.maxUses,
      usedCount: d.usedCount,
      isActive: d.isActive ?? true,
      validFrom: d.validFrom,
      validUntil: d.validUntil,
      description: d.description,
      createdAt: d.createdAt,
    }));
  }
}
