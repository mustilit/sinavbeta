import { BadRequestException } from '@nestjs/common';
import { prisma } from '../../../infrastructure/database/prisma';
import { AppError } from '../../errors/AppError';
import type { IAuditLogRepository } from '../../../domain/interfaces/IAuditLogRepository';

/**
 * Sprint 15 #3 — Admin platform promo kodu oluşturur (eğitici tarafından
 * canlı test / reklam paketi satın almada kullanılır).
 *
 * Mevcut `DiscountCode` modelinden ayrı: bu kod sadece admin-issued, sadece
 * LIVE_SESSION + AD_PACKAGE scope'larına geçerli. Eğitici kendi paketleri
 * için aday'a indirim verirken `DiscountCode` kullanır.
 *
 * Doğrulama kuralları:
 *   - code: en az 3 karakter, alfanumerik + dash/underscore, büyük harfe çevrilir
 *   - percentOff: 1-100
 *   - scopes: en az 1 değer ['LIVE_SESSION', 'AD_PACKAGE']
 *   - maxUses opsiyonel (null = sınırsız)
 *   - validFrom/validUntil opsiyonel; ikisi de varsa validUntil > validFrom
 */
export type PlatformPromoScope = 'LIVE_SESSION' | 'AD_PACKAGE';

export class CreatePlatformPromoCodeUseCase {
  constructor(private readonly auditRepo?: IAuditLogRepository) {}

  async execute(
    adminId: string,
    input: {
      code: string;
      description?: string | null;
      percentOff: number;
      scopes: PlatformPromoScope[];
      maxUses?: number | null;
      validFrom?: Date | null;
      validUntil?: Date | null;
    },
  ) {
    // Validation
    const code = (input.code ?? '').trim().toUpperCase();
    if (!code || code.length < 3) {
      throw new BadRequestException({ code: 'CODE_INVALID', message: 'Kod en az 3 karakter olmalı' });
    }
    if (!/^[A-Z0-9_-]+$/.test(code)) {
      throw new BadRequestException({ code: 'CODE_INVALID', message: 'Kod yalnızca harf, rakam, - ve _ içerebilir' });
    }
    if (typeof input.percentOff !== 'number' || input.percentOff < 1 || input.percentOff > 100) {
      throw new BadRequestException({ code: 'PERCENT_INVALID', message: 'percentOff 1-100 arası olmalı' });
    }
    if (!Array.isArray(input.scopes) || input.scopes.length === 0) {
      throw new BadRequestException({ code: 'SCOPES_REQUIRED', message: 'En az bir scope seçilmeli' });
    }
    const validScopes: PlatformPromoScope[] = ['LIVE_SESSION', 'AD_PACKAGE'];
    for (const s of input.scopes) {
      if (!validScopes.includes(s)) {
        throw new BadRequestException({ code: 'SCOPE_INVALID', message: `Geçersiz scope: ${s}` });
      }
    }
    if (input.maxUses != null && (input.maxUses < 1 || !Number.isInteger(input.maxUses))) {
      throw new BadRequestException({ code: 'MAX_USES_INVALID', message: 'maxUses pozitif tamsayı olmalı' });
    }
    if (input.validFrom && input.validUntil && input.validUntil <= input.validFrom) {
      throw new BadRequestException({ code: 'DATE_RANGE_INVALID', message: 'validUntil, validFrom\'dan sonra olmalı' });
    }

    // Unique constraint backend tarafından da kontrol edilir, ama duplicate kontrolü kibarca
    const existing = await prisma.platformPromoCode.findUnique({ where: { code } });
    if (existing) {
      throw new AppError('DUPLICATE_CODE', 'Bu kod zaten mevcut', 409);
    }

    const created = await prisma.platformPromoCode.create({
      data: {
        code,
        description: input.description ?? null,
        percentOff: input.percentOff,
        scopes: input.scopes,
        maxUses: input.maxUses ?? null,
        validFrom: input.validFrom ?? null,
        validUntil: input.validUntil ?? null,
        createdById: adminId,
      },
    });

    if (this.auditRepo) {
      try {
        await this.auditRepo.create({
          action: 'DISCOUNT_CREATED' as any, // Reuse mevcut AuditAction; ileride PROMO_CREATED ayrı enum
          entityType: 'PlatformPromoCode',
          entityId: created.id,
          actorId: adminId,
          metadata: { code, percentOff: input.percentOff, scopes: input.scopes },
        });
      } catch {
        /* best-effort */
      }
    }

    return created;
  }
}
