// @ts-nocheck
import { AppError } from '../../errors/AppError';
import type { IUserRepository } from '../../../domain/interfaces/IUserRepository';
import type { IAuditLogRepository } from '../../../domain/interfaces/IAuditLogRepository';
import type { UserPublic } from '../../../domain/entities/User';

/** FR-E-02: Eğitici profil bilgilerini düzenleme. Whitelist: metadata (bio, avatarUrl, displayName vb.) */
export class UpdateEducatorProfileUseCase {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly auditRepo: IAuditLogRepository,
  ) {}

  async execute(actorId: string | undefined, input: { metadata?: Record<string, unknown> }): Promise<UserPublic & { metadata?: Record<string, unknown> }> {
    if (!actorId) throw new AppError('UNAUTHORIZED', 'Authentication required', 401);

    const user = await this.userRepo.findById(actorId);
    if (!user) throw new AppError('USER_NOT_FOUND', 'User not found', 404);
    if (user.role !== 'EDUCATOR') throw new AppError('FORBIDDEN', 'Only educators can update profile', 403);

    const whitelist = ['bio', 'avatarUrl', 'displayName', 'linkedIn', 'website'];
    const filtered: Record<string, unknown> = {};
    if (input.metadata && typeof input.metadata === 'object') {
      for (const k of Object.keys(input.metadata)) {
        if (whitelist.includes(k)) filtered[k] = input.metadata[k];
      }
    }
    if (Object.keys(filtered).length === 0) {
      return this.toPublic(user);
    }

    const updated = await this.userRepo.updateEducatorProfile(actorId, { metadata: filtered });
    await this.auditRepo.create({
      action: 'EDUCATOR_PROFILE_UPDATED',
      entityType: 'User',
      entityId: actorId,
      actorId,
      metadata: { profileUpdated: Object.keys(filtered) },
    });
    return this.toPublic(updated!);
  }

  private toPublic(u: { id: string; email: string; username: string; role: string; status: string; createdAt: Date; metadata?: Record<string, unknown> }): UserPublic & { metadata?: Record<string, unknown> } {
    return { id: u.id, email: u.email, username: u.username, role: u.role as any, status: u.status as any, createdAt: u.createdAt, metadata: u.metadata };
  }
}
