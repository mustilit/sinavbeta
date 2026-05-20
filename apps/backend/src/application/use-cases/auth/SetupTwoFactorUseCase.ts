/**
 * SetupTwoFactorUseCase — kullanıcının 2FA'yı etkinleştirme akışı.
 *
 * Akış:
 *   1. /auth/2fa/setup → server secret + QR + recovery döner.
 *   2. Frontend QR gösterir, kullanıcı authenticator app'e ekler.
 *   3. Kullanıcı 6 haneli kodu girer → /auth/2fa/verify-setup
 *   4. Verify başarılıysa secret + recovery DB'ye yazılır, audit log atılır.
 *
 * Önemli: secret/recovery DB'ye yazılmadan ÖNCE encryption helper'ı kullanılır.
 *
 * Pending state stratejisi: state-less JWT (5 dakika TTL).
 * Token içinde {sub: userId, secret, recovery: hashed[]} taşınır; sunucu Redis'e
 * yazmaz. Token süresi 5 dakikadır.
 *
 * İlgili skill: docs/proposed-claude/skills/security-hardening/SKILL.md
 */
import { Injectable, BadRequestException, UnauthorizedException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { prisma } from '../../../infrastructure/database/prisma';
import { TwoFactorService, TwoFactorSetup } from '../../../infrastructure/security/TwoFactorService';
import { encrypt } from '../../../infrastructure/security/encryption';
import { AuditLogger, AuditContext } from '../../../infrastructure/audit/AuditLogger';

const PENDING_SETUP_TTL_SECONDS = 300; // 5 dk
const JWT_SECRET = process.env.JWT_SECRET || 'dal-secret-change-in-production';
const PENDING_SETUP_AUD = '2fa-setup';

interface PendingSetupPayload {
  sub: string;
  aud: string;
  secret: string;
  recovery: string[];
}

export interface SetupResponse {
  /** Authenticator URI — QR olarak göster. */
  otpauthUrl: string;
  /** QR PNG (data URL). */
  qrPng: string;
  /** Recovery code'lar — tek sefer kullanıcıya göster. */
  recoveryCodes: string[];
  /** Pending secret token — verify-setup adımında geri yolla (5 dk TTL). */
  pendingSecretToken: string;
}

@Injectable()
export class SetupTwoFactorUseCase {
  constructor(
    private readonly tfa: TwoFactorService,
    private readonly audit: AuditLogger,
  ) {}

  /**
   * Adım 1: secret üret, QR + recovery döner. Secret henüz DB'ye YAZILMAZ —
   * kullanıcı `verify-setup` ile doğrulayana kadar pending state'te tutulur.
   * Pending state için kısa-ömürlü JWT (5 dk) içine secret + hashed recovery gömülür.
   */
  async setup(_ctx: AuditContext, userId: string): Promise<SetupResponse> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();

    if ((user as any).twoFactorEnabled) {
      throw new BadRequestException('2FA zaten etkin. Devre dışı bırakıp tekrar deneyin.');
    }

    const tfa: TwoFactorSetup = await this.tfa.setup(user.email);

    const payload: PendingSetupPayload = {
      sub: userId,
      aud: PENDING_SETUP_AUD,
      secret: tfa.secret,
      recovery: tfa.recoveryHashed,
    };
    const pendingSecretToken = jwt.sign(payload, JWT_SECRET, {
      expiresIn: PENDING_SETUP_TTL_SECONDS,
    });

    return {
      otpauthUrl: tfa.otpauthUrl,
      qrPng: tfa.qrPng,
      recoveryCodes: tfa.recoveryPlain,
      pendingSecretToken,
    };
  }

  /**
   * Adım 2: kullanıcı kodu girdi → secret'ı DB'ye yaz, audit log at.
   */
  async verifySetup(
    ctx: AuditContext,
    userId: string,
    pendingSecretToken: string,
    code: string,
  ): Promise<void> {
    let decoded: PendingSetupPayload;
    try {
      decoded = jwt.verify(pendingSecretToken, JWT_SECRET) as PendingSetupPayload;
    } catch {
      throw new BadRequestException('Geçersiz veya süresi dolmuş kurulum token\'ı');
    }

    if (decoded?.aud !== PENDING_SETUP_AUD) {
      throw new BadRequestException('Geçersiz kurulum token\'ı');
    }
    if (decoded.sub !== userId) {
      throw new UnauthorizedException('Token kullanıcı eşleşmiyor');
    }
    if (!decoded.secret || !Array.isArray(decoded.recovery)) {
      throw new BadRequestException('Bozuk kurulum payload\'ı');
    }

    if (!this.tfa.verify(decoded.secret, code)) {
      throw new BadRequestException(
        'Doğrulama kodu yanlış. Authenticator app saatini kontrol edin.',
      );
    }

    const encryptedSecret = encrypt(decoded.secret);

    await prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorEnabled: true,
        twoFactorSecret: encryptedSecret,
        twoFactorRecovery: decoded.recovery,
        twoFactorEnabledAt: new Date(),
      } as any,
    });

    await this.audit.log(ctx, {
      action: 'AUTH_MFA_ENABLED',
      entityType: 'User',
      entityId: userId,
    });
  }
}
