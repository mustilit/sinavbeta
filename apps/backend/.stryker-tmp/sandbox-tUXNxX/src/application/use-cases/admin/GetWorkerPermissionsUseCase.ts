// @ts-nocheck
import { Injectable } from '@nestjs/common';
import { prisma } from '../../../infrastructure/database/prisma';
import { AppError } from '../../errors/AppError';

/**
 * Bir worker kullanıcısının sayfa izinlerini döndürür.
 */
@Injectable()
export class GetWorkerPermissionsUseCase {
  async execute(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { workerPermission: true },
    });
    if (!user) throw new AppError('USER_NOT_FOUND', 'Kullanıcı bulunamadı', 404);
    if (user.role !== 'WORKER') throw new AppError('NOT_WORKER', 'Bu kullanıcı worker değil', 400);
    return {
      userId: user.id,
      username: user.username,
      email: user.email,
      pages: user.workerPermission?.pages ?? [],
    };
  }
}
