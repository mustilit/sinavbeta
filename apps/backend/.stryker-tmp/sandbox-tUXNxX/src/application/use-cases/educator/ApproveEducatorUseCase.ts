// @ts-nocheck
import { Injectable, Inject } from '@nestjs/common';
import { AppError } from '../../errors/AppError';
import { IUserRepository } from '../../../domain/interfaces/IUserRepository';
import { IAuditLogRepository } from '../../../domain/interfaces/IAuditLogRepository';
import { USER_REPO, AUDIT_LOG_REPO } from '../../constants';

/**
 * Admininin bir eğitici hesabını onaylamasını sağlar.
 *
 * Idempotent davranış: Eğitici zaten ACTIVE durumundaysa ve onay tarihi
 * kayıtlıysa ikinci bir işlem yapılmadan mevcut bilgiler döner (200 OK).
 */
@Injectable()
export class ApproveEducatorUseCase {
  constructor(
    @Inject(USER_REPO) private readonly userRepo: IUserRepository,
    @Inject(AUDIT_LOG_REPO) private readonly auditRepo: IAuditLogRepository,
  ) {}

  /**
   * Eğiticiyi onaylar; durumunu ACTIVE yapar ve onay tarihini kaydeder.
   *
   * @param adminActorId   - Onayı gerçekleştiren admin kullanıcısının kimliği
   * @param educatorUserId - Onaylanacak eğitici kullanıcısının kimliği
   * @returns Güncellenmiş kullanıcı bilgileri (id, durum, onay tarihi)
   */
  async execute(adminActorId: string, educatorUserId: string): Promise<{ id: string; status: string; educatorApprovedAt: Date | null }> {
    const user = await this.userRepo.findById(educatorUserId);
    if (!user) throw new AppError('USER_NOT_FOUND', 'User not found', 404);
    // Yalnızca EDUCATOR rolündeki kullanıcılar onaylanabilir
    if (user.role !== 'EDUCATOR') throw new AppError('USER_NOT_EDUCATOR', 'User is not an educator', 409);

    // Zaten onaylanmışsa tekrar güncelleme yapılmaz; idempotent yanıt dön
    if (user.status === 'ACTIVE' && user.educatorApprovedAt) {
      return { id: user.id, status: user.status, educatorApprovedAt: user.educatorApprovedAt };
    }

    const now = new Date();
    const updated = await this.userRepo.updateEducatorStatus(educatorUserId, {
      status: 'ACTIVE',
      educatorApprovedAt: now,
    });
    if (!updated) throw new AppError('USER_NOT_FOUND', 'User not found', 404);

    try {
      await this.auditRepo.create({
        action: 'EDUCATOR_APPROVED',
        entityType: 'USER',
        entityId: educatorUserId,
        actorId: adminActorId,
        metadata: {},
      });
    } catch {
      // best-effort: audit log hatası ana akışı kesmez
    }
    return {
      id: updated.id,
      status: updated.status,
      educatorApprovedAt: updated.educatorApprovedAt ?? null,
    };
  }
}
