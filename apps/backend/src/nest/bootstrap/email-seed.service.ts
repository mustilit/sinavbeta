import { Inject, Injectable, OnApplicationBootstrap } from '@nestjs/common';
import type { EmailQueue, PrismaClient } from '@prisma/client';
import { getDefaultTenantId } from '../../common/tenant';
import { encryptJson } from '../../application/services/email/utils/encryption';

type SeedTemplate = {
  key: string;
  subject: string;
  htmlPath: string;
  textPath?: string;
  defaultQueue: EmailQueue;
  description: string;
};

const TEMPLATES: SeedTemplate[] = [
  { key: 'password-reset', subject: 'Şifre Sıfırlama — Sınav Salonu', htmlPath: 'password-reset.hbs', textPath: 'password-reset.txt', defaultQueue: 'CRITICAL', description: 'Şifre sıfırlama linki' },
  { key: 'email-verification', subject: 'E-postanızı doğrulayın — Sınav Salonu', htmlPath: 'email-verification.hbs', defaultQueue: 'CRITICAL', description: 'Kayıt sonrası e-posta doğrulama' },
  { key: 'purchase-receipt', subject: 'Satın alma onayı — {{package.title}}', htmlPath: 'purchase-receipt.hbs', defaultQueue: 'CRITICAL', description: 'Satın alma sonrası makbuz' },
  { key: 'refund-confirmation', subject: 'İade onaylandı — Sınav Salonu', htmlPath: 'refund-confirmation.hbs', defaultQueue: 'CRITICAL', description: 'İade onayı bildirimi' },
  { key: 'refund-rejected', subject: 'İade talebiniz reddedildi — Sınav Salonu', htmlPath: 'refund-rejected.hbs', defaultQueue: 'NOTIFY', description: 'İade reddi bildirimi' },
  { key: 'refund-status-update', subject: 'İade durumu güncellendi — Sınav Salonu', htmlPath: 'refund-status-update.hbs', defaultQueue: 'NOTIFY', description: 'İade durum değişikliği' },
  { key: 'review-received', subject: 'Yeni değerlendirme — {{test.title}}', htmlPath: 'review-received.hbs', defaultQueue: 'NOTIFY', description: 'Eğiticiye yeni değerlendirme bildirimi' },
  { key: 'objection-update', subject: 'İtiraz güncellemesi — Sınav Salonu', htmlPath: 'objection-update.hbs', defaultQueue: 'NOTIFY', description: 'İtiraz sonucu bildirimi' },
  { key: 'live-session-invite', subject: 'Canlı sınav daveti — {{session.title}}', htmlPath: 'live-session-invite.hbs', defaultQueue: 'NOTIFY', description: 'Canlı oturum daveti' },
  { key: 'educator-moderation-action', subject: 'Hesabınız hakkında önemli bilgi', htmlPath: 'educator-moderation-action.hbs', defaultQueue: 'CRITICAL', description: 'Eğitici moderasyon kararı' },
  { key: 'weekly-digest', subject: 'Haftanın özeti — Sınav Salonu', htmlPath: 'weekly-digest.hbs', defaultQueue: 'BULK', description: 'Haftalık digest' },
  { key: 'campaign-announcement', subject: '{{title}}', htmlPath: 'campaign-announcement.hbs', defaultQueue: 'BULK', description: 'Kampanya duyurusu' },
  { key: 'product-update', subject: 'Yeni özellik — {{feature.title}}', htmlPath: 'product-update.hbs', defaultQueue: 'BULK', description: 'Ürün güncelleme duyurusu' },
  { key: 'account-security-alert', subject: 'Güvenlik uyarısı — Sınav Salonu', htmlPath: 'account-security-alert.hbs', defaultQueue: 'CRITICAL', description: 'Hesap güvenlik uyarısı' },
  { key: 'new-device-login', subject: 'Yeni cihazdan giriş yapıldı — Sınav Salonu', htmlPath: 'new-device-login.hbs', textPath: 'new-device-login.txt', defaultQueue: 'CRITICAL', description: 'Yeni cihazdan giriş uyarısı — cihaz doğrulama veya şifre sıfırlama linki içerir' },
  { key: 'backup-failure-alert', subject: 'Yedekleme başarısız — Sınav Salonu', htmlPath: 'backup-failure-alert.hbs', defaultQueue: 'CRITICAL', description: 'DB yedekleme hatası uyarısı' },
  { key: 'test-template', subject: 'Test E-posta — Sınav Salonu', htmlPath: 'test-template.hbs', textPath: 'test-template.txt', defaultQueue: 'CRITICAL', description: 'Sağlayıcı doğrulama maili' },
  { key: 'profile-change-otp', subject: 'Profil değişikliği için doğrulama kodu — Sınav Salonu', htmlPath: 'profile-change-otp.hbs', defaultQueue: 'CRITICAL', description: 'Telefon/Website/LinkedIn değişikliğinde 6 haneli OTP' },
  { key: 'inactive-reminder', subject: 'Yarım kalan testleriniz var — Sınav Salonu', htmlPath: 'inactive-reminder.hbs', defaultQueue: 'NOTIFY', description: 'Aylık pasif kullanıcı hatırlatması (yarım kalan testler)' },
];

/**
 * Email modülünün gerekli kayıtlarını seed eder:
 * - Her aktif tenant için 16 şablon kaydı (idempotent — version=1)
 * - Default sağlayıcı: NODE_ENV !== production iken bir CONSOLE provider
 *
 * Production'da admin gerçek sağlayıcısını manuel ekleyene kadar mail gönderilmez,
 * EmailLog'da `no_active_provider` hatası kaydedilir.
 */
@Injectable()
export class EmailSeedService implements OnApplicationBootstrap {
  constructor(@Inject('PRISMA') private readonly prisma: PrismaClient) {}

  async onApplicationBootstrap() {
    try {
      const tenantId = getDefaultTenantId();
      // Tenant kaydı seed.service tarafından oluşturulur — burada yalnızca kontrol
      const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
      if (!tenant) return;

      for (const t of TEMPLATES) {
        await this.prisma.emailTemplate.upsert({
          where: { tenantId_key_version: { tenantId, key: t.key, version: 1 } },
          create: {
            tenantId,
            key: t.key,
            version: 1,
            subject: t.subject,
            htmlPath: t.htmlPath,
            textPath: t.textPath ?? null,
            defaultQueue: t.defaultQueue,
            description: t.description,
            isActive: true,
          },
          update: {
            subject: t.subject,
            htmlPath: t.htmlPath,
            textPath: t.textPath ?? null,
            defaultQueue: t.defaultQueue,
            description: t.description,
          },
        });
      }

      // Dev/test: CONSOLE provider ekle (yoksa)
      if (process.env.NODE_ENV !== 'production') {
        const existing = await this.prisma.emailProviderConfig.findFirst({
          where: { tenantId, kind: 'CONSOLE' },
        });
        if (!existing && process.env.EMAIL_SECRETS_KEY) {
          try {
            await this.prisma.emailProviderConfig.create({
              data: {
                tenantId,
                name: 'Dev Console',
                kind: 'CONSOLE',
                priority: 1000,
                isActive: true,
                fromEmail: process.env.EMAIL_DEFAULT_FROM || 'noreply@sinavsalonu.local',
                fromName: process.env.EMAIL_DEFAULT_FROM_NAME || 'Sınav Salonu (Dev)',
                encryptedSecrets: encryptJson({}),
              },
            });
            console.log('Seed: Dev Console email provider oluşturuldu');
          } catch (e) {
            console.warn('Seed: CONSOLE provider eklenemedi:', (e as Error).message);
          }
        }
      }

      console.log(`Seed: ${TEMPLATES.length} email template kaydı upsert edildi`);
    } catch (err) {
      console.error('Email seed error', err);
    }
  }
}
