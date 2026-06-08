import { randomBytes } from 'crypto';
import { prisma } from '../../../infrastructure/database/prisma';
import { EmailService } from '../../services/email/EmailService';

/**
 * Email doğrulama token'ı üretir ve doğrulama e-postası kuyruğa atar.
 *
 * İki mod:
 *   1. pendingRegistrationId: PendingRegistration tablosundaki token'ı alır ve mail gönderir.
 *      Yeni kayıt akışı (pending-first) için.
 *   2. userId: User tablosundaki kaydı günceller, token yazar, mail gönderir.
 *      Eski kayıt akışı / resend-verification için. Backward compat.
 *
 * Token: cryptographically random 32-byte hex (64 karakter). 24 saat geçerli.
 */
export class SendEmailVerificationUseCase {
  constructor(private readonly emailService: EmailService = new EmailService()) {}

  async execute(input: {
    pendingRegistrationId?: string;
    userId?: string;
    appBaseUrl?: string;
  }): Promise<{ token: string; expiresAt: Date }> {
    // Doğrulama linki tabanı: APP_BASE_URL set değilse CLIENT_URL/FRONTEND_URL'e
    // düş (prod'da bunlar set). Aksi halde link http://localhost:5174'e gidip
    // kullanıcıda ölü adres oluyordu (doğrulama butonu sonuç vermiyordu).
    const appBaseUrl = (
      input.appBaseUrl ??
      process.env.APP_BASE_URL ??
      process.env.CLIENT_URL ??
      process.env.FRONTEND_URL ??
      'http://localhost:5174'
    ).replace(/\/+$/, '');

    if (input.pendingRegistrationId) {
      return this.sendForPending(input.pendingRegistrationId, appBaseUrl);
    }
    if (input.userId) {
      return this.sendForUser(input.userId, appBaseUrl);
    }
    throw new Error('pendingRegistrationId veya userId gerekli');
  }

  private async sendForPending(pendingId: string, appBaseUrl: string): Promise<{ token: string; expiresAt: Date }> {
    // Raw SQL — Prisma client regenerate edilemediği için (Windows EPERM)
    const pendingRows = await prisma.$queryRaw<any[]>`
      SELECT id, email, username, "verificationToken", "verificationTokenExpiresAt", "tenantId"
      FROM pending_registrations WHERE id = ${pendingId} LIMIT 1
    `;
    const pending = pendingRows[0];
    if (!pending) throw new Error('PENDING_NOT_FOUND');

    const verifyUrl = `${appBaseUrl}/VerifyEmail?token=${encodeURIComponent(pending.verificationToken)}`;

    try {
      await this.emailService.send({
        tenantId: pending.tenantId,
        templateKey: 'email-verification',
        to: { email: pending.email },
        data: {
          user: { username: pending.username },
          verifyUrl,
        },
        bypassPreferences: true,
        bypassSendWindow: true,
      });
    } catch {
      // Email gönderim hatası kayıt akışını bozmaz
    }

    return { token: pending.verificationToken, expiresAt: pending.verificationTokenExpiresAt };
  }

  private async sendForUser(userId: string, appBaseUrl: string): Promise<{ token: string; expiresAt: Date }> {
    const user: any = await (prisma as any).user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, username: true, tenantId: true, emailVerified: true },
    });
    if (!user) throw new Error('USER_NOT_FOUND');

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await (prisma as any).user.update({
      where: { id: user.id },
      data: {
        emailVerificationToken: token,
        emailVerificationTokenExpiresAt: expiresAt,
      },
    });

    const verifyUrl = `${appBaseUrl}/VerifyEmail?token=${encodeURIComponent(token)}`;

    try {
      await this.emailService.send({
        tenantId: user.tenantId,
        templateKey: 'email-verification',
        to: { userId: user.id, email: user.email },
        data: {
          user: { username: user.username },
          verifyUrl,
        },
        bypassPreferences: true,
        bypassSendWindow: true,
      });
    } catch {
      // Email gönderim hatası kayıt akışını bozmaz
    }

    return { token, expiresAt };
  }
}
