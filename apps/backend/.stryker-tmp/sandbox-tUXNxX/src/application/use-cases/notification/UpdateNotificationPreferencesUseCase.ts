// @ts-nocheck
import { INotificationPreferenceRepository } from '../../../domain/interfaces/INotificationPreferenceRepository';

/**
 * Kullanıcının e-posta bildirim tercihlerini günceller.
 * emailEnabled: false → hiçbir e-posta gitmez
 * weeklyDigestEnabled: takip listesi özet e-postası
 * inactiveReminderEnabled: uzun süre giriş yapmayanlara hatırlatma
 */
export class UpdateNotificationPreferencesUseCase {
  constructor(private readonly repo: INotificationPreferenceRepository) {}

  async execute(userId: string, fields: Partial<{ emailEnabled: boolean; weeklyDigestEnabled: boolean; inactiveReminderEnabled: boolean }>) {
    return this.repo.updateByUserId(userId, fields);
  }
}

