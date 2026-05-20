// @ts-nocheck
import { Injectable, Inject } from '@nestjs/common';
import { AppError } from '../../errors/AppError';
import { IUserRepository } from '../../../domain/interfaces/IUserRepository';
import { IAuditLogRepository } from '../../../domain/interfaces/IAuditLogRepository';
import { USER_REPO, AUDIT_LOG_REPO } from '../../constants';

/**
 * Eğiticiyi askıya alır (SUSPENDED).
 * Askıya alınan eğitici yeni test oluşturamaz ve testleri listeden gizlenebilir.
 * Sadece admin tarafından çağrılır.
 */
@Injectable()
export class SuspendEducatorUseCase {
  constructor(
    @Inject(USER_REPO) private readonly userRepo: IUserRepository,
    @Inject(AUDIT_LOG_REPO) private readonly auditRepo: IAuditLogRepository,
  ) {}

  async execute(adminActorId: string, educatorUserId: string): Promise<{ id: string; status: string }> {
    const user = await this.userRepo.findById(educatorUserId);
    if (!user) throw new AppError('USER_NOT_FOUND', 'User not found', 404);
    if (user.role !== 'EDUCATOR') throw new AppError('USER_NOT_EDUCATOR', 'User is not an educator', 409);

    const updated = await this.userRepo.updateEducatorStatus(educatorUserId, { status: 'SUSPENDED' });
    if (!updated) throw new AppError('USER_NOT_FOUND', 'User not found', 404);

    try {
      await this.auditRepo.create({
        action: 'EDUCATOR_SUSPENDED',
        entityType: 'USER',
        entityId: educatorUserId,
        actorId: adminActorId,
        metadata: {},
      });
    } catch {
      // best-effort audit
    }
    return { id: updated.id, status: updated.status };
  }
}
