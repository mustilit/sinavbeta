import { AppError } from '../../errors/AppError';
import { prisma } from '../../../infrastructure/database/prisma';
import type { IUserRepository } from '../../../domain/interfaces/IUserRepository';
import type { IAuditLogRepository } from '../../../domain/interfaces/IAuditLogRepository';
import type { UserPublic } from '../../../domain/entities/User';
import type { ModerateTextContentUseCase } from '../moderation/ModerateTextContentUseCase';

/** FR-E-02: Eğitici profil bilgilerini düzenleme. Whitelist: metadata (bio, avatarUrl, displayName vb.) */
export class UpdateEducatorProfileUseCase {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly auditRepo: IAuditLogRepository,
    // Opsiyonel — verilirse bio/tanıtım metni moderasyondan geçer (sert blok). Test'lerde verilmez.
    private readonly moderate?: ModerateTextContentUseCase,
  ) {}

  async execute(actorId: string | undefined, input: { metadata?: Record<string, unknown> }): Promise<UserPublic & { metadata?: Record<string, unknown> }> {
    if (!actorId) throw new AppError('UNAUTHORIZED', 'Authentication required', 401);

    const user = await this.userRepo.findById(actorId);
    if (!user) throw new AppError('USER_NOT_FOUND', 'User not found', 404);
    if (user.role !== 'EDUCATOR') throw new AppError('FORBIDDEN', 'Only educators can update profile', 403);

    const whitelist = [
      'bio', 'avatarUrl', 'displayName', 'linkedIn', 'website',
      // Sprint 17: REJECTED eğiticinin yeniden başvuruda güncelleyebildiği alanlar
      'cv_url', 'specialized_exam_types', 'education_info',
      // Sprint 17+: LinkedIn ve kişisel web sitesi (kayıt wizard step 2)
      'linkedin_url', 'website_url',
      // EducatorSettings mevcut alanları
      'education', 'phone', 'city', 'google_scholar_url', 'profile_image_url',
      'notification_preferences', 'iban', 'bankName', 'accountHolder', 'linkedin',
    ];
    const filtered: Record<string, unknown> = {};
    if (input.metadata && typeof input.metadata === 'object') {
      for (const k of Object.keys(input.metadata)) {
        if (whitelist.includes(k)) filtered[k] = input.metadata[k];
      }
    }
    if (Object.keys(filtered).length === 0) {
      return this.toPublic(user);
    }

    // İçerik moderasyonu — bio/displayName (tanıtım metni) uygunsuzsa SERT BLOK.
    // moderate verilmemişse atlanır (test/geriye uyum).
    if (this.moderate) {
      const text = ['bio', 'displayName']
        .map((k) => filtered[k])
        .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
        .join('\n');
      if (text) {
        const u = await prisma.user.findUnique({ where: { id: actorId }, select: { tenantId: true } });
        const verdict = await this.moderate.execute({
          entityType: 'EducatorProfile',
          entityId: actorId,
          userId: actorId,
          tenantId: u?.tenantId ?? '',
          text,
          isEducatorContent: true,
        });
        if (!verdict.allowed) {
          throw new AppError(
            'PROFILE_TEXT_REJECTED',
            verdict.message ?? 'Profil metniniz uygunsuz içerik nedeniyle reddedildi.',
            400,
          );
        }
      }
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
