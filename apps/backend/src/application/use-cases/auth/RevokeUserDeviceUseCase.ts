import { ForbiddenException, NotFoundException, Logger } from '@nestjs/common';
import { prisma } from '../../../infrastructure/database/prisma';
import { PrismaAuditLogRepository } from '../../../infrastructure/repositories/PrismaAuditLogRepository';

/**
 * Kullanıcının kendi onayladığı bir cihazın onayını (trusted) kaldırır.
 * Cihaz satırı korunur (güvenilmez işaretlenir, token temizlenir); böylece o cihazdan
 * sonraki giriş yeniden doğrulama gerektirir (özellikle ADMIN/WORKER için login engeli).
 * İşlem DB'ye audit log olarak yazılır (ekranda işlem geçmişi gösterilmez).
 */
export class RevokeUserDeviceUseCase {
  private readonly logger = new Logger(RevokeUserDeviceUseCase.name);

  async execute(
    userId: string,
    deviceId: string,
    ctx?: { ip?: string | null; userAgent?: string | null },
  ): Promise<{ ok: true }> {
    if (!userId) throw new ForbiddenException({ code: 'UNAUTHENTICATED', message: 'Oturum bulunamadı' });
    const device = await prisma.userDevice.findUnique({ where: { id: deviceId } });
    // Sahiplik: yalnızca kendi cihazı. Başkasının id'siyle de 404 (bilgi sızdırma yok).
    if (!device || device.userId !== userId) {
      throw new NotFoundException({ code: 'DEVICE_NOT_FOUND', message: 'Cihaz bulunamadı' });
    }

    await prisma.userDevice.update({
      where: { id: deviceId },
      data: { trusted: false, trustToken: null, trustTokenExpiresAt: null },
    });

    // DB audit — best-effort; revoke'u maskelemez (sessiz yutma yok, logger.warn).
    try {
      const audit = new PrismaAuditLogRepository();
      await audit.create({
        action: 'DEVICE_TRUST_REVOKED',
        entityType: 'UserDevice',
        entityId: deviceId,
        actorId: userId,
        metadata: {
          deviceUserAgent: device.userAgent ?? null,
          deviceIp: device.ip ?? null,
          ip: ctx?.ip ?? null,
          userAgent: ctx?.userAgent ?? null,
        },
      });
    } catch (err) {
      this.logger.warn(`device.revoke.audit_failed ${(err as Error)?.message ?? err}`);
    }

    return { ok: true };
  }
}
