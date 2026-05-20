// @ts-nocheck
import { prisma } from '../database/prisma';
import { INotificationPreferenceRepository, NotificationPreference } from '../../domain/interfaces/INotificationPreferenceRepository';
import { randomUUID } from 'crypto';

export class PrismaNotificationPreferenceRepository implements INotificationPreferenceRepository {
  async findByUserId(userId: string): Promise<NotificationPreference | null> {
    const row = await prisma.notificationPreference.findUnique({ where: { userId } as any });
    if (!row) return null;
    return {
      id: row.id,
      userId: row.userId,
      emailEnabled: row.emailEnabled,
      unsubscribeToken: row.unsubscribeToken,
    };
  }

  async disableByToken(token: string): Promise<boolean> {
    const res = await prisma.notificationPreference.updateMany({ where: { unsubscribeToken: token, emailEnabled: true }, data: { emailEnabled: false } });
    return res.count > 0;
  }

  async ensureForUser(userId: string): Promise<NotificationPreference> {
    const existing = await this.findByUserId(userId);
    if (existing) return existing;
    const token = randomUUID();
    const created = await prisma.notificationPreference.create({
      data: { userId, unsubscribeToken: token },
    });
    return { id: created.id, userId: created.userId, emailEnabled: created.emailEnabled, unsubscribeToken: created.unsubscribeToken };
  }
  async updateByUserId(userId: string, fields: Partial<{ emailEnabled: boolean; weeklyDigestEnabled: boolean; inactiveReminderEnabled: boolean }>): Promise<NotificationPreference> {
    const existing = await this.findByUserId(userId);
    if (!existing) {
      const token = randomUUID();
      const created = await prisma.notificationPreference.create({
        data: { userId, unsubscribeToken: token, emailEnabled: fields.emailEnabled ?? true, weeklyDigestEnabled: fields.weeklyDigestEnabled ?? true, inactiveReminderEnabled: fields.inactiveReminderEnabled ?? true },
      });
      return { id: created.id, userId: created.userId, emailEnabled: created.emailEnabled, unsubscribeToken: created.unsubscribeToken };
    }
    const updated = await prisma.notificationPreference.update({ where: { userId }, data: { ...(fields.emailEnabled !== undefined && { emailEnabled: fields.emailEnabled }), ...(fields.weeklyDigestEnabled !== undefined && { weeklyDigestEnabled: fields.weeklyDigestEnabled }), ...(fields.inactiveReminderEnabled !== undefined && { inactiveReminderEnabled: fields.inactiveReminderEnabled }) } as any });
    return { id: updated.id, userId: updated.userId, emailEnabled: updated.emailEnabled, unsubscribeToken: updated.unsubscribeToken };
  }
}

