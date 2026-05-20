// @ts-nocheck
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
import { GetEducatorPageUseCase } from '../../application/use-cases/educator/GetEducatorPageUseCase';
import { ListEducatorReviewsUseCase } from '../../application/use-cases/review/ListEducatorReviewsUseCase';
import { UpdateEducatorProfileUseCase } from '../../application/use-cases/educator/UpdateEducatorProfileUseCase';
import { CreateDiscountCodeUseCase } from '../../application/use-cases/discount/CreateDiscountCodeUseCase';
import { ListEducatorDiscountCodesUseCase } from '../../application/use-cases/discount/ListEducatorDiscountCodesUseCase';
import { GetEducatorSalesReportUseCase } from '../../application/use-cases/report/GetEducatorSalesReportUseCase';
import { PurchaseAdUseCase } from '../../application/use-cases/ad/PurchaseAdUseCase';
import { ListEducatorAdPurchasesUseCase } from '../../application/use-cases/ad/ListEducatorAdPurchasesUseCase';
import { GetEducatorAdStatsUseCase } from '../../application/use-cases/ad/GetEducatorAdStatsUseCase';
import { ListEducatorTestsUseCase } from '../../application/use-cases/test/ListEducatorTestsUseCase';
import { ListEducatorPurchasesUseCase } from '../../application/use-cases/purchase/ListEducatorPurchasesUseCase';
import { ToggleDiscountCodeUseCase } from '../../application/use-cases/discount/ToggleDiscountCodeUseCase';
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
    const uc = new UpdateEducatorProfileUseCase(this.userRepo, this.auditRepo);
    return uc.execute(actorId, { metadata: dto.metadata as Record<string, unknown> });
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
    return this.purchaseAdUC.execute(
      educatorId,
      dto.adPackageId,
      dto.testId ?? null,
      (dto as any).targetType ?? 'TEST',
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

