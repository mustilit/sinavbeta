import { createHash, randomBytes } from 'crypto';
import { prisma } from '../../../infrastructure/database/prisma';
import { SendEmailUseCase } from '../email/SendEmailUseCase';
import { getDefaultTenantId } from '../../../common/tenant';

/**
 * Yeni cihazdan giriş tespiti + bildirim.
 *
 * Akış:
 *  1) fingerprint = sha256(userAgent + ip)
 *  2) Kullanıcının daha önce kayıtlı bu fingerprint'i var mı?
 *  3) Yoksa: yeni UserDevice satırı oluştur (trustToken ile), `new-device-login` mailini gönder
 *  4) Varsa: lastSeenAt'i güncelle, mail gönderme
 *
 * Mail iki link içerir:
 *  - verifyUrl: aday/eğitici "Bu bendim" → cihaz trusted=true
 *  - resetUrl:  "Ben değildim" → mevcut şifre sıfırlama akışı
 *
 * Best-effort: mail veya DB hatası ana login akışını kesmez.
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
  }): Promise<{ isNewDevice: boolean }> {
    try {
      const ua = (input.userAgent || '').slice(0, 500);
      const ip = (input.ip || '').slice(0, 64);
      const fingerprint = createHash('sha256').update(`${ua}|${ip}`).digest('hex');

      // Önce kayıt var mı? Bulduysak lastSeenAt güncelle, mail GÖNDERME.
      const existing = await prisma.userDevice.findUnique({
        where: { userId_fingerprint: { userId: input.userId, fingerprint } },
      });
      if (existing) {
        await prisma.userDevice.update({
          where: { id: existing.id },
          data: { lastSeenAt: new Date() },
        });
        return { isNewDevice: false };
      }

      // İlk cihaz mı? — kullanıcının daha önce hiç cihaz kaydı yoksa bunu
      // "kayıt cihazı" olarak otomatik trusted yap ve mail gönderme.
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
        return { isNewDevice: false };
      }

      // Yeni (ekstra) cihaz — kaydet + uyarı maili tetikle
      const trustToken = randomBytes(32).toString('hex');
      const trustTokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 saat
      const device = await prisma.userDevice.create({
        data: {
          userId: input.userId,
          fingerprint,
          userAgent: ua || null,
          ip: ip || null,
          trusted: false,
          trustToken,
          trustTokenExpiresAt,
        },
      });

      // Frontend URL tabanı: FRONTEND_URL yoksa CLIENT_URL'e düş (backend container'ında
      // explicit env listesinde FRONTEND_URL eksikti → link localhost:5174'e gidip
      // cihaz-doğrula/şifre-sıfırla linkleri ölü adres oluyordu).
      const baseUrl = (process.env.FRONTEND_URL || process.env.CLIENT_URL || 'http://localhost:5174').replace(/\/$/, '');
      const verifyUrl = `${baseUrl}/DeviceVerify?token=${encodeURIComponent(trustToken)}`;
      const resetUrl = `${baseUrl}/ForgotPassword?email=${encodeURIComponent(input.userEmail)}`;

      // Mail tetikle — best-effort
      if (this.sendEmail) {
        try {
          await this.sendEmail.execute({
            tenantId: getDefaultTenantId(),
            templateKey: 'new-device-login',
            to: { userId: input.userId, email: input.userEmail, role: input.userRole as any },
            bypassPreferences: true,    // güvenlik uyarısı — kullanıcı tercih bağımsız
            bypassSendWindow: true,     // saat penceresi (quiet hours) gözetilmez — anında gönderilir
            data: {
              user: { username: input.username || input.userEmail },
              loginAt: new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }),
              userAgent: ua || 'Bilinmiyor',
              ip: ip || 'Bilinmiyor',
              verifyUrl,
              resetUrl,
            },
            relatedEntity: { type: 'UserDevice', id: device.id },
          });
        } catch (e) {
          // Mail hatası login'i kesmez; sadece logla
          console.warn('[NotifyNewDeviceLogin] mail failed:', (e as Error)?.message);
        }
      }

      return { isNewDevice: true };
    } catch (e) {
      console.warn('[NotifyNewDeviceLogin] failed:', (e as Error)?.message);
      return { isNewDevice: false };
    }
  }
}
