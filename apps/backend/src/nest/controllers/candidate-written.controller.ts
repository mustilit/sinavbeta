import { Controller, Get, Post, Body, Param, Query, Req, Inject } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOkResponse } from '@nestjs/swagger';
import { Roles } from '../decorators/roles.decorator';
import { Public } from '../decorators/public.decorator';
import { SubmitWrittenAnswerDto } from './dto/submit-written-answer.dto';
import { PurchaseWrittenDto } from './dto/purchase-written.dto';
import { ValidateWrittenDiscountDto } from './dto/validate-written-discount.dto';
import { ReportWrittenQuestionDto } from './dto/report-written-question.dto';
import {
  ListPublishedWrittenPackagesUseCase,
  GetPublishedWrittenPackageUseCase,
  ListMyWrittenPurchasesUseCase,
} from '../../application/use-cases/written/CandidateWrittenUseCases';
import { PurchaseWrittenPackageUseCase, ValidateWrittenDiscountUseCase } from '../../application/use-cases/written/WrittenPurchaseUseCases';
import {
  StartWrittenAttemptUseCase,
  SubmitWrittenAnswerUseCase,
  GetWrittenAttemptStateUseCase,
  SubmitWrittenAttemptUseCase,
  TimeoutWrittenAttemptUseCase,
  GetWrittenQuestionSolutionUseCase,
} from '../../application/use-cases/written/WrittenAttemptUseCases';
import { ReportWrittenQuestionUseCase } from '../../application/use-cases/written/ReportWrittenQuestionUseCase';
import {
  UpsertWrittenReviewUseCase,
  ListWrittenReviewsUseCase,
  GetMyWrittenReviewUseCase,
} from '../../application/use-cases/written/WrittenReviewUseCases';
import { UpsertWrittenReviewDto } from './dto/upsert-written-review.dto';

/**
 * Aday yazılı test akışı — pazar listesi/detay (public, çözüm sızdırmaz), satın alma,
 * başlat/çöz (metin cevap, PUAN YOK), çözümü gör, hata bildirimi.
 */
@Controller('candidate-written')
@ApiTags('CandidateWritten')
@ApiBearerAuth('bearer')
export class CandidateWrittenController {
  constructor(
    @Inject(ListPublishedWrittenPackagesUseCase) private readonly listUC: ListPublishedWrittenPackagesUseCase,
    @Inject(GetPublishedWrittenPackageUseCase) private readonly detailUC: GetPublishedWrittenPackageUseCase,
    @Inject(ListMyWrittenPurchasesUseCase) private readonly myPackagesUC: ListMyWrittenPurchasesUseCase,
    @Inject(PurchaseWrittenPackageUseCase) private readonly purchaseUC: PurchaseWrittenPackageUseCase,
    @Inject(ValidateWrittenDiscountUseCase) private readonly validateDiscountUC: ValidateWrittenDiscountUseCase,
    @Inject(StartWrittenAttemptUseCase) private readonly startUC: StartWrittenAttemptUseCase,
    @Inject(GetWrittenAttemptStateUseCase) private readonly stateUC: GetWrittenAttemptStateUseCase,
    @Inject(SubmitWrittenAnswerUseCase) private readonly answerUC: SubmitWrittenAnswerUseCase,
    @Inject(SubmitWrittenAttemptUseCase) private readonly finishUC: SubmitWrittenAttemptUseCase,
    @Inject(TimeoutWrittenAttemptUseCase) private readonly timeoutUC: TimeoutWrittenAttemptUseCase,
    @Inject(GetWrittenQuestionSolutionUseCase) private readonly solutionUC: GetWrittenQuestionSolutionUseCase,
    @Inject(ReportWrittenQuestionUseCase) private readonly reportUC: ReportWrittenQuestionUseCase,
    @Inject(UpsertWrittenReviewUseCase) private readonly upsertReviewUC: UpsertWrittenReviewUseCase,
    @Inject(ListWrittenReviewsUseCase) private readonly listReviewsUC: ListWrittenReviewsUseCase,
    @Inject(GetMyWrittenReviewUseCase) private readonly myReviewUC: GetMyWrittenReviewUseCase,
  ) {}

  @Get('packages')
  @Public()
  @ApiOkResponse({ description: 'Yayımlanmış yazılı paketler (pazar)' })
  async list(@Query('limit') limit?: string, @Query('cursor') cursor?: string) {
    return this.listUC.execute({ limit: limit ? Number(limit) : undefined, cursor: cursor || null });
  }

  @Get('my-packages')
  @Roles('CANDIDATE')
  @ApiOkResponse({ description: 'Adayın satın aldığı yazılı paketler (test + deneme durumu)' })
  async myPackages(@Req() req: any) {
    return this.myPackagesUC.execute(req.user?.id);
  }

  @Get('packages/:id')
  @Public()
  @ApiOkResponse({ description: 'Paket detay (çözüm sızdırmaz)' })
  async detail(@Param('id') id: string) {
    return this.detailUC.execute(id);
  }

  @Post('packages/:id/validate-discount')
  @Roles('CANDIDATE')
  async validateDiscount(@Param('id') id: string, @Body() dto: ValidateWrittenDiscountDto) {
    return this.validateDiscountUC.execute({ code: dto.code, packageId: id });
  }

  @Post('packages/:id/purchase')
  @Roles('CANDIDATE')
  async purchase(@Param('id') id: string, @Body() dto: PurchaseWrittenDto, @Req() req: any) {
    return this.purchaseUC.execute(id, req.user?.id, dto.discountCode, {
      acceptedDistanceSaleContractId: dto.acceptedDistanceSaleContractId,
      paymentProvider: dto.paymentProvider,
      ip: req.ip ?? null,
      userAgent: req.headers?.['user-agent'] ?? null,
    });
  }

  @Post('tests/:id/start')
  @Roles('CANDIDATE')
  async start(@Param('id') id: string, @Req() req: any) {
    return this.startUC.execute(id, req.user?.id);
  }

  @Get('attempts/:id/state')
  @Roles('CANDIDATE')
  async state(@Param('id') id: string, @Req() req: any) {
    return this.stateUC.execute(id, req.user?.id);
  }

  @Post('attempts/:id/answer')
  @Roles('CANDIDATE')
  async answer(@Param('id') id: string, @Body() dto: SubmitWrittenAnswerDto, @Req() req: any) {
    return this.answerUC.execute(id, dto.questionId, { textAnswer: dto.textAnswer, drawingUrl: dto.drawingUrl }, req.user?.id);
  }

  @Post('attempts/:id/finish')
  @Roles('CANDIDATE')
  async finish(@Param('id') id: string, @Req() req: any) {
    return this.finishUC.execute(id, req.user?.id);
  }

  @Post('attempts/:id/timeout')
  @Roles('CANDIDATE')
  async timeout(@Param('id') id: string, @Req() req: any) {
    return this.timeoutUC.execute(id, req.user?.id);
  }

  @Get('attempts/:id/questions/:questionId/solution')
  @Roles('CANDIDATE')
  async solution(@Param('id') id: string, @Param('questionId') questionId: string, @Req() req: any) {
    return this.solutionUC.execute(id, questionId, req.user?.id);
  }

  @Post('tests/:id/report')
  @Roles('CANDIDATE')
  async report(@Param('id') id: string, @Body() dto: ReportWrittenQuestionDto, @Req() req: any) {
    return this.reportUC.execute(id, { questionId: dto.questionId, reason: dto.reason }, req.user?.id);
  }

  @Get('packages/:id/reviews')
  @Public()
  @ApiOkResponse({ description: 'Paket değerlendirmeleri (ortalama + liste, herkese açık)' })
  async reviews(@Param('id') id: string, @Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.listReviewsUC.execute(id, { limit: limit ? Number(limit) : undefined, offset: offset ? Number(offset) : undefined });
  }

  @Get('packages/:id/my-review')
  @Roles('CANDIDATE')
  async myReview(@Param('id') id: string, @Req() req: any) {
    return this.myReviewUC.execute(id, req.user?.id);
  }

  @Post('packages/:id/review')
  @Roles('CANDIDATE')
  async upsertReview(@Param('id') id: string, @Body() dto: UpsertWrittenReviewDto, @Req() req: any) {
    return this.upsertReviewUC.execute(id, req.user?.id, { rating: dto.rating, comment: dto.comment });
  }
}
