import { Injectable, Inject } from '@nestjs/common';
import { IExamTypeRepository } from '../../../domain/interfaces/IExamTypeRepository';
import { IAuditLogRepository } from '../../../domain/interfaces/IAuditLogRepository';
import { EXAM_TYPE_REPO } from '../../constants';
import { slugify } from '../../utils/slugify';
import { logger } from '../../../infrastructure/logger/logger';

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

  async execute(id: string, input: { name?: string; slug?: string; description?: string | null; active?: boolean; metadata?: Record<string, unknown> | null }, actorId?: string) {
    const existing = await this.repo.findById(id);
    if (!existing) return null;

    // Slug yalnızca açıkça verildiğinde ya da ad GERÇEKTEN değiştiğinde yeniden üretilir.
    // Aksi halde (örn. yalnızca logo/açıklama/aktiflik güncellemesi) mevcut slug korunur.
    // Böylece adı başka bir kayıtla aynı slug'a normalize olan türlerde ("KPSS - Eğitim
    // Bilimleri" vs "KPSS Eğitim Bilimleri" → ikisi de "kpss-egitim-bilimleri") sahte 409 olmaz.
    const existingSlug = (existing as any).slug as string | undefined;
    const existingName = (existing as any).name as string | undefined;
    let slug: string | undefined;
    if (input.slug?.trim()) {
      slug = slugify(input.slug);
    } else if (input.name?.trim() && input.name.trim() !== existingName) {
      slug = slugify(input.name);
    }

    if (slug && slug !== existingSlug) {
      const bySlug = await this.repo.findBySlug(slug);
      if (bySlug && bySlug.id !== id) {
        const err: any = new Error('EXAMTYPE_SLUG_EXISTS');
        err.status = 409;
        err.code = 'EXAMTYPE_SLUG_EXISTS';
        throw err;
      }
    } else {
      // Slug değişmiyor → tekrar yazma, çakışma kontrolü yapma.
      slug = undefined;
    }

    // metadata verildiyse mevcut metadata ile birleştir — iconUrl güncellemesi
    // diğer metadata alanlarını ezmesin.
    const mergedMetadata =
      input.metadata !== undefined
        ? { ...(((existing as any).metadata as Record<string, unknown>) ?? {}), ...input.metadata }
        : undefined;

    const updated = await this.repo.update(id, {
      name: input.name,
      slug,
      description: input.description,
      active: input.active,
      metadata: mergedMetadata,
    });
    if (updated && this.auditRepo) {
      try {
        await this.auditRepo.create({ action: 'EXAMTYPE_UPDATED', entityType: 'EXAM_TYPE', entityId: id, actorId: actorId ?? null, metadata: {} });
      } catch (err: any) {
        // Audit best-effort — akışı bloke etmez, ama başarısız yazımı görünür kıl.
        logger.warn('examtype.update.audit_failed', {
          error: err?.message,
          examTypeId: id,
          actorId: actorId ?? null,
        });
      }
    }
    return updated;
  }
}
