/**
 * DisableTwoFactorUseCase — 2FA'yı devre dışı bırakma akışı.
 *
 * Güvenlik: mevcut şifre tekrar doğrulanır. Şifre yanlışsa 401.
 * Başarılı olursa secret + recovery temizlenir ve `AUTH_MFA_DISABLED` audit log atılır.
 */
// @ts-nocheck

import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { prisma } from '../../../infrastructure/database/prisma';
import { PasswordService } from '../../../infrastructure/services/PasswordService';
import { AuditLogger, AuditContext } from '../../../infrastructure/audit/AuditLogger';

@Injectable()
export class DisableTwoFactorUseCase {
  constructor(
    private readonly passwordService: PasswordService,
    private readonly audit: AuditLogger,
  ) {}

  async execute(ctx: AuditContext, userId: string, password: string): Promise<void> {
    if (!password || typeof password !== 'string') {
      throw new BadRequestException('Şifre gerekli');
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException();
    }
    if (!(user as any).twoFactorEnabled) {
      throw new BadRequestException('2FA zaten devre dışı');
    }

    const ok = await this.passwordService.compare(password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Şifre yanlış');
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorEnabled: false,
        twoFactorSecret: null,
        twoFactorRecovery: [],
        twoFactorEnabledAt: null,
      } as any,
    });

    await this.audit.log(ctx, {
      action: 'AUTH_MFA_DISABLED',
      entityType: 'User',
      entityId: userId,
    });
  }
}
