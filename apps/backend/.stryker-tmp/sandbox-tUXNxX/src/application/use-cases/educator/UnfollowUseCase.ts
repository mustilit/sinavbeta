// @ts-nocheck
import { IFollowRepository } from '../../../domain/interfaces/IFollowRepository';
import { IAuditLogRepository } from '../../../domain/interfaces/IAuditLogRepository';

/** Eğitici veya sınav türü takibini kaldırır. FollowUseCase ile simetrik. */
export class UnfollowUseCase {
  constructor(private readonly followRepo: IFollowRepository, private readonly auditRepo: IAuditLogRepository) {}

  async execute(input: { followerId: string; followType: 'EDUCATOR' | 'EXAM_TYPE'; educatorId?: string; examTypeId?: string }) {
    if (!input.followerId || !input.followType) throw new Error('INVALID_INPUT');
    await this.followRepo.deleteFollow({ followerId: input.followerId, followType: input.followType, educatorId: input.educatorId ?? null, examTypeId: input.examTypeId ?? null });
    try {
      await this.auditRepo.create({ action: 'FOLLOW_REMOVED' as any, entityType: 'Follow', entityId: `${input.followerId}:${input.followType}:${input.educatorId ?? input.examTypeId}`, actorId: input.followerId } as any);
    } catch {}
  }
}

