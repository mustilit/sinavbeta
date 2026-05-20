// @ts-nocheck
import { Injectable, Inject } from '@nestjs/common';
import { IExamTypeRepository } from '../../../domain/interfaces/IExamTypeRepository';
import { IAuditLogRepository } from '../../../domain/interfaces/IAuditLogRepository';
import { EXAM_TYPE_REPO } from '../../constants';
import { slugify } from '../../utils/slugify';

/**
 * Sınav türünü günceller. Slug çakışması kontrolü yapılır (kendi ID'si hariç).
 * isActive: false yapılırsa sınav türü listeden gizlenir.
 */
@Injectable()
export class UpdateExamTypeUseCase {
  constructor(
    @Inject(EXAM_TYPE_REPO) private readonly repo: IExamTypeRepository,
    private readonly auditRepo: IAuditLogRepository,
  ) {}

  async execute(id: string, input: { name?: string; slug?: string; description?: string | null; active?: boolean }, actorId?: string) {
    const existing = await this.repo.findById(id);
    if (!existing) return null;

    const slug = input.slug?.trim() ? slugify(input.slug) : input.name ? slugify(input.name) : undefined;
    if (slug) {
      const bySlug = await this.repo.findBySlug(slug);
      if (bySlug && bySlug.id !== id) {
        const err: any = new Error('EXAMTYPE_SLUG_EXISTS');
        err.status = 409;
        err.code = 'EXAMTYPE_SLUG_EXISTS';
        throw err;
      }
    }

    const updated = await this.repo.update(id, {
      name: input.name,
      slug,
      description: input.description,
      active: input.active,
    });
    if (updated && this.auditRepo) {
      try {
        await this.auditRepo.create({ action: 'EXAMTYPE_UPDATED', entityType: 'EXAM_TYPE', entityId: id, actorId: actorId ?? null, metadata: {} });
      } catch {
        /* swallow */
      }
    }
    return updated;
  }
}
