import { PrismaClient } from '@prisma/client';
import { prisma } from '../../../infrastructure/database/prisma';
import { EmailPreferences, readEmailPreferences } from '../../services/email/preferenceMap';

export class UpdateUserEmailPreferencesUseCase {
  constructor(private readonly db: PrismaClient = prisma) {}

  async get(userId: string): Promise<EmailPreferences> {
    const u = await this.db.user.findUnique({
      where: { id: userId },
      select: { emailPreferences: true },
    });
    return readEmailPreferences(u?.emailPreferences);
  }

  async update(input: { userId: string; changes: Partial<EmailPreferences> }): Promise<EmailPreferences> {
    const current = await this.get(input.userId);
    const next: EmailPreferences = { ...current };
    (Object.keys(input.changes) as Array<keyof EmailPreferences>).forEach((k) => {
      const v = input.changes[k];
      if (typeof v === 'boolean') next[k] = v;
    });
    await this.db.user.update({
      where: { id: input.userId },
      data: { emailPreferences: next as any },
    });
    await this.db.auditLog.create({
      data: {
        action: 'EMAIL_PREFERENCES_UPDATED',
        entityType: 'User',
        entityId: input.userId,
        actorId: input.userId,
        metadata: { next } as any,
      },
    });
    return next;
  }
}
