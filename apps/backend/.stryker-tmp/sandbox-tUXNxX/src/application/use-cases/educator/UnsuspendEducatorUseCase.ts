// @ts-nocheck
import { Injectable, Inject } from '@nestjs/common';
import { AppError } from '../../errors/AppError';
import { IUserRepository } from '../../../domain/interfaces/IUserRepository';
import { IAuditLogRepository } from '../../../domain/interfaces/IAuditLogRepository';
import { USER_REPO, AUDIT_LOG_REPO } from '../../constants';

/**
 * Admin unsuspends an educator.
 * - If educatorApprovedAt is set → status = ACTIVE.
 * - If educatorApprovedAt is null → status = PENDING_EDUCATOR_APPROVAL (must be approved before full access).
 */
@Injectable()
export class UnsuspendEducatorUseCase {
  constructor(
    @Inject(USER_REPO) private readonly userRepo: IUserRepository,
    @Inject(AUDIT_LOG_REPO) private readonly auditRepo: IAuditLogRepository,
  ) {}

  async execute(adminActorId: string, educatorUserId: string): Promise<{ id: string; status: string }> {
    const user = await this.userRepo.findById(educatorUserId);
    if (!user) throw new AppError('USER_NOT_FOUND', 'User not found', 404);
    if (user.role !== 'EDUCATOR') throw new AppError('USER_NOT_EDUCATOR', 'User is not an educator', 409);

    const newStatus = user.educatorApprovedAt ? 'ACTIVE' : 'PENDING_EDUCATOR_APPROVAL';
    const updated = await this.userRepo.updateEducatorStatus(educatorUserId, { status: newStatus });
    if (!updated) throw new AppError('USER_NOT_FOUND', 'User not found', 404);

    try {
      await this.auditRepo.create({
        action: 'EDUCATOR_UNSUSPENDED',
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
