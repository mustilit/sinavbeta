import { createHash, randomBytes } from 'crypto';
import { prisma } from '../../../infrastructure/database/prisma';
import { SendEmailUseCase } from '../email/SendEmailUseCase';
import { getDefaultTenantId } from '../../../common/tenant';

const TRUST_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 saat

/** Cihaz değerlendirme sonucu. */
export interface DeviceEvaluation {
  /** Daha önce hiç görülmemiş (yeni) cihaz mı? */
  isNewDevice: boolean;
  /** Cihaz güvenilir (trusted) mı? */
  trusted: boolean;
  /**
   * Doğrulama ZORUNLU mu? Yalnızca `requireTrust` (ADMIN/WORKER) verildiğinde ve cihaz
   * güvenilir değilken `true` döner. LoginUseCase bu durumda girişi engeller.
   */
  requiresVerification: boolean;
}

/**
 * Yeni cihazdan giriş tespiti + bildirim / doğrulama.
 *
 * Akış:
 *  1) fingerprint = sha256(userAgent + ip)
 *  2) Kayıtlı cihaz var mı?
 *     - Varsa & trusted → izin (mail yok)
 *     - Varsa & güvenilmez → ADMIN/WORKER ise doğrulama gerekir (token tazele + mail);
 *       aday/eğitici ise sessiz (zaten önceden uyarıldı)
 *  3) Hiç cihaz yoksa (ilk giriş) → "kayıt cihazı" otomatik trusted, mail yok
 *  4) Yeni (ekstra) cihaz → kaydet (trusted=false, trustToken) + `new-device-login` maili
 *
 * Mail iki link içerir:
 *  - verifyUrl: "Bu bendim" → cihaz trusted=true
 *  - resetUrl:  "Ben değildim" → şifre sıfırlama
 *
 * GÜVENLİK: `requireTrust=true` (ADMIN/WORKER) için güvenilmeyen cihaz → `requiresVerification`.
 * Aday/eğitici için sadece bilgilendirme; giriş serbest.
 *
 * Best-effort: mail veya DB hatası login akışını kesmez (fail-soft → requiresVerification:false).
 */
export class NotifyNewDeviceLoginUseCase {
  constructor(
    private readonly sendEmail: SendEmailUseCase | null,
  ) {}

  async execute(input: {
    userId: string;
    userEmail: string;
    username?: string | null;
    userRole: 'CANDIDATE' | 'EDUCATOR' | 'ADMIN' | 'WORKER';
    userAgent: string | undefined;
    ip: string | undefined;
    /** ADMIN/WORKER: cihaz güvenilir değilse doğrulama ZORUNLU (login bloke edilir). */
    requireTrust?: boolean;
  }): Promise<DeviceEvaluation> {
    try {
      const ua = (input.userAgent || '').slice(0, 500);
      const ip = (input.ip || '').slice(0, 64);
      const fingerprint = createHash('sha256').update(`${ua}|${ip}`).digest('hex');

      const existing = await prisma.userDevice.findUnique({
        where: { userId_fingerprint: { userId: input.userId, fingerprint } },
      });

      if (existing) {
        await prisma.userDevice.update({
          where: { id: existing.id },
          data: { lastSeenAt: new Date() },
        });

        if (existing.trusted) {
          return { isNewDevice: false, trusted: true, requiresVerification: false };
        }

        // Bilinen ama güvenilmeyen cihaz.
        if (input.requireTrust) {
          // Geçerli (süresi dolmamış) token varsa önceki mail hâlâ kullanılabilir →
          // tekrar deneyişte spam yapma; sadece token yok/expired ise tazele + mail.
          const expired =
            !existing.trustTokenExpiresAt || existing.trustTokenExpiresAt.getTime() < Date.now();
          if (!existing.trustToken || expired) {
            const token = randomBytes(32).toString('hex');
            await prisma.userDevice.update({
              where: { id: existing.id },
              data: { trustToken: token, trustTokenExpiresAt: new Date(Date.now() + TRUST_TOKEN_TTL_MS) },
            });
            await this.sendVerifyEmail(input, existing.id, token, ua, ip);
          }
          return { isNewDevice: false, trusted: false, requiresVerification: true };
        }

        return { isNewDevice: false, trusted: false, requiresVerification: false };
      }

      // İlk cihaz mı? — kullanıcının hiç cihaz kaydı yoksa bunu "kayıt cihazı" olarak
      // otomatik trusted yap (admin dahil — aksi halde ilk girişte kendini kilitler).
      const deviceCount = await prisma.userDevice.count({ where: { userId: input.userId } });
      if (deviceCount === 0) {
        await prisma.userDevice.create({
          data: {
            userId: input.userId,
            fingerprint,
            userAgent: ua || null,
            ip: ip || null,
            trusted: true,
          },
        });
        return { isNewDevice: false, trusted: true, requiresVerification: false };
      }

      // Yeni (ekstra) cihaz — kaydet + uyarı/doğrulama maili tetikle
      const trustToken = randomBytes(32).toString('hex');
      const device = await prisma.userDevice.create({
        data: {
          userId: input.userId,
          fingerprint,
          userAgent: ua || null,
          ip: ip || null,
          trusted: false,
          trustToken,
          trustTokenExpiresAt: new Date(Date.now() + TRUST_TOKEN_TTL_MS),
        },
      });
      await this.sendVerifyEmail(input, device.id, trustToken, ua, ip);
      return { isNewDevice: true, trusted: false, requiresVerification: !!input.requireTrust };
    } catch (e) {
      console.warn('[NotifyNewDeviceLogin] failed:', (e as Error)?.message);
      // Fail-soft: değerlendirme yapılamadı → bloklamayız (login için DB zaten çalıştı,
      // bu sorgular nadiren patlar). Admin'i geçici hatada kilitlememek için.
      return { isNewDevice: false, trusted: false, requiresVerification: false };
    }
  }

  /** `new-device-login` doğrulama mailini gönderir (best-effort). */
  private async sendVerifyEmail(
    input: { userId: string; userEmail: string; username?: string | null; userRole: string; requireTrust?: boolean },
    deviceId: string,
    token: string,
    ua: string,
    ip: string,
  ): Promise<void> {
    if (!this.sendEmail) return;
    // Frontend URL tabanı: FRONTEND_URL yoksa CLIENT_URL'e düş.
    const baseUrl = (process.env.FRONTEND_URL || process.env.CLIENT_URL || 'http://localhost:5174').replace(/\/$/, '');
    const verifyUrl = `${baseUrl}/DeviceVerify?token=${encodeURIComponent(token)}`;
    const resetUrl = `${baseUrl}/ForgotPassword?email=${encodeURIComponent(input.userEmail)}`;
    try {
      await this.sendEmail.execute({
        tenantId: getDefaultTenantId(),
        templateKey: 'new-device-login',
        to: { userId: input.userId, email: input.userEmail, role: input.userRole as any },
        bypassPreferences: true, // güvenlik uyarısı — kullanıcı tercihinden bağımsız
        bypassSendWindow: true,  // quiet hours gözetilmez — anında
        data: {
          user: { username: input.username || input.userEmail },
          loginAt: new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }),
          userAgent: ua || 'Bilinmiyor',
          ip: ip || 'Bilinmiyor',
          verifyUrl,
          resetUrl,
          // Admin/worker için giriş bu cihaz onaylanana dek engellenir — şablon
          // bu bilgiyi gösterebilir (kullanmazsa zararsız).
          verificationRequired: !!input.requireTrust,
        },
        relatedEntity: { type: 'UserDevice', id: deviceId },
      });
    } catch (e) {
      console.warn('[NotifyNewDeviceLogin] mail failed:', (e as Error)?.message);
    }
  }
}
