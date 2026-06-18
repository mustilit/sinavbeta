import { prisma } from '../../../infrastructure/database/prisma';
import { AppError } from '../../errors/AppError';

const EDUCATOR_MAX_PERCENT = 50;

type PurchaseCtx = {
  acceptedDistanceSaleContractId?: string | null;
  paymentProvider?: string | null;
  ip?: string | null;
  userAgent?: string | null;
};

/** Satın alma anındaki paket içeriği snapshot'ı (ŞIK YOK — yazılı). */
async function buildTestsSnapshot(packageId: string) {
  const tests = await prisma.writtenTest.findMany({
    where: { packageId, deletedAt: null },
    select: {
      id: true,
      title: true,
      isTimed: true,
      duration: true,
      questions: {
        orderBy: { order: 'asc' },
        select: { id: true, content: true, mediaUrl: true, order: true, solutionText: true, solutionMediaUrl: true },
      },
    },
  });
  return tests.map((t) => ({
    testId: t.id,
    title: t.title,
    isTimed: t.isTimed,
    duration: t.duration ?? null,
    questions: t.questions.map((q) => ({
      id: q.id,
      content: q.content,
      mediaUrl: q.mediaUrl ?? null,
      order: q.order,
      solutionText: q.solutionText ?? null,
      solutionMediaUrl: q.solutionMediaUrl ?? null,
    })),
  }));
}

/**
 * Aday yayımlanmış yazılı PAKET satın alır. Idempotent: zaten ACTIVE ise mevcut döner.
 * Eğitici kendi paketini alamaz. Ücretsiz (priceCents=0) → provider atlanır. Mesafeli
 * satış sözleşmesi (aktif varsa) onayı zorunlu. testsSnapshot satın alma anında donar.
 * İndirim kodu PurchaseTunnel ile birebir (global clamp yok, eğitici %50, race-safe usedCount).
 */
export class PurchaseWrittenPackageUseCase {
  async execute(packageId: string, actorId?: string | null, discountCodeRaw?: string | null, ctx?: PurchaseCtx) {
    if (!actorId) throw new AppError('UNAUTHORIZED', 'Giriş gerekli', 401);

    const candidate = await prisma.user.findUnique({ where: { id: actorId }, select: { id: true, tenantId: true } });
    if (!candidate) throw new AppError('UNAUTHORIZED', 'Kullanıcı bulunamadı', 401);

    const pkg = await prisma.writtenPackage.findUnique({
      where: { id: packageId },
      select: { id: true, educatorId: true, priceCents: true, currency: true, isActive: true, publishedAt: true },
    });
    if (!pkg) throw new AppError('WRITTEN_PACKAGE_NOT_FOUND', 'Paket bulunamadı', 404);
    if (!pkg.publishedAt || !pkg.isActive)
      throw new AppError('WRITTEN_PACKAGE_NOT_PUBLISHED', 'Paket satın alınabilir değil', 409);
    if (pkg.educatorId === actorId)
      throw new AppError('OWN_PACKAGE', 'Kendi paketinizi satın alamazsınız', 403);

    const existing = await prisma.writtenPurchase.findUnique({
      where: { candidateId_packageId: { candidateId: actorId, packageId } },
    });
    if (existing && existing.status === 'ACTIVE') return existing;

    // Mesafeli satış sözleşmesi (Purchase/PurchaseTunnel deseni).
    const activeContract = await prisma.contract.findFirst({
      where: { type: 'DISTANCE_SALE', isActive: true },
      orderBy: { version: 'desc' },
    });
    if (activeContract) {
      if (!ctx?.acceptedDistanceSaleContractId || ctx.acceptedDistanceSaleContractId !== activeContract.id)
        throw new AppError('TERMS_NOT_ACCEPTED', 'Mesafeli satış sözleşmesi onayı zorunludur', 400);
    }
    const contractSnapshot = activeContract
      ? {
          paymentProvider: ctx?.paymentProvider ?? null,
          distanceSaleContractId: activeContract.id,
          distanceSaleAcceptedAt: new Date(),
          distanceSaleAcceptedIp: ctx?.ip ?? null,
          distanceSaleAcceptedUserAgent: ctx?.userAgent ?? null,
        }
      : { paymentProvider: ctx?.paymentProvider ?? null };

    const testsSnapshot = await buildTestsSnapshot(packageId);
    const code = (discountCodeRaw ?? '').trim();

    if (!code || pkg.priceCents <= 0) {
      return prisma.writtenPurchase.create({
        data: {
          tenantId: candidate.tenantId,
          packageId,
          candidateId: actorId,
          amountCents: pkg.priceCents,
          currency: pkg.currency,
          status: 'ACTIVE',
          testsSnapshot: testsSnapshot as object,
          ...contractSnapshot,
        },
      });
    }

    const dc = await prisma.discountCode.findFirst({
      where: { code: { equals: code, mode: 'insensitive' }, isActive: true },
    });
    if (!dc) throw new AppError('DISCOUNT_NOT_FOUND', 'İndirim kodu bulunamadı', 404);
    const now = new Date();
    if ((dc.validFrom && dc.validFrom > now) || (dc.validUntil && dc.validUntil < now))
      throw new AppError('DISCOUNT_OUT_OF_WINDOW', 'İndirim kodu geçerli tarih aralığında değil', 400);
    const isGlobal = dc.createdById === null;
    if (!isGlobal && dc.createdById !== pkg.educatorId)
      throw new AppError('DISCOUNT_NOT_OWNED', 'Bu kod bu pakette geçerli değil', 409);

    const pct = isGlobal ? dc.percentOff : Math.min(dc.percentOff, EDUCATOR_MAX_PERCENT);
    const discountAmount = Math.floor((pkg.priceCents * pct) / 100);
    const finalAmount = Math.max(0, pkg.priceCents - discountAmount);

    return prisma.$transaction(async (tx) => {
      const inc = await tx.discountCode.updateMany({
        where: { id: dc.id, isActive: true, ...(dc.maxUses != null ? { usedCount: { lt: dc.maxUses } } : {}) },
        data: { usedCount: { increment: 1 } },
      });
      if (inc.count === 0) throw new AppError('DISCOUNT_USAGE_EXHAUSTED', 'İndirim kodu kullanım limiti doldu', 409);

      return tx.writtenPurchase.create({
        data: {
          tenantId: candidate.tenantId,
          packageId,
          candidateId: actorId,
          amountCents: finalAmount,
          currency: pkg.currency,
          status: 'ACTIVE',
          discountCodeId: dc.id,
          discountAmountCents: discountAmount,
          testsSnapshot: testsSnapshot as object,
          ...contractSnapshot,
        },
      });
    });
  }
}

/**
 * Satın almadan önce indirim kodu önizleme (sayaç artırmaz). Kapsam + clamp
 * PurchaseWrittenPackage ile birebir hizalı.
 */
export class ValidateWrittenDiscountUseCase {
  async execute(input: { code: string; packageId: string }): Promise<{
    code: string;
    percentOff: number;
    discountCents: number;
    finalAmountCents: number;
    description: string | null;
  }> {
    const code = (input.code ?? '').trim();
    if (!code || !input.packageId) throw new AppError('DISCOUNT_NOT_FOUND', 'Geçersiz indirim kodu', 400);

    const pkg = await prisma.writtenPackage.findUnique({
      where: { id: input.packageId },
      select: { id: true, educatorId: true, isActive: true, publishedAt: true, priceCents: true },
    });
    if (!pkg || !pkg.publishedAt || !pkg.isActive)
      throw new AppError('WRITTEN_PACKAGE_NOT_FOUND', 'Paket bulunamadı', 404);

    const dc = await prisma.discountCode.findFirst({
      where: { code: { equals: code, mode: 'insensitive' } },
      select: { code: true, description: true, percentOff: true, maxUses: true, usedCount: true, validFrom: true, validUntil: true, isActive: true, createdById: true },
    });
    if (!dc) throw new AppError('DISCOUNT_NOT_FOUND', 'İndirim kodu bulunamadı', 404);
    if (!dc.isActive) throw new AppError('DISCOUNT_NOT_ACTIVE', 'İndirim kodu pasif', 409);

    const isGlobal = dc.createdById === null;
    if (!isGlobal && dc.createdById !== pkg.educatorId)
      throw new AppError('DISCOUNT_NOT_OWNED', 'Bu kod bu paket için geçerli değil', 409);

    const now = new Date();
    if (dc.validFrom && dc.validFrom > now) throw new AppError('DISCOUNT_OUT_OF_WINDOW', 'İndirim kodu henüz aktif değil', 409);
    if (dc.validUntil && dc.validUntil < now) throw new AppError('DISCOUNT_OUT_OF_WINDOW', 'İndirim kodunun süresi dolmuş', 409);
    if (dc.maxUses != null && dc.usedCount >= dc.maxUses)
      throw new AppError('DISCOUNT_USAGE_EXHAUSTED', 'İndirim kodu kullanım hakkı tükendi', 409);

    const percentOff = isGlobal ? dc.percentOff : Math.min(dc.percentOff, EDUCATOR_MAX_PERCENT);
    const discountCents = Math.floor((pkg.priceCents * percentOff) / 100);
    const finalAmountCents = Math.max(0, pkg.priceCents - discountCents);

    return { code: dc.code, percentOff, discountCents, finalAmountCents, description: dc.description };
  }
}
