// @ts-nocheck
import { INotificationPreferenceRepository } from '../../../domain/interfaces/INotificationPreferenceRepository';
import { PrismaAuditLogRepository } from '../../../infrastructure/repositories/PrismaAuditLogRepository';

/**
 * E-posta aboneliğini iptal eder.
 * E-posta içindeki tek kullanımlık token üzerinden kimlik doğrulaması yapılır
 * (giriş gerektirmez — kullanıcının doğrudan e-postadan tıklaması yeterli).
 */
export class UnsubscribeEmailUseCase {
  constructor(private readonly repo: INotificationPreferenceRepository, private readonly auditRepo: PrismaAuditLogRepository) {}

  async execute(token: string) {
    const ok = await this.repo.disableByToken(token);
    if (ok) {
      await this.auditRepo.create({
        action: 'NOTIFICATIONS_DISABLED',
        entityType: 'NotificationPreference',
        entityId: token,
        actorId: null, // token bazlı işlem — kullanıcı ID'si bilinmiyor
        metadata: { reason: 'unsubscribe' },
      } as any);
    }
    return ok;
  }
}

