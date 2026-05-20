// @ts-nocheck
import { IExamRepository } from '../../../domain/interfaces/IExamRepository';
import { ReviewAggregationService } from '../../services/ReviewAggregationService';
import { AppError } from '../../errors/AppError';
import type { FxRateService, FxCurrency } from '../../../domain/interfaces/FxRateService';

/** UUID doğrulama regex'i — gelen filtre parametreleri bu kuralla kontrol edilir. */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** İzin verilen sıralama değerleri. */
const SORT_VALUES = ['newest', 'priceAsc', 'priceDesc'] as const;
/** Desteklenen para birimleri. */
const SUPPORTED_CURRENCIES: readonly FxCurrency[] = ['TRY', 'USD', 'EUR', 'GBP'];

/** Marketplace test listesi için filtre parametreleri. */
export type ListMarketplaceFilters = {
  examTypeId?: string;
  topicId?: string;
  educatorId?: string;
  maxPriceCents?: number;
  minRating?: number;
  sort?: (typeof SORT_VALUES)[number];
  page?: number;
  limit?: number;
  /** Opsiyonel: istemcinin görmek istediği para birimi; verilirse her item'a `converted` alanı eklenir. */
  displayCurrency?: FxCurrency;
};

/**
 * Marketplace'te yayınlı testleri listeler.
 * Filtreleme (sınav türü, konu, eğitici, fiyat, puan), sayfalama ve sıralama destekler.
 * Her teste ait ortalama puan ReviewAggregationService ile zenginleştirilir.
 */
export class ListMarketplaceTestsUseCase {
  /** Puan ortalamalarını hesaplamak için kullanılan servis. */
  private agg = new ReviewAggregationService();
  /**
   * @param examRepository - Test sorgu repository'si
   * @param fx - Opsiyonel FX servisi. Verilirse `displayCurrency` ile fiyat dönüşümü yapılır.
   */
  constructor(
    private readonly examRepository: IExamRepository,
    private readonly fx?: FxRateService,
  ) {}

  /**
   * Yayınlı testleri filtreler, sıralar, sayfalayarak döner.
   * @param filters - Arama ve sıralama kriterleri (opsiyonel).
   */
  async execute(filters?: ListMarketplaceFilters) {
    // UUID formatı zorunluluğu — hatalı ID'ler erken yakalanır
    if (filters?.examTypeId && !UUID_REGEX.test(filters.examTypeId)) {
      throw new AppError('INVALID_UUID', 'Invalid examTypeId', 400);
    }
    if (filters?.topicId && !UUID_REGEX.test(filters.topicId)) {
      throw new AppError('INVALID_UUID', 'Invalid topicId', 400);
    }
    if (filters?.educatorId && !UUID_REGEX.test(filters.educatorId)) {
      throw new AppError('INVALID_UUID', 'Invalid educatorId', 400);
    }
    if (filters?.sort && !SORT_VALUES.includes(filters.sort as any)) {
      throw new AppError('INVALID_SORT', 'sort must be one of: newest, priceAsc, priceDesc', 400);
    }
    if (filters?.displayCurrency && !SUPPORTED_CURRENCIES.includes(filters.displayCurrency)) {
      throw new AppError('INVALID_CURRENCY', 'displayCurrency must be one of: TRY, USD, EUR, GBP', 400);
    }

    // Sayfa boyutunu 1-50 arasında sınırla; varsayılan 20
    const limit = Math.min(50, Math.max(1, filters?.limit ?? 20));
    const page = Math.max(1, filters?.page ?? 1);
    const sort = filters?.sort ?? 'newest';

    // Sıralama yönü belirleme: newest → publishedAt desc, priceAsc → priceCents asc, priceDesc → priceCents desc
    const sortBy = sort === 'newest' ? 'publishedAt' : 'priceCents';
    const order = sort === 'priceAsc' ? 'asc' : 'desc';

    const res = await this.examRepository.findPublished({
      examTypeId: filters?.examTypeId,
      topicId: filters?.topicId,
      educatorId: filters?.educatorId,
      maxPriceCents: filters?.maxPriceCents,
      minRating: filters?.minRating,
      page,
      limit,
      sortBy,
      order,
    });

    // Test ID'lerine göre toplu puan ortalamaları çekilerek her teste eklenir
    const items = res.items;
    const ids = items.map((t) => t.id);
    // Önce testStats tablosundaki önceden hesaplanmış değerleri çek
    const { prisma } = require('../../../infrastructure/database/prisma');
    const statsRows: Array<{ testId: string; ratingAvg: number | null; ratingCount: number }> =
      ids.length > 0
        ? await prisma.testStats.findMany({ where: { testId: { in: ids } }, select: { testId: true, ratingAvg: true, ratingCount: true } })
        : [];
    const statsMap: Record<string, { ratingAvg: number | null; ratingCount: number }> = {};
    for (const s of statsRows) statsMap[s.testId] = { ratingAvg: s.ratingAvg, ratingCount: s.ratingCount };
    // Fallback: testStats yoksa canlı review toplamlarından hesapla
    const aggs = await this.agg.getAggregatesForTestIds(ids);
    const enriched = items.map((t) => ({
      ...t,
      ratingAvg: statsMap[t.id]?.ratingAvg ?? aggs[t.id]?.avg ?? null,
      ratingCount: statsMap[t.id]?.ratingCount ?? aggs[t.id]?.count ?? 0,
    }));

    // Sadece gerekli alanlar istemciye döner (bilgi minimizasyonu)
    const summaries = enriched.map((t: any) => ({
      id: t.id,
      title: t.title,
      educatorId: t.educatorId,
      examTypeId: t.examTypeId ?? null,
      topicId: t.topicId ?? null,
      priceCents: t.priceCents ?? null,
      currency: t.currency ?? 'TRY',
      isTimed: t.isTimed,
      questionCount: t.questionCount ?? 0,
      ratingAvg: t.ratingAvg ?? null,
      ratingCount: t.ratingCount ?? 0,
    }));

    // Opsiyonel FX dönüşümü: displayCurrency verilmiş ve fx servisi DI'lı ise
    // her item'a `converted` alanı eklenir. Mevcut UI sözleşmesi bozulmaz.
    if (filters?.displayCurrency && this.fx) {
      const targetCur = filters.displayCurrency;
      const withConverted = await Promise.all(
        summaries.map(async (s: any) => {
          const sourceCur = (s.currency ?? 'TRY') as FxCurrency;
          if (s.priceCents == null || sourceCur === targetCur) return s;
          try {
            const amountCents = await this.fx!.convert(s.priceCents, sourceCur, targetCur);
            const rate = await this.fx!.getRate(sourceCur, targetCur);
            return { ...s, converted: { amountCents, currency: targetCur, rate } };
          } catch {
            // FX hatasında orijinal item olduğu gibi döner (graceful degrade)
            return s;
          }
        }),
      );
      return { items: withConverted, meta: { total: res.total, page, limit } };
    }

    return { items: summaries, meta: { total: res.total, page, limit } };
  }
}
