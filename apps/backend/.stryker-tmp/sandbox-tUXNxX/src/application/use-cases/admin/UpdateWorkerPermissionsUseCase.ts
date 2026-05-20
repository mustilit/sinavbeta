// @ts-nocheck
import { Injectable } from '@nestjs/common';
import { prisma } from '../../../infrastructure/database/prisma';
import { AppError } from '../../errors/AppError';

/**
 * Worker kullanıcısının sayfa izinlerini günceller (upsert).
 */
@Injectable()
export class UpdateWorkerPermissionsUseCase {
  async execute(userId: string, pages: string[]) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError('USER_NOT_FOUND', 'Kullanıcı bulunamadı', 404);
    if (user.role !== 'WORKER') throw new AppError('NOT_WORKER', 'Bu kullanıcı worker değil', 400);

    const permission = await prisma.workerPermission.upsert({
      where: { userId },
      create: { userId, pages },
      update: { pages },
    });
    return { userId, pages: permission.pages };
  }
}
