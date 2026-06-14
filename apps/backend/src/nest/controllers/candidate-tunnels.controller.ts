import { Controller, Get, Post, Body, Param, Query, Req, Inject } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOkResponse } from '@nestjs/swagger';
import { Roles } from '../decorators/roles.decorator';
import { SubmitTunnelAnswerDto } from './dto/submit-tunnel-answer.dto';
import { PurchaseTunnelDto, ValidateTunnelDiscountDto } from './dto/purchase-tunnel.dto';
import { ReportTunnelQuestionDto } from './dto/report-tunnel-question.dto';
import { ListPublishedTunnelsUseCase, GetPublishedTunnelMetaUseCase } from '../../application/use-cases/tunnel/CandidateTunnelUseCases';
import { PurchaseTunnelUseCase } from '../../application/use-cases/tunnel/PurchaseTunnelUseCase';
import { ValidateTunnelDiscountUseCase } from '../../application/use-cases/tunnel/ValidateTunnelDiscountUseCase';
import { StartTunnelAttemptUseCase, GetTunnelAttemptStateUseCase } from '../../application/use-cases/tunnel/StartTunnelAttemptUseCase';
import { SubmitTunnelAnswerUseCase } from '../../application/use-cases/tunnel/SubmitTunnelAnswerUseCase';
import { ReportTunnelQuestionUseCase } from '../../application/use-cases/tunnel/ReportTunnelQuestionUseCase';
import { GetCandidateTunnelReportsUseCase } from '../../application/use-cases/tunnel/GetCandidateTunnelReportsUseCase';

/**
 * Aday tünel akışı — pazar listesi, satın alma, başlat/sürdür, çöz.
 * Eğitici controller'ından (/tunnels) AYRI: aday katmanı/doğru cevabı göremez.
 */
@Controller('candidate-tunnels')
@ApiTags('CandidateTunnels')
@ApiBearerAuth('bearer')
export class CandidateTunnelsController {
  constructor(
    @Inject(ListPublishedTunnelsUseCase) private readonly listUC: ListPublishedTunnelsUseCase,
    @Inject(GetPublishedTunnelMetaUseCase) private readonly metaUC: GetPublishedTunnelMetaUseCase,
    @Inject(PurchaseTunnelUseCase) private readonly purchaseUC: PurchaseTunnelUseCase,
    @Inject(ValidateTunnelDiscountUseCase) private readonly validateDiscountUC: ValidateTunnelDiscountUseCase,
    @Inject(StartTunnelAttemptUseCase) private readonly startUC: StartTunnelAttemptUseCase,
    @Inject(GetTunnelAttemptStateUseCase) private readonly stateUC: GetTunnelAttemptStateUseCase,
    @Inject(SubmitTunnelAnswerUseCase) private readonly answerUC: SubmitTunnelAnswerUseCase,
    @Inject(ReportTunnelQuestionUseCase) private readonly reportUC: ReportTunnelQuestionUseCase,
    @Inject(GetCandidateTunnelReportsUseCase) private readonly reportsUC: GetCandidateTunnelReportsUseCase,
  ) {}

  @Get()
  @Roles('CANDIDATE')
  @ApiOkResponse({ description: 'Yayınlanmış tüneller' })
  async list(@Req() req: any, @Query('examTypeId') examTypeId?: string, @Query('topicId') topicId?: string) {
    return this.listUC.execute({ examTypeId, topicId }, req.user?.id);
  }

  @Get('reports')
  @Roles('CANDIDATE')
  @ApiOkResponse({ description: 'Aday tünel raporu (ilerleme + durum)' })
  async reports(@Req() req: any) {
    return this.reportsUC.execute(req.user?.id);
  }

  @Get(':id')
  @Roles('CANDIDATE')
  @ApiOkResponse({ description: 'Tünel meta + satın alma/ilerleme durumu' })
  async meta(@Param('id') id: string, @Req() req: any) {
    return this.metaUC.execute(id, req.user?.id);
  }

  @Post(':id/validate-discount')
  @Roles('CANDIDATE')
  @ApiOkResponse({ description: 'İndirim kodu önizleme doğrulaması' })
  async validateDiscount(@Param('id') id: string, @Body() body: ValidateTunnelDiscountDto) {
    return this.validateDiscountUC.execute({ code: body.code, tunnelId: id });
  }

  @Post(':id/purchase')
  @Roles('CANDIDATE')
  @ApiOkResponse({ description: 'Tünel satın alındı' })
  async purchase(@Param('id') id: string, @Body() body: PurchaseTunnelDto, @Req() req: any) {
    return this.purchaseUC.execute(id, req.user?.id, body?.discountCode, {
      acceptedDistanceSaleContractId: body?.acceptedDistanceSaleContractId,
      paymentProvider: body?.paymentProvider,
      ip: req.ip ?? req.headers?.['x-forwarded-for'] ?? null,
      userAgent: req.headers?.['user-agent'] ?? null,
    });
  }

  @Post(':id/start')
  @Roles('CANDIDATE')
  @ApiOkResponse({ description: 'Tünel başlat/sürdür' })
  async start(@Param('id') id: string, @Req() req: any) {
    return this.startUC.execute(id, req.user?.id);
  }

  @Get(':id/play')
  @Roles('CANDIDATE')
  @ApiOkResponse({ description: 'Aktif soru + ilerleme' })
  async play(@Param('id') id: string, @Req() req: any) {
    return this.stateUC.execute(id, req.user?.id);
  }

  @Post(':id/answer')
  @Roles('CANDIDATE')
  @ApiOkResponse({ description: 'Cevap gönder (adaptif motor)' })
  async answer(@Param('id') id: string, @Body() dto: SubmitTunnelAnswerDto, @Req() req: any) {
    return this.answerUC.execute(id, dto.selectedOptionId, req.user?.id);
  }

  @Post(':id/report')
  @Roles('CANDIDATE')
  @ApiOkResponse({ description: 'Soru hata bildirimi' })
  async report(@Param('id') id: string, @Body() dto: ReportTunnelQuestionDto, @Req() req: any) {
    return this.reportUC.execute(id, { questionId: dto.questionId, reason: dto.reason }, req.user?.id);
  }
}
