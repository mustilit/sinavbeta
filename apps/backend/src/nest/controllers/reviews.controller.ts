import { Controller, Post, Body, Param, Req, UseGuards, Get, Query, BadRequestException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiBearerAuth, ApiOkResponse } from '@nestjs/swagger';
import { ApiErrorResponses } from '../swagger/decorators';
import { ListReviewsResponseDto } from './dto/reviews-list.response.dto';
import { TestRatingResponseDto } from './dto/test-rating.response.dto';
import { ReviewUpsertResponseDto } from './dto/review-upsert.response.dto';
import { Roles } from '../decorators/roles.decorator';
import { Public } from '../decorators/public.decorator';
import { CreateOrUpdateReviewUseCase } from '../../application/use-cases/review/CreateOrUpdateReviewUseCase';
import { ListTestReviewsUseCase } from '../../application/use-cases/review/ListTestReviewsUseCase';
import { GetTestRatingAggregateUseCase } from '../../application/use-cases/test/GetTestRatingAggregateUseCase';
import { PrismaReviewRepository } from '../../infrastructure/repositories/PrismaReviewRepository';
import { PrismaPurchaseRepository } from '../../infrastructure/repositories/PrismaPurchaseRepository';
import { PrismaAttemptRepository } from '../../infrastructure/repositories/PrismaAttemptRepository';
import { PrismaAuditLogRepository } from '../../infrastructure/repositories/PrismaAuditLogRepository';
import { prisma } from '../../infrastructure/database/prisma';
import { getSharedModerateTextContentUseCase } from '../../application/services/content-safety/sharedModeration';

/**
 * Test bazlı review endpoint'leri — yeni domain modeli (paket bazlı review) ile
 * geri uyumluluk sağlar. Yeni client'lar /marketplace/packages/:id/reviews kullanmalı.
 *
 * Bu controller:
 *  - GET /tests/:id/reviews → testId üzerinden paketi bulup paketin review'larını döner
 *  - GET /tests/:id/rating → testId'nin paketinin ortalama puanı
 *  - GET /tests/:id/my-review → adayın o paket için review'u
 *  - POST /tests/:id/reviews → testId'nin paketine review yaratır/günceller (deprecated alias)
 */
@Controller()
@ApiTags('Reviews')
export class ReviewsController {
  private createUc: CreateOrUpdateReviewUseCase;
  private listUc: ListTestReviewsUseCase;
  private aggUc: GetTestRatingAggregateUseCase;
  constructor() {
    const reviewRepo = new PrismaReviewRepository();
    const purchaseRepo = new PrismaPurchaseRepository();
    const attemptRepo = new PrismaAttemptRepository();
    const auditRepo = new PrismaAuditLogRepository();
    this.createUc = new CreateOrUpdateReviewUseCase(reviewRepo, purchaseRepo, attemptRepo, auditRepo, getSharedModerateTextContentUseCase());
    this.listUc = new ListTestReviewsUseCase(reviewRepo);
    this.aggUc = new GetTestRatingAggregateUseCase(reviewRepo);
  }

  /**
   * Deprecated: testId üzerinden review yaratma. Paket bağlamı bulunup
   * yeni CreateOrUpdateReviewUseCase çağrılır (1 aday × 1 paket = 1 review).
   */
  @Post('tests/:id/reviews')
  @Roles('CANDIDATE')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiBearerAuth('bearer')
  @ApiOkResponse({ type: ReviewUpsertResponseDto })
  @ApiErrorResponses()
  async create(@Param('id') id: string, @Body() body: { testRating?: number; educatorRating?: number; comment?: string }, @Req() req: any) {
    const candidateId = req.user?.id;
    const test = await prisma.examTest.findUnique({ where: { id }, select: { packageId: true } });
    const packageId = (test as any)?.packageId;
    if (!packageId) throw new BadRequestException('PACKAGE_NOT_FOUND');
    return this.createUc.execute(packageId, candidateId, body);
  }

  @Public()
  @Get('tests/:id/reviews')
  @ApiOkResponse({ type: ListReviewsResponseDto })
  @ApiErrorResponses()
  async list(@Param('id') id: string, @Query('limit') limit: string, @Query('cursor') cursor: string) {
    const l = Math.min(50, Math.max(1, Number(limit) || 20));
    const res = await this.listUc.execute(id, l, cursor);
    // Gizlilik: kamuya açık yanıtta candidateId/educatorId alanları kaldırılır
    const items = res.items.map((r) => ({ id: r.id, testRating: r.testRating, educatorRating: r.educatorRating, comment: r.comment, createdAt: r.createdAt }));
    return { items, meta: { nextCursor: res.nextCursor } };
  }

  @Public()
  @Get('tests/:id/rating')
  @ApiOkResponse({ type: TestRatingResponseDto })
  @ApiErrorResponses()
  async agg(@Param('id') id: string) {
    return this.aggUc.execute(id);
  }

  /**
   * Deprecated: paket-bazlı review döner (testId'den packageId bulunarak).
   */
  @Get('tests/:id/my-review')
  @Roles('CANDIDATE')
  @ApiBearerAuth('bearer')
  @ApiErrorResponses()
  async myReview(@Param('id') id: string, @Req() req: any) {
    const candidateId = req.user?.id;
    if (!candidateId) return null;
    const test = await prisma.examTest.findUnique({ where: { id }, select: { packageId: true } });
    const packageId = (test as any)?.packageId;
    if (!packageId) return null;
    const review: any = await (prisma as any).review.findFirst({ where: { packageId, candidateId } });
    if (!review) return null;
    return {
      id: review.id,
      testRating: review.testRating,
      educatorRating: review.educatorRating,
      comment: review.comment,
      createdAt: review.createdAt,
    };
  }
}
