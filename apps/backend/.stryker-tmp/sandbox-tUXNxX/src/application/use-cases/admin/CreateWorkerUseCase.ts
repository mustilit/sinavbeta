// @ts-nocheck
import { Injectable } from '@nestjs/common';
import { prisma } from '../../../infrastructure/database/prisma';
import * as bcrypt from 'bcryptjs';
import { AppError } from '../../errors/AppError';
import { getDefaultTenantId } from '../../../common/tenant';

/**
 * Yeni bir Worker kullanıcısı oluşturur.
 * Worker = sınırlı admin; erişebileceği sayfalar workerPermission.pages alanında saklanır.
 */
@Injectable()
export class CreateWorkerUseCase {
  async execute(input: {
    email: string;
    username: string;
    password: string;
    pages: string[];
  }) {
    const existing = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
    if (existing) throw new AppError('EMAIL_TAKEN', 'Bu e-posta zaten kullanımda', 409);

    const existingUsername = await prisma.user.findUnique({ where: { username: input.username } });
    if (existingUsername) throw new AppError('USERNAME_TAKEN', 'Bu kullanıcı adı zaten kullanımda', 409);

    const passwordHash = await bcrypt.hash(input.password, 12);
    const tenantId = getDefaultTenantId();

    const user = await prisma.user.create({
      data: {
        email: input.email.toLowerCase(),
        username: input.username,
        passwordHash,
        role: 'WORKER',
        status: 'ACTIVE',
        tenantId,
        workerPermission: {
          create: { pages: input.pages },
        },
      },
      include: { workerPermission: true },
    });

    return {
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
      pages: user.workerPermission?.pages ?? [],
      createdAt: user.createdAt,
    };
  }
}
