// @ts-nocheck
import { Injectable, Inject } from '@nestjs/common';
import { IExamTypeRepository } from '../../../domain/interfaces/IExamTypeRepository';
import { PrismaAuditLogRepository } from '../../../infrastructure/repositories/PrismaAuditLogRepository';
import { EXAM_TYPE_REPO } from '../../constants';

/**
 * Türkçe karakterleri ve özel sembolleri URL-güvenli ASCII'ye dönüştürür.
 * Sınav türü slug'ları benzersiz olmalı; boşluk → '-', özel karakter → atılır.
 */
function slugify(input: string) {
  // Türkçe karakter → ASCII eşleşme tablosu
  const map: Record<string, string> = {
    ç: 'c',
    Ç: 'c',
    ğ: 'g',
    Ğ: 'g',
    ı: 'i',
    İ: 'i',
    ö: 'o',
    Ö: 'o',
    ş: 's',
    Ş: 's',
    ü: 'u',
    Ü: 'u',
    ' ': '-',
  };
  return input
    .trim()
    .toLowerCase()
    .split('')
    .map((c) => map[c] ?? c)
    .join('')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Yeni sınav türü oluşturur (YKS, KPSS, ALES vb.).
 *
 * Ön koşullar:
 *   - Aynı slug'a sahip başka bir sınav türü olmamalı
 *
 * Hata senaryoları:
 *   - EXAMTYPE_SLUG_EXISTS (409): Slug çakışması
 */
@Injectable()
export class CreateExamTypeUseCase {
  constructor(
    @Inject(EXAM_TYPE_REPO) private readonly repo: IExamTypeRepository,
    private readonly auditRepo: PrismaAuditLogRepository,
  ) {}

  async execute(input: { name: string; slug?: string; description?: string | null; metadata?: Record<string, unknown> | null; active?: boolean }, actorId?: string) {
    // Slug verilmemişse isimden üretilir
    const slug = input.slug && input.slug.trim().length ? slugify(input.slug) : slugify(input.name);
    const exists = await this.repo.findBySlug(slug);
    if (exists) {
      const err: any = new Error('EXAMTYPE_SLUG_EXISTS');
      err.status = 409;
      err.code = 'EXAMTYPE_SLUG_EXISTS';
      throw err;
    }
    // active varsayılan olarak true; yeni sınav türleri hemen görünür
    const created = await this.repo.create({ name: input.name, slug, description: input.description, metadata: input.metadata ?? {}, active: input.active ?? true });
    if (this.auditRepo) {
      try {
        // Audit hatası asla işlemi engellemez — best-effort
        await this.auditRepo.create({ action: 'EXAMTYPE_CREATED', entityType: 'EXAM_TYPE', entityId: created.id, actorId: actorId ?? null, metadata: {} });
      } catch {
        // swallow audit errors
      }
    }
    return created;
  }
}

