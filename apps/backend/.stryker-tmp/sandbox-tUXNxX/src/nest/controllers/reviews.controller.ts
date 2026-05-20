// @ts-nocheck
import { Controller, Post, Body, Param, Req, UseGuards, Get, Query } from '@nestjs/common';
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

/**
 * Test değerlendirme işlemlerini yönetir: yorum/puan oluşturma veya güncelleme,
 * yorumları listeleme ve puan ortalamasını sorgulama.
 * Yorum oluşturma CANDIDATE rolüne kısıtlı; listeleme ve ortalama herkese açıktır.
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
    this.createUc = new CreateOrUpdateReviewUseCase(reviewRepo, purchaseRepo, attemptRepo, auditRepo);
    this.listUc = new ListTestReviewsUseCase(reviewRepo);
    this.aggUc = new GetTestRatingAggregateUseCase(reviewRepo);
  }

  @Post('tests/:id/reviews')
  @Roles('CANDIDATE')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiBearerAuth('bearer')
  @ApiOkResponse({ type: ReviewUpsertResponseDto })
  @ApiErrorResponses()
  async create(@Param('id') id: string, @Body() body: { testRating?: number; educatorRating?: number; comment?: string }, @Req() req: any) {
    const candidateId = req.user?.id;
    return this.createUc.execute(id, candidateId, body);
  }

  @Public()
  @Get('tests/:id/reviews')
  @ApiOkResponse({ type: ListReviewsResponseDto })
  @ApiErrorResponses()
  async list(@Param('id') id: string, @Query('limit') limit: string, @Query('cursor') cursor: string) {
    const l = Math.min(50, Math.max(1, Number(limit) || 20));
    const res = await this.listUc.execute(id, l, cursor);
    // Gizlilik: kamuya açık yanıtta candidateId ve educatorId alanları kaldırılır
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

  @Get('tests/:id/my-review')
  @ApiBearerAuth('bearer')
  @ApiErrorResponses()
  async myReview(@Param('id') id: string, @Req() req: any) {
    const candidateId = req.user?.id;
    if (!candidateId) return null;
    const review = await prisma.review.findFirst({ where: { testId: id, candidateId } } as any);
    if (!review) return null;
    return {
      id: review.id,
      testRating: (review as any).testRating,
      educatorRating: (review as any).educatorRating,
      comment: (review as any).comment,
      createdAt: (review as any).createdAt,
    };
  }
}

