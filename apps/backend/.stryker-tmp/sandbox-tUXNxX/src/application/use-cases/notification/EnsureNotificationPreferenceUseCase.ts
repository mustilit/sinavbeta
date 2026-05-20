// @ts-nocheck
import { INotificationPreferenceRepository } from '../../../domain/interfaces/INotificationPreferenceRepository';

/**
 * Kullanıcı için bildirim tercihi kaydının var olduğunu garanti eder.
 * Kayıt yoksa varsayılan değerlerle oluşturur (upsert semantiği).
 * Kayıt/giriş akışında çağrılır — ilk girişte tercihler otomatik oluşur.
 */
export class EnsureNotificationPreferenceUseCase {
  constructor(private readonly repo: INotificationPreferenceRepository) {}

  async execute(userId: string) {
    return this.repo.ensureForUser(userId);
  }
}

