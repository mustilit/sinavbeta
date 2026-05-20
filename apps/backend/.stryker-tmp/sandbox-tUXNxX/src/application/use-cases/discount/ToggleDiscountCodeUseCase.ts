// @ts-nocheck
import { prisma } from '../../../infrastructure/database/prisma';
import { AppError } from '../../errors/AppError';
import type { IUserRepository } from '../../../domain/interfaces/IUserRepository';

/**
 * FR-E-09: Eğitici kendi indirim kodunu pasife alır veya tekrar aktive eder.
 * Kod veritabanından silinmez; isActive alanı toggle edilir.
 *
 * NOT: Prisma generate DLL kilidi nedeniyle çalışamadığından $queryRaw/$executeRaw
 * ile doğrudan SQL kullanılır; prisma generate sonrası temizlenebilir.
 */
export class ToggleDiscountCodeUseCase {
  constructor(private readonly userRepo: IUserRepository) {}

  async execute(educatorId: string, codeId: string) {
    const user = await this.userRepo.findById(educatorId);
    if (!user) throw new AppError('USER_NOT_FOUND', 'User not found', 404);
    if (user.role !== 'EDUCATOR') throw new AppError('USER_NOT_EDUCATOR', 'User is not an educator', 403);

    // Kodu oku — $queryRaw: Prisma client yeniden üretilmeden isActive okunamaz
    const rows = await prisma.$queryRaw<
      Array<{ id: string; code: string; createdById: string | null; isActive: boolean;
               percentOff: number; maxUses: number | null; usedCount: number;
               validFrom: Date | null; validUntil: Date | null; description: string | null; createdAt: Date }>
    >`SELECT id, code, "createdById", "isActive", "percentOff", "maxUses", "usedCount",
             "validFrom", "validUntil", description, "createdAt"
      FROM discount_codes WHERE id = ${codeId} LIMIT 1`;

    if (!rows.length) throw new AppError('NOT_FOUND', 'Discount code not found', 404);
    const row = rows[0];
    if (row.createdById !== educatorId) {
      throw new AppError('FORBIDDEN_NOT_OWNER', 'You can only manage your own discount codes', 403);
    }

    const newIsActive = !row.isActive;
    await prisma.$executeRaw`UPDATE discount_codes SET "isActive" = ${newIsActive} WHERE id = ${codeId}`;

    return {
      id: row.id,
      code: row.code,
      isActive: newIsActive,
      percentOff: row.percentOff,
      maxUses: row.maxUses,
      usedCount: row.usedCount,
      validFrom: row.validFrom,
      validUntil: row.validUntil,
      description: row.description,
      createdAt: row.createdAt,
    };
  }
}
