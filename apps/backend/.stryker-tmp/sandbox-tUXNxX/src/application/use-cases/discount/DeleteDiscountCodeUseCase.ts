// @ts-nocheck
import { prisma } from '../../../infrastructure/database/prisma';
import { AppError } from '../../errors/AppError';
import type { IUserRepository } from '../../../domain/interfaces/IUserRepository';

/** Eğitici kendi indirim kodunu siler */
export class DeleteDiscountCodeUseCase {
  constructor(private readonly userRepo: IUserRepository) {}

  async execute(educatorId: string, codeId: string) {
    const user = await this.userRepo.findById(educatorId);
    if (!user) throw new AppError('USER_NOT_FOUND', 'User not found', 404);
    if (user.role !== 'EDUCATOR') throw new AppError('USER_NOT_EDUCATOR', 'User is not an educator', 403);

    const code = await prisma.discountCode.findUnique({ where: { id: codeId } });
    if (!code) throw new AppError('NOT_FOUND', 'Discount code not found', 404);
    if (code.createdById !== educatorId) {
      throw new AppError('FORBIDDEN_NOT_OWNER', 'You can only delete your own discount codes', 403);
    }

    await prisma.discountCode.delete({ where: { id: codeId } });
    return { deleted: true };
  }
}
