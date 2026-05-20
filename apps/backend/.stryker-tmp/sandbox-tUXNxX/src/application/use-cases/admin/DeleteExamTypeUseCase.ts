// @ts-nocheck
import { Injectable, Inject } from '@nestjs/common';
import { IExamTypeRepository } from '../../../domain/interfaces/IExamTypeRepository';
import { IAuditLogRepository } from '../../../domain/interfaces/IAuditLogRepository';
import { EXAM_TYPE_REPO } from '../../constants';
import { AppError } from '../../errors/AppError';

/**
 * Sınav türünü kalıcı olarak siler.
 * Alt konuları varsa silme engellenir (CONFLICT 409) — veri bütünlüğü korunur.
 */
@Injectable()
export class DeleteExamTypeUseCase {
  constructor(
    @Inject(EXAM_TYPE_REPO) private readonly repo: IExamTypeRepository,
    private readonly auditRepo: IAuditLogRepository,
  ) {}

  async execute(id: string, actorId?: string) {
    const existing = await this.repo.findById(id);
    if (!existing) throw new AppError('NOT_FOUND', 'Exam type not found', 404);

    const deleted = await this.repo.delete(id);
    if (!deleted) throw new AppError('CONFLICT', 'Cannot delete exam type with existing topics', 409);

    if (this.auditRepo) {
      try {
        await this.auditRepo.create({ action: 'EXAMTYPE_DELETED', entityType: 'EXAM_TYPE', entityId: id, actorId: actorId ?? null, metadata: {} });
      } catch {
        /* swallow */
      }
    }
    return { deleted: true };
  }
}
