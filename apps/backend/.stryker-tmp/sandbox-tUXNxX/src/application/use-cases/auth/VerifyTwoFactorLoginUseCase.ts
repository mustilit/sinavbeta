/**
 * VerifyTwoFactorLoginUseCase — login akışının 2. faktör adımı.
 *
 * Önce LoginUseCase password'u doğrular ve eğer kullanıcı 2FA-enabled ise
 * kısa-ömürlü (5 dk) `pendingMfaToken` döner. Frontend kodu sorar ve burayı
 * çağırır.
 *
 * Bu use-case:
 *   - pendingMfaToken decode → userId al
 *   - User'ı oku, twoFactorSecret'ı decrypt et
 *   - Önce TOTP doğrulama, başarısız ise recovery code yolunu dene
 *   - Başarılı → asıl access token döner
 *   - Audit log: success/fail (AUTH_LOGIN_SUCCESS / AUTH_LOGIN_FAIL / AUTH_MFA_RECOVERY_USED)
 */
// @ts-nocheck

import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { prisma } from '../../../infrastructure/database/prisma';
import { TwoFactorService } from '../../../infrastructure/security/TwoFactorService';
import { decrypt } from '../../../infrastructure/security/encryption';
import { JwtService } from '../../../infrastructure/services/JwtService';
import { AuditLogger, AuditContext } from '../../../infrastructure/audit/AuditLogger';

const JWT_SECRET = process.env.JWT_SECRET || 'dal-secret-change-in-production';
const PENDING_MFA_AUD = '2fa-login';

interface PendingMfaPayload {
  sub: string;
  aud?: string;
  mfa?: string;
}

export interface VerifyLoginResult {
  accessToken: string;
  user: {
    id: string;
    email: string;
    username: string;
    role: string;
    status: string;
  };
}

@Injectable()
export class VerifyTwoFactorLoginUseCase {
  constructor(
    private readonly tfa: TwoFactorService,
    private readonly jwtService: JwtService,
    private readonly audit: AuditLogger,
  ) {}

  async execute(
    ctx: AuditContext,
    pendingMfaToken: string,
    code: string,
  ): Promise<VerifyLoginResult> {
    if (!pendingMfaToken || !code) {
      throw new BadRequestException('pendingMfaToken ve code gerekli');
    }

    let payload: PendingMfaPayload;
    try {
      payload = jwt.verify(pendingMfaToken, JWT_SECRET) as PendingMfaPayload;
    } catch {
      throw new UnauthorizedException('Geçersiz veya süresi dolmuş MFA token\'ı');
    }
    if (!payload?.sub || (payload.aud && payload.aud !== PENDING_MFA_AUD)) {
      throw new UnauthorizedException('Geçersiz MFA token\'ı');
    }

    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !(user as any).twoFactorEnabled || !(user as any).twoFactorSecret) {
      throw new UnauthorizedException();
    }

    let plainSecret: string;
    try {
      plainSecret = decrypt((user as any).twoFactorSecret);
    } catch {
      // Şifrelenmiş secret bozuk — defansif: login fail
      await this.audit.log(
        { ...ctx, userId: user.id, email: user.email, role: user.role },
        {
          action: 'AUTH_LOGIN_FAIL',
          entityType: 'User',
          entityId: user.id,
          metadata: { reason: 'mfa_secret_corrupt' },
        },
      );
      throw new UnauthorizedException();
    }

    // 1) TOTP dene
    const totpOk = this.tfa.verify(plainSecret, code);
    let recoveryUsed = false;

    if (!totpOk) {
      // 2) Recovery code dene
      const recoveryList: string[] = ((user as any).twoFactorRecovery ?? []) as string[];
      const result = await this.tfa.consumeRecoveryCode(recoveryList, code);
      if (!result.ok) {
        await this.audit.log(
          { ...ctx, userId: user.id, email: user.email, role: user.role },
          {
            action: 'AUTH_LOGIN_FAIL',
            entityType: 'User',
            entityId: user.id,
            metadata: { reason: 'mfa_invalid_code' },
          },
        );
        throw new UnauthorizedException('Kod yanlış');
      }
      // Recovery kullanıldı → kalan listeyi kaydet
      await prisma.user.update({
        where: { id: user.id },
        data: { twoFactorRecovery: result.remaining ?? [] } as any,
      });
      recoveryUsed = true;
      await this.audit.log(
        { ...ctx, userId: user.id, email: user.email, role: user.role },
        {
          action: 'AUTH_MFA_RECOVERY_USED',
          entityType: 'User',
          entityId: user.id,
          metadata: { remainingCount: result.remaining?.length ?? 0 },
        },
      );
    }

    // Asıl access token
    const accessToken = this.jwtService.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    await this.audit.log(
      { ...ctx, userId: user.id, email: user.email, role: user.role },
      {
        action: 'AUTH_LOGIN_SUCCESS',
        entityType: 'User',
        entityId: user.id,
        metadata: { mfa: true, recoveryUsed },
      },
    );

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
        status: user.status,
      },
    };
  }
}
