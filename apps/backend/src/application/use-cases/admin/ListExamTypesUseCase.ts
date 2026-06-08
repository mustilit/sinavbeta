import { Injectable, Inject } from '@nestjs/common';
import { IExamTypeRepository } from '../../../domain/interfaces/IExamTypeRepository';
import { EXAM_TYPE_REPO } from '../../constants';

/**
 * Sınav türlerini listeler.
 * Varsayılan olarak yalnızca aktif sınav türleri döner.
 */
@Injectable()
export class ListExamTypesUseCase {
  constructor(@Inject(EXAM_TYPE_REPO) private readonly repo: IExamTypeRepository) {}

  /**
   * Sınav türlerini getirir.
   * @param activeOnly - Sadece aktif sınav türleri dönsün mü? Varsayılan: true.
   * @param sortByPopularity - true ise türler popülerliğe göre (türe ait yayındaki
   *   paket sayısı + ACTIVE satın alma sayısı) azalan sıralanır. Ana sayfa "Sınav
   *   Türleri" bandı bunu kullanır; admin/diğer çağrılar orijinal sırayı korur.
   */
  async execute(activeOnly = true, sortByPopularity = false) {
    const list = await this.repo.list({ activeOnly });
    if (!sortByPopularity || list.length === 0) return list;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { prisma } = require('../../../infrastructure/database/prisma');
      const rows: Array<{ examTypeId: string; score: number }> = await prisma.$queryRawUnsafe(`
        SELECT et.id AS "examTypeId",
          (COUNT(DISTINCT tp.id) + COUNT(DISTINCT p.id))::int AS score
        FROM exam_types et
        LEFT JOIN exam_tests t ON t."examTypeId" = et.id AND t."deletedAt" IS NULL AND t."publishedAt" IS NOT NULL
        LEFT JOIN test_packages tp ON tp.id = t."packageId" AND tp."publishedAt" IS NOT NULL
        LEFT JOIN purchases p ON p."testId" = t.id AND p."deletedAt" IS NULL AND p.status = 'ACTIVE'
        GROUP BY et.id
      `);
      const scoreById = new Map<string, number>(rows.map((r) => [r.examTypeId, Number(r.score) || 0]));
      return [...list].sort((a: any, b: any) => {
        const diff = (scoreById.get(b.id) ?? 0) - (scoreById.get(a.id) ?? 0);
        return diff !== 0 ? diff : String(a.name ?? '').localeCompare(String(b.name ?? ''), 'tr');
      });
    } catch {
      return list; // popülerlik hesaplanamazsa orijinal sıra korunur
    }
  }
}

