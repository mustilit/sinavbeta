import { BadRequestException, InternalServerErrorException, ConflictException } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { RedisCache } from '../../../infrastructure/cache/RedisCache';
import { prismaRetry } from '../../../infrastructure/prisma/prisma-retry';
import { getDefaultTenantId } from '../../../common/tenant';
import type { FxRateService, FxCurrency } from '../../../domain/interfaces/FxRateService';

/**
 * Adayın test satın alma işlemini yönetir.
 * - Kampanya fiyatı varsa ve geçerliyse baz fiyat olarak kullanılır.
 * - İndirim kodu uygulanabilir; maksimum %50 sınırı vardır.
 * - Satın alma + deneme (attempt) oluşturma atomik transaction ile yapılır.
 * - İndirim kullanım sayısı race condition'a karşı korumalı (updateMany with lt check).
 * - Başarılı satın alma sonrası aday için öneri cache'i temizlenir.
 */
export class PurchaseUseCase {
  /** Öneri cache'ini temizlemek için kullanılan Redis bağlantısı. */
  private cache: RedisCache;
  /**
   * @param prisma - Prisma client (primary)
   * @param fx - Opsiyonel FX servisi. Verilirse `amountUsdCents` snapshot kaydedilir.
   */
  constructor(
    private readonly prisma: PrismaClient,
    private readonly fx?: FxRateService,
  ) {
    this.cache = new RedisCache();
  }

  /**
   * Test satın alma işlemini gerçekleştirir.
   * Fiyat istemci tarafından gönderilmez; test fiyatı ve indirim kurallarından hesaplanır.
   * @param testId       - Satın alınacak testin ID'si.
   * @param candidateId  - Satın almayı yapan adayın ID'si.
   * @param discountCode - Opsiyonel indirim kodu.
   */
  async execute(testId: string, candidateId: string, discountCode?: string, paymentProvider?: string) {
    if (!testId || !candidateId) throw new BadRequestException({ code: 'INVALID_INPUT', message: 'Missing testId or candidateId' });

    // FR-Y-05: Satın alma kill-switch'i — admin panelinden geçici durdurulabilir
    const settings = await this.prisma.adminSettings.findFirst({ where: { id: 1 } });
    if (settings && !settings.purchasesEnabled) {
      throw new BadRequestException({ code: 'PURCHASES_DISABLED', message: 'Purchases are temporarily suspended' });
    }

    // Ön kontroller: test yayınlanmış olmalı, aday aktif olmalı
    // testId bir ExamTest ID'si olabilir (eski akış) veya TestPackage ID'si (yeni akış)
    const foundTest = await this.prisma.examTest.findUnique({ where: { id: testId } });
    let resolvedTest: any;
    let packageId: string | undefined;

    if (!foundTest) {
      // TestPackage ID ile satın alma denemesi — paketteki ilk testi bul
      const pkg = await (this.prisma.testPackage as any).findUnique({
        where: { id: testId },
        include: { tests: { where: { deletedAt: null }, orderBy: { createdAt: 'asc' }, take: 1 } },
      });
      if (!pkg) throw new BadRequestException({ code: 'TEST_NOT_FOUND', message: 'Test not found' });
      if (!pkg.publishedAt) throw new BadRequestException({ code: 'TEST_NOT_PUBLISHED', message: 'Package is not published' });
      if (!pkg.tests?.length) throw new BadRequestException({ code: 'PACKAGE_EMPTY', message: 'Package has no tests' });
      resolvedTest = { ...pkg.tests[0] };
      packageId = pkg.id;
      // priceCents paket fiyatından alınır; test fiyatı sıfır olabilir
      if (!resolvedTest.priceCents && pkg.priceCents != null) {
        resolvedTest.priceCents = pkg.priceCents;
      }
    } else {
      resolvedTest = foundTest;
    }

    const test = resolvedTest;

    // ExamTest status kontrolü yalnızca standalone (paket dışı) alımlarda geçerlidir.
    // TestPackage ID ile alımda paketin publishedAt kontrolü zaten yapıldı (yukarıda).
    // Paket içindeki ExamTest'ler DRAFT kalabilir; erişimi paketin yayın durumu belirler.
    if (!packageId && test.status && test.status !== 'PUBLISHED') {
      throw new BadRequestException({ code: 'TEST_NOT_PUBLISHED', message: 'Test is not published' });
    }

    const user = await this.prisma.user.findUnique({ where: { id: candidateId } });
    if (user && (user as any).status && (user as any).status !== 'ACTIVE') {
      throw new BadRequestException({ code: 'CANDIDATE_NOT_ACTIVE', message: 'Candidate not active' });
    }

    const now = new Date();
    let baseAmountCents = (test as any).priceCents ?? 0;
    const campaignPrice = (test as any).campaignPriceCents;
    const campaignFrom = (test as any).campaignValidFrom;
    const campaignUntil = (test as any).campaignValidUntil;
    // Kampanya fiyatı geçerli aralıktaysa baz fiyat olarak kullanılır
    if (typeof campaignPrice === 'number' && campaignFrom && campaignUntil && now >= campaignFrom && now <= campaignUntil) {
      baseAmountCents = campaignPrice;
    }
    let finalAmountCents = baseAmountCents;
    let discountApplied: any = null;

    if (discountCode) {
      // Eğiticiye bağlı indirim kodu veya global (createdById=null) indirim kodu tercih edilir
      const disc = await this.prisma.discountCode.findFirst({
        where: {
          code: discountCode,
          OR: [{ createdById: test.educatorId }, { createdById: null }],
        },
      });
      if (!disc) throw new BadRequestException({ code: 'DISCOUNT_NOT_FOUND', message: 'Discount not found' });
      if (disc.validFrom && disc.validFrom > now) throw new BadRequestException({ code: 'DISCOUNT_NOT_STARTED', message: 'Discount not started' });
      if (disc.validUntil && disc.validUntil < now) throw new BadRequestException({ code: 'DISCOUNT_EXPIRED', message: 'Discount expired' });
      if (disc.maxUses && disc.usedCount >= disc.maxUses) throw new BadRequestException({ code: 'DISCOUNT_MAXED_OUT', message: 'Discount usage limit reached' });
      const percent = disc.percentOff ?? 0;
      // Maksimum %50 indirim sınırı — aşırı indirim güvenlik kuralı
      if (percent > 50) throw new BadRequestException({ code: 'DISCOUNT_TOO_HIGH', message: 'Discount percent too high' });
      finalAmountCents = Math.max(0, Math.round(baseAmountCents * (100 - percent) / 100));
      discountApplied = disc;
    }

    const tenantId = (test as any).tenantId ?? getDefaultTenantId();

    // USD snapshot: çoklu para birimi raporlaması için (best-effort).
    // FX servisi DI'lı değilse veya çağrı başarısızsa null kaydedilir.
    const purchaseCurrency = ((test as any).currency ?? 'TRY') as FxCurrency;
    let amountUsdCents: number | undefined;
    if (this.fx) {
      try {
        amountUsdCents = await this.fx.convert(finalAmountCents, purchaseCurrency, 'USD');
      } catch {
        amountUsdCents = undefined;
      }
    }

    try {
      // Satın alma, deneme oluşturma ve audit kaydı tek transaction içinde yapılır
      const result = await prismaRetry(() =>
        this.prisma.$transaction(async (tx) => {
        // testId: ExamTest ID'si (packageId varsa test.id kullanılır, yoksa orijinal testId)
        const examTestId = test.id;
        const purchase = await tx.purchase.create({
          data: {
            tenantId,
            testId: examTestId,
            candidateId,
            amountCents: finalAmountCents,
            currency: purchaseCurrency,
            amountUsdCents: amountUsdCents ?? null,
            ...(discountApplied ? { discountCodeId: discountApplied.id } : {}),
            ...(packageId ? { packageId } : {}),
            ...(paymentProvider ? { paymentProvider } : {}),
          } as any,
        });

        const attempt = await tx.testAttempt.create({
          data: { testId: examTestId, candidateId, status: 'IN_PROGRESS' },
        });

        await tx.auditLog.create({
          data: {
            action: 'PURCHASE',
            entityType: 'Purchase',
            entityId: purchase.id,
            actorId: candidateId,
            metadata: { amountCents: finalAmountCents, discountCode: discountApplied ? discountApplied.code : null },
          },
        });

        // İndirim kullanım sayısını artır — updateMany + lt koşuluyla race condition koruması
        if (discountApplied) {
          if (discountApplied.maxUses) {
            // Maksimum kullanım sayısı varsa — usedCount < maxUses koşuluyla atomik artış
            const updated = await tx.discountCode.updateMany({
              where: { id: discountApplied.id, usedCount: { lt: discountApplied.maxUses } },
              data: { usedCount: { increment: 1 } },
            });
            // Güncellenen kayıt yoksa sınıra ulaşılmış demektir (race condition durumu)
            if (updated.count === 0) {
              throw new BadRequestException({ code: 'DISCOUNT_MAXED_OUT', message: 'Discount usage limit reached' });
            }
          } else {
            await tx.discountCode.update({ where: { id: discountApplied.id }, data: { usedCount: { increment: 1 } } as any });
          }
        }

          return { purchase, attempt };
        }),
      );
      // Satın alma sonrası adayın önerileri değişebilir — home öneri cache'ini temizle
      try {
        await this.cache.delByPrefix(`home:rec:${candidateId}:`);
      } catch {}
      return result;
    } catch (e: any) {
      // P2002: unique constraint ihlali — aday aynı testi zaten satın almış
      if (e?.code === 'P2002') {
        throw new ConflictException({ code: 'ALREADY_PURCHASED', message: 'Candidate has already purchased this test' });
      }
      if (e instanceof BadRequestException) throw e;
      // Hata durumunda stats yenileme işi kuyruğa eklenir (best-effort)
      try {
        const { QueueService } = require('../../../infrastructure/queue/queue.service');
        const qs = new QueueService();
        await qs.enqueueJob('stats-queue', 'refresh', { testId: test?.id ?? testId });
      } catch {}
      throw new InternalServerErrorException({ code: 'PURCHASE_FAILED', message: 'Purchase failed' });
    }
  }
}

