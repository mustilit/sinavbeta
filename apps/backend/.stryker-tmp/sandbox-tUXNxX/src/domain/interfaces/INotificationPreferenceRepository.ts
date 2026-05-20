// @ts-nocheck
export interface NotificationPreference {
  id: string;
  userId: string;
  emailEnabled: boolean;
  unsubscribeToken: string;
}

export interface INotificationPreferenceRepository {
  findByUserId(userId: string): Promise<NotificationPreference | null>;
  disableByToken(token: string): Promise<boolean>;
  ensureForUser(userId: string): Promise<NotificationPreference>;
  updateByUserId(userId: string, fields: Partial<{ emailEnabled: boolean; weeklyDigestEnabled: boolean; inactiveReminderEnabled: boolean }>): Promise<NotificationPreference>;
}

