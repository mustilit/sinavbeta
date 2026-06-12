import { prisma } from '../../../infrastructure/database/prisma';

/**
 * Kullanıcının ONAYLADIĞI (trusted) cihazlarını listeler — Profil > Güvenlik sekmesi.
 * Güvenilmeyen/iptal edilmiş cihazlar gösterilmez. Hassas alan (fingerprint, token) dönmez.
 */
export class ListUserDevicesUseCase {
  async execute(userId: string) {
    if (!userId) return [];
    const devices = await prisma.userDevice.findMany({
      where: { userId, trusted: true },
      orderBy: { lastSeenAt: 'desc' },
      select: { id: true, userAgent: true, ip: true, firstSeenAt: true, lastSeenAt: true },
    });
    return devices.map((d) => ({
      id: d.id,
      userAgent: d.userAgent ?? null,
      ip: d.ip ?? null,
      firstSeenAt: d.firstSeenAt,
      lastSeenAt: d.lastSeenAt,
    }));
  }
}
