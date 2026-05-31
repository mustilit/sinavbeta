import { Controller, Get, Post, Query, Param, Inject, Req, Body, HttpCode } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiOkResponse, ApiBearerAuth } from '@nestjs/swagger';
import { ApiErrorResponses } from '../../swagger/decorators';
import { ListMarketplaceTestsResponseDto } from './dto/marketplace-list.response.dto';
import { ListMarketplaceTestsUseCase } from '../../../application/use-cases/test/ListMarketplaceTestsUseCase';
import { ListMarketplacePackagesUseCase } from '../../../application/use-cases/package/ListMarketplacePackagesUseCase';
import { GetMarketplacePackageUseCase } from '../../../application/use-cases/package/GetMarketplacePackageUseCase';
import { GetPackageReviewsUseCase } from '../../../application/use-cases/package/GetPackageReviewsUseCase';
import { GetMyPackageReviewUseCase } from '../../../application/use-cases/package/GetMyPackageReviewUseCase';
import { RecordPackageViewUseCase } from '../../../application/use-cases/package/RecordPackageViewUseCase';
import { CreateOrUpdateReviewUseCase } from '../../../application/use-cases/review/CreateOrUpdateReviewUseCase';
import { PrismaReviewRepository } from '../../../infrastructure/repositories/PrismaReviewRepository';
import { PrismaPurchaseRepository } from '../../../infrastructure/repositories/PrismaPurchaseRepository';
import { PrismaAttemptRepository } from '../../../infrastructure/repositories/PrismaAttemptRepository';
import { PrismaAuditLogRepository } from '../../../infrastructure/repositories/PrismaAuditLogRepository';
import { getSharedModerateTextContentUseCase } from '../../../application/services/content-safety/sharedModeration';
import { Roles } from '../../decorators/roles.decorator';
import { Public } from '../../decorators/public.decorator';
import { ListMarketplaceTestsDto } from './dto/list-marketplace-tests.dto';

@Controller('marketplace')
@ApiTags('Marketplace')
export class MarketplaceController {
  private readonly upsertReviewUC: CreateOrUpdateReviewUseCase;

  constructor(
    @Inject(ListMarketplaceTestsUseCase) private readonly listUC: ListMarketplaceTestsUseCase,
    @Inject(ListMarketplacePackagesUseCase) private readonly listPackagesUC: ListMarketplacePackagesUseCase,
    @Inject(GetMarketplacePackageUseCase) private readonly getPackageUC: GetMarketplacePackageUseCase,
    @Inject(GetPackageReviewsUseCase) private readonly getPackageReviewsUC: GetPackageReviewsUseCase,
    @Inject(GetMyPackageReviewUseCase) private readonly getMyPackageReviewUC: GetMyPackageReviewUseCase,
    @Inject(RecordPackageViewUseCase) private readonly recordViewUC: RecordPackageViewUseCase,
  ) {
    // Review upsert use-case'i — review modülünün NestJS DI'a kayıtlı olup olmaması durumuna
    // bağımlı kalmamak için manuel kuruluyor (mevcut ReviewsController aynı pattern'i uygular).
    this.upsertReviewUC = new CreateOrUpdateReviewUseCase(
      new PrismaReviewRepository(),
      new PrismaPurchaseRepository(),
      new PrismaAttemptRepository(),
      new PrismaAuditLogRepository(),
      getSharedModerateTextContentUseCase(),
    );
  }

  /**
   * `:id` parametresi TestPackage id'si VEYA ExamTest id'si olabilir — TestDetail
   * bazı akışlarda (örn. eğitici profili test kartı) test id'siyle açılıyor. Her
   * iki durumda da paketin gerçek id'sini döndürür; çözülemezse orijinali bırakır
   * (use case NOT_FOUND/boş döner). Review ve view endpoint'leri paket bazlıdır.
   */
  private async resolvePackageId(id: string): Promise<string> {
    if (!id) return id;
    const { prisma } = require('../../../infrastructure/database/prisma');
    const pkg = await prisma.testPackage.findUnique({ where: { id }, select: { id: true } });
    if (pkg) return pkg.id;
    const test = await prisma.examTest.findUnique({ where: { id }, select: { packageId: true } });
    return test?.packageId ?? id;
  }

  @Public()
  @Get('tests')
  @ApiOkResponse({ type: ListMarketplaceTestsResponseDto })
  @ApiErrorResponses()
  async list(@Query() filters: ListMarketplaceTestsDto) {
    // ValidationPipe + transform will coerce query strings to proper types.
    return this.listUC.execute(filters);
  }

  @Public()
  @Get('packages')
  @ApiErrorResponses()
  async listPackages(
    @Query('examTypeId') examTypeId?: string,
    @Query('limit') limit?: string,
    @Query('q') q?: string,
  ) {
    return this.listPackagesUC.execute({
      examTypeId,
      limit: limit ? parseInt(limit, 10) : 20,
      q: q?.trim() || undefined,
    });
  }

  @Public()
  @Get('packages/:id')
  @ApiErrorResponses()
  async getPackage(@Param('id') id: string) {
    return this.getPackageUC.execute(id);
  }

  /**
   * Paketin review listesi (yeni model: aday başına tek satır) + ortalama + toplam sayım.
   * Offset-based paging: ?limit=10&offset=20
   */
  @Public()
  @Get('packages/:id/reviews')
  @ApiErrorResponses()
  async getPackageReviews(
    @Param('id') id: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const n = limit ? parseInt(limit, 10) : 10;
    const o = offset ? parseInt(offset, 10) : 0;
    const packageId = await this.resolvePackageId(id);
    return this.getPackageReviewsUC.execute(
      packageId,
      isNaN(n) ? 10 : n,
      isNaN(o) ? 0 : o,
    );
  }

  /**
   * Giriş yapmış adayın bu paket için kendi review özeti.
   * Yeni model: 1 aday × 1 paket = 1 review. Hiç puan vermediyse `null` döner.
   */
  @Get('packages/:id/my-review')
  @Roles('CANDIDATE')
  @ApiBearerAuth('bearer')
  @ApiErrorResponses()
  async getMyPackageReview(@Param('id') id: string, @Req() req: any) {
    const candidateId = req.user?.id;
    if (!candidateId) return null;
    const packageId = await this.resolvePackageId(id);
    return this.getMyPackageReviewUC.execute(packageId, candidateId);
  }

  /**
   * Aday paketi puanlar veya mevcut puanını günceller.
   * Body: { testRating: 1-5, comment?: string, educatorRating?: 1-5 }
   * Aynı (packageId, candidateId) için ikinci çağrı mevcut kaydı günceller.
   */
  @Post('packages/:id/reviews')
  @Roles('CANDIDATE')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiBearerAuth('bearer')
  @ApiErrorResponses()
  async upsertPackageReview(
    @Param('id') id: string,
    @Body() body: { testRating?: number; educatorRating?: number; comment?: string },
    @Req() req: any,
  ) {
    const candidateId = req.user?.id;
    const packageId = await this.resolvePackageId(id);
    return this.upsertReviewUC.execute(packageId, candidateId, body);
  }

  /**
   * Paket görüntülenmesini loglar (fire-and-forget).
   * Public — login olmayan kullanıcılar da loglanır (anonim viewerId = null).
   * Fronend TestDetail mount'unda 1 kez çağırır; rate-limit ipHash bazlı.
   * Body: { sessionId?: string } — anonim oturum eşleştirme için.
   */
  @Public()
  @Post('packages/:id/view')
  @HttpCode(204)
  @ApiErrorResponses()
  async recordView(
    @Param('id') id: string,
    @Body() body: { sessionId?: string } | undefined,
    @Req() req: any,
  ) {
    const viewerId = req.user?.id ?? null;
    const ip = (req.headers?.['x-forwarded-for']?.toString().split(',')[0].trim()) || req.ip || null;
    const userAgent = req.headers?.['user-agent']?.toString() ?? null;
    const referrer = req.headers?.['referer']?.toString() ?? req.headers?.['referrer']?.toString() ?? null;

    // Bekletmeden 204 dön — log async (await yine de yapıyoruz hata yutmamak için, ama HTTP 204).
    try {
      await this.recordViewUC.execute({
        packageId: await this.resolvePackageId(id),
        viewerId,
        sessionId: body?.sessionId ?? null,
        ip,
        userAgent,
        referrer,
      });
    } catch {
      // Log hatası kullanıcının UX'ini bozmasın — sessizce yut.
    }
    return;
  }
}

