import { PrismaClient } from '@prisma/client';
import { prisma } from '../../../infrastructure/database/prisma';
import { isWellFormedUnsubscribeToken } from '../../services/email/utils/unsubscribeToken';
import { EmailPreferences, readEmailPreferences } from '../../services/email/preferenceMap';

/**
 * Mail footer'daki unsubscribe link'i için.
 * Kategori belirtilirse o alanı false yapar; aksi halde marketing dahil tüm BULK ve NOTIFY kapatılır.
 * Mevcut CRITICAL şablonlar etkilenmez.
 */
export class UnsubscribeViaTokenUseCase {
  constructor(private readonly db: PrismaClient = prisma) {}

  async execute(input: { token: string; category?: keyof EmailPreferences | 'all' }) {
    if (!isWellFormedUnsubscribeToken(input.token)) {
      throw Object.assign(new Error('Token geçersiz'), { status: 400 });
    }
    const user = await this.db.user.findUnique({
      where: { emailUnsubscribeToken: input.token },
      select: { id: true, email: true, emailPreferences: true },
    });
    if (!user) throw Object.assign(new Error('Token eşleşmiyor'), { status: 404 });

    const prefs = readEmailPreferences(user.emailPreferences);
    const optionalKeys: Array<keyof EmailPreferences> = [
      'marketing',
      'productUpdates',
      'weeklyDigest',
      'reviewNotifications',
      'objectionUpdates',
      'liveSessionInvites',
      'refundUpdates',
    ];
    if (!input.category || input.category === 'all') {
      optionalKeys.forEach((k) => (prefs[k] = false));
    } else if (optionalKeys.includes(input.category as keyof EmailPreferences)) {
      prefs[input.category as keyof EmailPreferences] = false;
    } else {
      throw Object.assign(new Error('Geçersiz kategori'), { status: 400 });
    }

    await this.db.user.update({
      where: { id: user.id },
      data: { emailPreferences: prefs as any },
    });
    await this.db.auditLog.create({
      data: {
        action: 'EMAIL_UNSUBSCRIBE',
        entityType: 'User',
        entityId: user.id,
        actorId: user.id,
        metadata: { category: input.category ?? 'all' } as any,
      },
    });
    return { email: user.email, preferences: prefs, category: input.category ?? 'all' };
  }
}
