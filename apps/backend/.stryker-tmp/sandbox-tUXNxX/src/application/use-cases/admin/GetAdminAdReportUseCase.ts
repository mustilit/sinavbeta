// @ts-nocheck
import { prisma } from '../../../infrastructure/database/prisma';

/**
 * Reklam satın alım raporunun her bir kalemi.
 * isActive: validUntil > şimdiki zaman VE impressionsRemaining > 0 ise true.
 */
export interface AdReportItem {
  id: string;
  createdAt: Date;
  validUntil: Date;
  targetType: string;
  educatorId: string;
  educatorUsername: string;
  educatorEmail: string;
  packageId: string;
  packageName: string;
  priceCents: number;
  durationDays: number;
  /** Satın alınan toplam gösterim hakkı (paket tanımından) */
  totalImpressions: number;
  impressionsDelivered: number;
  impressionsRemaining: number;
  testId: string | null;
  testTitle: string | null;
  /** validUntil > şimdiki zaman VE impressionsRemaining > 0 ise aktif sayılır */
  isActive: boolean;
}

/**
 * Reklam raporunun tamamını temsil eder; kalemler + özet metrikler.
 */
export interface AdReportResult {
  items: AdReportItem[];
  totalRevenueCents: number;
  totalImpressionsSold: number;
  totalImpressionsDelivered: number;
  activeCount: number;
}

/**
 * execute() metoduna geçilecek filtre parametreleri.
 * Tüm alanlar opsiyonel — belirtilmeyenler filtreleme dışı bırakılır.
 */
export interface AdReportFilters {
  /** Yıl filtresi (opsiyonel): satın alım createdAt yılı */
  year?: number;
  /** Ay filtresi (opsiyonel): satın alım createdAt ayı [1-12] */
  month?: number;
  /** Belirli bir eğiticiye göre filtrele */
  educatorId?: string;
  /** Reklam hedef türüne göre filtrele: 'TEST' veya 'EDUCATOR' */
  targetType?: 'TEST' | 'EDUCATOR';
}

/**
 * GetAdminAdReportUseCase — admin için reklam satın alım raporunu üretir.
 *
 * Ön koşullar:
 *   - Çağıran tarafın ADMIN rolüne sahip olması (controller katmanında kontrol edilir)
 *
 * Filtreleme:
 *   - year + month verilirse o aya ait satın alımlar; sadece year verilirse tüm yıl
 *   - educatorId ve targetType doğrudan WHERE koşuluna eklenir
 *
 * Sıralama: createdAt DESC (en yeni satın alım ilk)
 */
export class GetAdminAdReportUseCase {
  async execute(filters: AdReportFilters): Promise<AdReportResult> {
    const now = new Date();

    // Tarih filtresi: hem yıl hem ay verildiyse ay bazlı, sadece yıl verildiyse yıl bazlı aralık oluştur
    let createdAtFilter: { gte: Date; lt: Date } | undefined;
    if (filters.year !== undefined && filters.month !== undefined) {
      // Ay bazlı: ayın başından bir sonraki ayın başına kadar
      const startOfMonth = new Date(filters.year, filters.month - 1, 1);
      const endOfMonth = new Date(filters.year, filters.month, 1);
      createdAtFilter = { gte: startOfMonth, lt: endOfMonth };
    } else if (filters.year !== undefined) {
      // Yıl bazlı: yılın başından bir sonraki yılın başına kadar
      const startOfYear = new Date(filters.year, 0, 1);
      const endOfYear = new Date(filters.year + 1, 0, 1);
      createdAtFilter = { gte: startOfYear, lt: endOfYear };
    }

    // Prisma where koşulunu dinamik olarak oluştur
    const where: Record<string, unknown> = {};
    if (createdAtFilter) where.createdAt = createdAtFilter;
    if (filters.educatorId) where.educatorId = filters.educatorId;
    if (filters.targetType) where.targetType = filters.targetType;

    const purchases = await prisma.adPurchase.findMany({
      where,
      include: {
        educator: {
          select: { id: true, username: true, email: true },
        },
        adPackage: true,
        test: {
          select: { id: true, title: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Özet sayaçlar
    let totalRevenueCents = 0;
    let totalImpressionsSold = 0;
    let totalImpressionsDelivered = 0;
    let activeCount = 0;

    const items: AdReportItem[] = purchases.map((p) => {
      // Satın alınan toplam gösterim: pakette tanımlanan impressions değeri
      const totalImpressions = p.adPackage.impressions;

      // Aktif: süre dolmamış VE kalan gösterim hakkı var
      const isActive = p.validUntil > now && p.impressionsRemaining > 0;

      // Gelir ve gösterim istatistiklerini biriktir
      totalRevenueCents += p.adPackage.priceCents;
      totalImpressionsSold += totalImpressions;
      totalImpressionsDelivered += p.impressionsDelivered;
      if (isActive) activeCount++;

      return {
        id: p.id,
        createdAt: p.createdAt,
        validUntil: p.validUntil,
        targetType: p.targetType,
        educatorId: p.educator.id,
        educatorUsername: p.educator.username,
        educatorEmail: p.educator.email,
        packageId: p.adPackage.id,
        packageName: p.adPackage.name,
        priceCents: p.adPackage.priceCents,
        durationDays: p.adPackage.durationDays,
        totalImpressions,
        impressionsDelivered: p.impressionsDelivered,
        impressionsRemaining: p.impressionsRemaining,
        testId: p.test?.id ?? null,
        testTitle: p.test?.title ?? null,
        isActive,
      };
    });

    return {
      items,
      totalRevenueCents,
      totalImpressionsSold,
      totalImpressionsDelivered,
      activeCount,
    };
  }
}
