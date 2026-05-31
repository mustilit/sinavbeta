import { Controller, Get, Patch, Param, Query, Body, Req, Post } from '@nestjs/common';
import { ApiTags, ApiOkResponse, ApiBearerAuth } from '@nestjs/swagger';
import { ApiErrorResponses } from '../swagger/decorators';
import { EducatorPageResponseDto } from './dto/educator-page.response.dto';
import { Public } from '../decorators/public.decorator';
import { Roles } from '../decorators/roles.decorator';
import { EducatorPageQueryDto } from './dto/educator-page-query.dto';
import { PatchEducatorProfileDto } from './dto/patch-educator-profile.dto';
import { CreateDiscountCodeDto } from './dto/create-discount-code.dto';
import { PurchaseAdDto } from './dto/purchase-ad.dto';
import { RateEducatorDto } from './dto/rate-educator.dto';
import { GetEducatorPageUseCase } from '../../application/use-cases/educator/GetEducatorPageUseCase';
import { ListEducatorReviewsUseCase } from '../../application/use-cases/review/ListEducatorReviewsUseCase';
import { RateEducatorUseCase } from '../../application/use-cases/review/RateEducatorUseCase';
import { GetMyEducatorRatingUseCase } from '../../application/use-cases/review/GetMyEducatorRatingUseCase';
import { UpdateEducatorProfileUseCase } from '../../application/use-cases/educator/UpdateEducatorProfileUseCase';
import { getSharedModerateTextContentUseCase } from '../../application/services/content-safety/sharedModeration';
import { CheckDuplicateQuestionUseCase } from '../../application/use-cases/question/CheckDuplicateQuestionUseCase';
import { CheckDuplicateQuestionDto } from './dto/check-duplicate-question.dto';
import { CreateDiscountCodeUseCase } from '../../application/use-cases/discount/CreateDiscountCodeUseCase';
import { ListEducatorDiscountCodesUseCase } from '../../application/use-cases/discount/ListEducatorDiscountCodesUseCase';
import { GetEducatorSalesReportUseCase } from '../../application/use-cases/report/GetEducatorSalesReportUseCase';
import { PurchaseAdUseCase } from '../../application/use-cases/ad/PurchaseAdUseCase';
import { ListEducatorAdPurchasesUseCase } from '../../application/use-cases/ad/ListEducatorAdPurchasesUseCase';
import { GetEducatorAdStatsUseCase } from '../../application/use-cases/ad/GetEducatorAdStatsUseCase';
import { ListEducatorTestsUseCase } from '../../application/use-cases/test/ListEducatorTestsUseCase';
import { ListEducatorPurchasesUseCase } from '../../application/use-cases/purchase/ListEducatorPurchasesUseCase';
import { ToggleDiscountCodeUseCase } from '../../application/use-cases/discount/ToggleDiscountCodeUseCase';
import { GetEducatorPackageViewStatsUseCase } from '../../application/use-cases/package/GetEducatorPackageViewStatsUseCase';
import { PrismaUserRepository } from '../../infrastructure/repositories/PrismaUserRepository';
import { PrismaExamRepository } from '../../infrastructure/repositories/PrismaExamRepository';
import { PrismaTestStatsRepository } from '../../infrastructure/repositories/PrismaTestStatsRepository';
import { PrismaAuditLogRepository } from '../../infrastructure/repositories/PrismaAuditLogRepository';
import { ReviewAggregationService } from '../../application/services/ReviewAggregationService';
import { USER_REPO, AUDIT_LOG_REPO } from '../../application/constants';
import { Inject } from '@nestjs/common';
import type { IUserRepository } from '../../domain/interfaces/IUserRepository';
import type { IAuditLogRepository } from '../../domain/interfaces/IAuditLogRepository';

/**
 * Eğiticiye özel işlemleri ve kamuya açık profil sayfasını yönetir.
 * /educators/me/* endpoint'leri EDUCATOR rolüne kısıtlıdır.
 * /educators/:id ve /educators/by-email endpoint'leri herkese açıktır (@Public).
 */
@Controller('educators')
@ApiTags('Educators')
export class EducatorsController {
  private pageUc: GetEducatorPageUseCase;

  constructor(
    @Inject(USER_REPO) private readonly userRepo: IUserRepository,
    @Inject(AUDIT_LOG_REPO) private readonly auditRepo: IAuditLogRepository,
    @Inject(CreateDiscountCodeUseCase) private readonly createDiscountCodeUC: CreateDiscountCodeUseCase,
    @Inject(ListEducatorDiscountCodesUseCase) private readonly listDiscountCodesUC: ListEducatorDiscountCodesUseCase,
    @Inject(GetEducatorSalesReportUseCase) private readonly getSalesReportUC: GetEducatorSalesReportUseCase,
    @Inject(PurchaseAdUseCase) private readonly purchaseAdUC: PurchaseAdUseCase,
    @Inject(ListEducatorAdPurchasesUseCase) private readonly listAdPurchasesUC: ListEducatorAdPurchasesUseCase,
    @Inject(ListEducatorTestsUseCase) private readonly listTestsUC: ListEducatorTestsUseCase,
    @Inject(ListEducatorPurchasesUseCase) private readonly listPurchasesUC: ListEducatorPurchasesUseCase,
    @Inject(ToggleDiscountCodeUseCase) private readonly toggleDiscountCodeUC: ToggleDiscountCodeUseCase,
  ) {
    // GetEducatorPageUseCase birden fazla bağımlılık gerektirdiğinden doğrudan örneklenir
    this.pageUc = new GetEducatorPageUseCase(new PrismaUserRepository(), new PrismaExamRepository(), new PrismaTestStatsRepository(), new ReviewAggregationService());
  }

  @Patch('me')
  @Roles('EDUCATOR')
  @ApiBearerAuth('bearer')
  @ApiOkResponse({ description: 'Educator profile updated' })
  @ApiErrorResponses()
  async patchMe(@Req() req: any, @Body() dto: PatchEducatorProfileDto) {
    const actorId = (req as any).user?.id;
    const uc = new UpdateEducatorProfileUseCase(this.userRepo, this.auditRepo, getSharedModerateTextContentUseCase());
    return uc.execute(actorId, { metadata: dto.metadata as Record<string, unknown> });
  }

  /**
   * Kopya soru tespiti — eğitici soru girerken (blur) çağrılır. Eğiticinin TÜM
   * sorularıyla (yayım durumu / paket fark etmez) Jaccard benzerliği; >= %75 ise
   * isDuplicate=true. Frontend amber uyarı gösterir (CreateTest + EditTest).
   */
  @Post('me/questions/check-duplicate')
  @Roles('EDUCATOR', 'ADMIN')
  async checkDuplicateQuestion(@Body() dto: CheckDuplicateQuestionDto, @Req() req: any) {
    const educatorId = (req as any).user?.id;
    const uc = new CheckDuplicateQuestionUseCase();
    return uc.execute(educatorId, dto.content, dto.excludeQuestionId ?? null);
  }

  /**
   * Reddedilmiş eğitici başvurusunu yeniden gönder — REJECTED → PENDING_EDUCATOR_APPROVAL.
   * rejectionReason ve rejectedAt temizlenir. EDUCATOR_RESUBMITTED audit kaydı oluşturulur.
   * Raw SQL — Prisma client regenerate edilmediği için (Windows EPERM) status enum'a
   * REJECTED dahil olmayabilir; status::text karşılaştırması güvenli.
   */
  @Post('me/resubmit-application')
  @Roles('EDUCATOR')
  @ApiBearerAuth('bearer')
  @ApiOkResponse({ description: 'Educator application resubmitted (REJECTED → PENDING)' })
  @ApiErrorResponses()
  async resubmitApplication(@Req() req: any) {
    const userId = (req as any).user?.id;
    const { prisma } = require('../../infrastructure/database/prisma');
    const cur = await prisma.$queryRaw<Array<{ status: string }>>`
      SELECT status::text AS status FROM users WHERE id = ${userId} LIMIT 1
    `;
    if (!cur[0]) throw new Error('USER_NOT_FOUND');
    if (cur[0].status !== 'REJECTED') {
      // Sadece REJECTED durumdan yeniden başvuru anlamlı; aksi halde no-op (idempotent).
      return { status: cur[0].status, message: 'NO_CHANGE' };
    }
    const now = new Date();
    await prisma.$executeRaw`
      UPDATE users
      SET status = 'PENDING_EDUCATOR_APPROVAL'::"UserStatus",
          "rejectionReason" = NULL,
          "rejectedAt" = NULL,
          "updatedAt" = ${now}
      WHERE id = ${userId}
    `;
    try {
      await this.auditRepo.create({
        action: 'EDUCATOR_RESUBMITTED' as any,
        entityType: 'USER',
        entityId: userId,
        actorId: userId,
        metadata: {} as any,
      });
    } catch {
      // best-effort
    }
    return { status: 'PENDING_EDUCATOR_APPROVAL', resubmittedAt: now };
  }

  /**
   * Eğiticinin onboarding tamamlanma durumunu döner.
   * CV ve uzmanlık alanları doldurulmuş mu? Frontend bu cevapla kullanıcıyı
   * `EducatorOnboarding` sayfasına yönlendirip yönlendirmeyeceğine karar verir.
   */
  @Get('me/onboarding-status')
  @Roles('EDUCATOR')
  @ApiBearerAuth('bearer')
  @ApiErrorResponses()
  async getOnboardingStatus(@Req() req: any) {
    const userId = (req as any).user?.id;
    const { prisma } = require('../../infrastructure/database/prisma');
    const user: any = await (prisma as any).user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true, metadata: true, emailVerified: true },
    });
    if (!user) {
      return { complete: false, hasName: false, hasCv: false, hasSpecialization: false, emailVerified: false };
    }
    const meta = (user.metadata && typeof user.metadata === 'object') ? user.metadata : {};
    const hasName = Boolean(user.firstName && user.lastName);
    const hasCv = Boolean(meta.cv_url && typeof meta.cv_url === 'string' && meta.cv_url.trim().length > 0);
    const specs = Array.isArray(meta.specialized_exam_types) ? meta.specialized_exam_types : [];
    const hasSpecialization = specs.length > 0;
    return {
      complete: hasName && hasCv && hasSpecialization,
      hasName,
      hasCv,
      hasSpecialization,
      emailVerified: Boolean(user.emailVerified),
    };
  }

  @Post('me/discount-codes')
  @Roles('EDUCATOR')
  @ApiBearerAuth('bearer')
  @ApiOkResponse({ description: 'FR-E-09: Discount code created' })
  @ApiErrorResponses()
  async createDiscountCode(@Req() req: any, @Body() dto: CreateDiscountCodeDto) {
    const educatorId = (req as any).user?.id;
    return this.createDiscountCodeUC.execute(educatorId, {
      code: dto.code,
      percentOff: dto.percentOff,
      maxUses: dto.maxUses,
      validFrom: dto.validFrom ? new Date(dto.validFrom) : null,
      validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
      description: dto.description,
    });
  }

  @Get('me/discount-codes')
  @Roles('EDUCATOR')
  @ApiBearerAuth('bearer')
  @ApiOkResponse({ description: 'FR-E-09: List educator discount codes' })
  @ApiErrorResponses()
  async listDiscountCodes(@Req() req: any) {
    const educatorId = (req as any).user?.id;
    return this.listDiscountCodesUC.execute(educatorId);
  }

  @Patch('me/discount-codes/:id/toggle')
  @Roles('EDUCATOR')
  @ApiBearerAuth('bearer')
  @ApiOkResponse({ description: 'FR-E-09: Indirim kodunu pasife al / aktive et (toggle)' })
  @ApiErrorResponses()
  async toggleDiscountCode(@Req() req: any, @Param('id') id: string) {
    const educatorId = (req as any).user?.id;
    return this.toggleDiscountCodeUC.execute(educatorId, id);
  }

  @Get('me/reports/sales')
  @Roles('EDUCATOR')
  @ApiBearerAuth('bearer')
  @ApiOkResponse({ description: 'FR-E-06: Educator sales and resolution report' })
  @ApiErrorResponses()
  async getSalesReport(@Req() req: any) {
    const educatorId = (req as any).user?.id;
    return this.getSalesReportUC.execute(educatorId);
  }

  /**
   * FR-E-07: Reklam satın alma — TEST (belirli paket) veya EDUCATOR (kendisi) türünde.
   * targetType 'EDUCATOR' ise testId göndermek gerekmez.
   */
  @Post('me/ads')
  @Roles('EDUCATOR')
  @ApiBearerAuth('bearer')
  @ApiOkResponse({ description: 'FR-E-07: Purchase ad for test or educator profile' })
  @ApiErrorResponses()
  async purchaseAd(@Req() req: any, @Body() dto: PurchaseAdDto) {
    const educatorId = (req as any).user?.id;
    // Sprint 15 #4 — opsiyonel platform promo kodu (AD_PACKAGE scope)
    const promoCode = typeof (dto as any).promoCode === 'string' ? (dto as any).promoCode : undefined;
    return this.purchaseAdUC.execute(
      educatorId,
      dto.adPackageId,
      dto.testId ?? null,
      (dto as any).targetType ?? 'TEST',
      promoCode,
    );
  }

  /** Eğiticinin satın aldığı reklam paketlerini listeler */
  @Get('me/ads')
  @Roles('EDUCATOR')
  @ApiBearerAuth('bearer')
  @ApiOkResponse({ description: 'FR-E-07: List educator ad purchases' })
  @ApiErrorResponses()
  async listAdPurchases(@Req() req: any) {
    const educatorId = (req as any).user?.id;
    return this.listAdPurchasesUC.execute(educatorId);
  }

  /**
   * Eğiticinin reklam istatistiklerini döndürür:
   * toplam gösterim, kalan gösterim, son 30 günün günlük dağılımı.
   */
  @Get('me/ads/stats')
  @Roles('EDUCATOR')
  @ApiBearerAuth('bearer')
  @ApiOkResponse({ description: 'Educator ad impression stats (per purchase + daily breakdown)' })
  @ApiErrorResponses()
  async adStats(@Req() req: any) {
    const educatorId = (req as any).user?.id;
    const uc = new GetEducatorAdStatsUseCase();
    return uc.execute(educatorId);
  }

  @Get('me/tests')
  @Roles('EDUCATOR')
  @ApiBearerAuth('bearer')
  @ApiOkResponse({ description: 'List educator tests (including drafts)' })
  @ApiErrorResponses()
  async listMyTests(@Req() req: any) {
    const educatorId = (req as any).user?.id;
    return this.listTestsUC.execute(educatorId);
  }

  @Get('me/sales')
  @Roles('EDUCATOR')
  @ApiBearerAuth('bearer')
  @ApiOkResponse({ description: 'List educator sales (purchases of their tests)' })
  @ApiErrorResponses()
  async listMySales(@Req() req: any) {
    const educatorId = (req as any).user?.id;
    return this.listPurchasesUC.execute(educatorId);
  }

  /**
   * Eğiticinin kendi paketleri için görüntülenme istatistikleri.
   * Query: ids=pkg1,pkg2 → yalnız bu paketlerin istatistikleri (opsiyonel filtre).
   * Yetki: yalnızca eğiticinin sahip olduğu paketler döner — başkasının paketini
   * sorgulasa da boş döner (use case where clause educatorId ile).
   */
  @Get('me/packages/views')
  @Roles('EDUCATOR', 'ADMIN')
  @ApiBearerAuth('bearer')
  @ApiOkResponse({ description: 'View stats per package for educator dashboard' })
  @ApiErrorResponses()
  async myPackageViews(@Req() req: any, @Query('ids') ids?: string) {
    const educatorId = (req as any).user?.id;
    const uc = new GetEducatorPackageViewStatsUseCase();
    const idList = ids
      ? ids.split(',').map((s) => s.trim()).filter(Boolean)
      : undefined;
    return uc.execute(educatorId, idList);
  }

  @Public()
  @Get('by-email')
  @ApiOkResponse({ type: EducatorPageResponseDto })
  @ApiErrorResponses()
  async byEmail(@Query('email') email: string, @Query() q: EducatorPageQueryDto) {
    const e = (email || '').trim().toLowerCase();
    const user = e ? await this.userRepo.findByEmail(e) : null;
    if (!user) {
      // use existing error handling contract
      throw new Error('EDUCATOR_NOT_FOUND');
    }
    const page = q.page ?? 1;
    const limit = q.limit ?? 20;
    const examTypeId = q.examTypeId;
    const sortBy = q.sortBy;
    const sortDir = q.sortDir as any;
    return this.pageUc.execute(user.id, { page, limit, examTypeId, sortBy, sortDir });
  }

  @Public()
  @Get(':id/reviews')
  @ApiOkResponse({ description: 'Eğiticiye ait tüm testlerin yorumlarını döndürür' })
  @ApiErrorResponses()
  async listReviews(@Param('id') id: string, @Query('limit') limit?: string) {
    const uc = new ListEducatorReviewsUseCase();
    const l = limit ? parseInt(limit, 10) : 20;
    return uc.execute(id, isNaN(l) ? 20 : l);
  }

  /**
   * Aday eğiticiyi puanlar (educatorRating). Satın alma zorunlu (use case doğrular).
   * Eğitici puanı test puanından (testRating) BAĞIMSIZDIR.
   */
  @Post(':id/rate')
  @Roles('CANDIDATE')
  @ApiBearerAuth('bearer')
  @ApiOkResponse({ description: 'Aday eğiticiyi puanlar (1-5, educatorRating)' })
  @ApiErrorResponses()
  async rateEducator(@Param('id') id: string, @Body() dto: RateEducatorDto, @Req() req: any) {
    const candidateId = (req as any).user?.id;
    const uc = new RateEducatorUseCase(getSharedModerateTextContentUseCase());
    return uc.execute(id, candidateId, { rating: dto.rating, comment: dto.comment });
  }

  /**
   * Adayın bu eğitici için puanlama uygunluğu (satın alma var mı) + mevcut puanı.
   * Frontend "Değerlendir" butonunu ve modal prefill'ini bununla yönetir.
   */
  @Get(':id/my-rating')
  @Roles('CANDIDATE')
  @ApiBearerAuth('bearer')
  @ApiOkResponse({ description: 'Adayın eğitici puanı durumu (eligible + mevcut rating/comment)' })
  @ApiErrorResponses()
  async myEducatorRating(@Param('id') id: string, @Req() req: any) {
    const candidateId = (req as any).user?.id;
    const uc = new GetMyEducatorRatingUseCase();
    return uc.execute(id, candidateId);
  }

  @Public()
  @Get(':id')
  @ApiOkResponse({ type: EducatorPageResponseDto })
  @ApiErrorResponses()
  async page(@Param('id') id: string, @Query() q: EducatorPageQueryDto) {
    const page = q.page ?? 1;
    const limit = q.limit ?? 20;
    const examTypeId = q.examTypeId;
    const sortBy = q.sortBy;
    const sortDir = q.sortDir as any;
    return this.pageUc.execute(id, { page, limit, examTypeId, sortBy, sortDir });
  }
}

