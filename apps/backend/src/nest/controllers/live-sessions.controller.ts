import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Param,
  Body,
  Req,
  Inject,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOkResponse, ApiBearerAuth } from '@nestjs/swagger';
import { ApiErrorResponses } from '../swagger/decorators';
import { Roles } from '../decorators/roles.decorator';
import { Public } from '../decorators/public.decorator';
import { EducatorActiveGuard } from '../guards/educator-active.guard';

import { CreateLiveSessionDto } from './dto/create-live-session.dto';
import { CreateLiveTierDto } from './dto/create-live-tier.dto';
import { UpdateLiveTierDto } from './dto/update-live-tier.dto';

import { CreateLiveSessionUseCase } from '../../application/use-cases/live/CreateLiveSessionUseCase';
import { GetLiveSessionStateUseCase } from '../../application/use-cases/live/GetLiveSessionStateUseCase';
import { JoinLiveSessionUseCase } from '../../application/use-cases/live/JoinLiveSessionUseCase';
import { SubmitLiveAnswerUseCase } from '../../application/use-cases/live/SubmitLiveAnswerUseCase';
import { StartLiveSessionUseCase } from '../../application/use-cases/live/StartLiveSessionUseCase';
import { NavigateLiveQuestionUseCase } from '../../application/use-cases/live/NavigateLiveQuestionUseCase';
import { ToggleLiveStatsUseCase } from '../../application/use-cases/live/ToggleLiveStatsUseCase';
import { EndLiveSessionUseCase } from '../../application/use-cases/live/EndLiveSessionUseCase';
import { PingLiveSessionUseCase } from '../../application/use-cases/live/PingLiveSessionUseCase';
import { PayLiveSessionUseCase } from '../../application/use-cases/live/PayLiveSessionUseCase';
import { ListMyLiveSessionsUseCase } from '../../application/use-cases/live/ListMyLiveSessionsUseCase';
import { ListLiveSessionTiersUseCase } from '../../application/use-cases/live/ListLiveSessionTiersUseCase';
import { CreateLiveSessionTierUseCase } from '../../application/use-cases/live/CreateLiveSessionTierUseCase';
import { UpdateLiveSessionTierUseCase } from '../../application/use-cases/live/UpdateLiveSessionTierUseCase';
import { DeleteLiveSessionTierUseCase } from '../../application/use-cases/live/DeleteLiveSessionTierUseCase';
import { GetLiveSessionByCodeUseCase } from '../../application/use-cases/live/GetLiveSessionByCodeUseCase';
import { CreateRound2LiveSessionUseCase } from '../../application/use-cases/live/CreateRound2LiveSessionUseCase';
import { GetLiveSessionComparisonUseCase } from '../../application/use-cases/live/GetLiveSessionComparisonUseCase';

@Controller('live-sessions')
@ApiTags('LiveSessions')
@ApiBearerAuth('bearer')
@UseGuards(EducatorActiveGuard)
export class LiveSessionsController {
  constructor(
    @Inject(CreateLiveSessionUseCase) private readonly createUC: CreateLiveSessionUseCase,
    @Inject(GetLiveSessionStateUseCase) private readonly stateUC: GetLiveSessionStateUseCase,
    @Inject(JoinLiveSessionUseCase) private readonly joinUC: JoinLiveSessionUseCase,
    @Inject(SubmitLiveAnswerUseCase) private readonly answerUC: SubmitLiveAnswerUseCase,
    @Inject(StartLiveSessionUseCase) private readonly startUC: StartLiveSessionUseCase,
    @Inject(NavigateLiveQuestionUseCase) private readonly navUC: NavigateLiveQuestionUseCase,
    @Inject(ToggleLiveStatsUseCase) private readonly toggleStatsUC: ToggleLiveStatsUseCase,
    @Inject(EndLiveSessionUseCase) private readonly endUC: EndLiveSessionUseCase,
    @Inject(PingLiveSessionUseCase) private readonly pingUC: PingLiveSessionUseCase,
    @Inject(PayLiveSessionUseCase) private readonly payUC: PayLiveSessionUseCase,
    @Inject(ListMyLiveSessionsUseCase) private readonly listMyUC: ListMyLiveSessionsUseCase,
    @Inject(ListLiveSessionTiersUseCase) private readonly listTiersUC: ListLiveSessionTiersUseCase,
    @Inject(CreateLiveSessionTierUseCase) private readonly createTierUC: CreateLiveSessionTierUseCase,
    @Inject(UpdateLiveSessionTierUseCase) private readonly updateTierUC: UpdateLiveSessionTierUseCase,
    @Inject(DeleteLiveSessionTierUseCase) private readonly deleteTierUC: DeleteLiveSessionTierUseCase,
    @Inject(GetLiveSessionByCodeUseCase) private readonly byCodeUC: GetLiveSessionByCodeUseCase,
    @Inject(CreateRound2LiveSessionUseCase) private readonly round2UC: CreateRound2LiveSessionUseCase,
    @Inject(GetLiveSessionComparisonUseCase) private readonly comparisonUC: GetLiveSessionComparisonUseCase,
  ) {}

  // Tier endpoints (Admin)

  @Get('tiers')
  @Roles('CANDIDATE', 'EDUCATOR', 'ADMIN', 'WORKER')
  @ApiOkResponse({ description: 'Tier listesi' })
  @ApiErrorResponses()
  async listTiers() {
    return this.listTiersUC.execute(true);
  }

  @Get('tiers/all')
  @Roles('ADMIN')
  @ApiOkResponse({ description: 'Tum tier listesi (admin)' })
  @ApiErrorResponses()
  async listAllTiers() {
    return this.listTiersUC.execute(false);
  }

  @Post('tiers')
  @Roles('ADMIN')
  @ApiOkResponse({ description: 'Tier olustur' })
  @ApiErrorResponses()
  async createTier(@Body() dto: CreateLiveTierDto) {
    return this.createTierUC.execute({
      label: dto.label,
      minParticipants: dto.minParticipants ?? 0,
      maxParticipants: dto.maxParticipants ?? null,
      priceCents: dto.priceCents ?? 0,
      order: dto.order,
    });
  }

  @Put('tiers/:id')
  @Roles('ADMIN')
  @ApiOkResponse({ description: 'Tier guncelle' })
  @ApiErrorResponses()
  async updateTier(@Param('id') id: string, @Body() dto: UpdateLiveTierDto) {
    return this.updateTierUC.execute({ id, ...dto });
  }

  @Delete('tiers/:id')
  @Roles('ADMIN')
  @ApiOkResponse({ description: 'Tier sil' })
  @ApiErrorResponses()
  async deleteTier(@Param('id') id: string) {
    return this.deleteTierUC.execute(id);
  }

  // Session management (Educator)

  @Post()
  @Roles('EDUCATOR', 'ADMIN')
  @ApiOkResponse({ description: 'Canli oturum olustur' })
  @ApiErrorResponses()
  async create(@Body() dto: CreateLiveSessionDto, @Req() req: any) {
    return this.createUC.execute({
      educatorId: req.user.id,
      title: dto.title,
      tierId: dto.tierId,
      maxParticipants: dto.maxParticipants,
      questions: dto.questions.map((q, i) => ({
        content: q.content,
        mediaUrl: q.mediaUrl,
        order: i + 1,
        options: q.options.map((o, j) => ({
          content: o.content,
          mediaUrl: o.mediaUrl,
          isCorrect: o.isCorrect,
          order: j + 1,
        })),
      })),
    });
  }

  @Get('my')
  @Roles('EDUCATOR', 'ADMIN')
  @ApiOkResponse({ description: 'Kendi oturumlarim — cursor pagination + status filter' })
  @ApiErrorResponses()
  async listMy(
    @Req() req: any,
    @Query('cursorId') cursorId?: string,
    @Query('cursorCreatedAt') cursorCreatedAt?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
  ) {
    const validStatus = status === 'DRAFT' || status === 'ACTIVE' || status === 'ENDED' ? status : undefined;
    const cursor =
      cursorId && cursorCreatedAt
        ? { id: cursorId, createdAt: new Date(cursorCreatedAt) }
        : undefined;
    return this.listMyUC.execute(req.user.id, {
      cursor,
      limit: limit ? Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100) : 20,
      status: validStatus,
    });
  }

  @Post(':id/pay')
  @Roles('EDUCATOR', 'ADMIN')
  @ApiOkResponse({ description: 'Oturum odeme' })
  @ApiErrorResponses()
  async pay(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    // Sprint 15 #4 — body.promoCode opsiyonel; varsa atomik validate + apply
    const promoCode = typeof body?.promoCode === 'string' ? body.promoCode : undefined;
    return this.payUC.execute(id, req.user.id, promoCode);
  }

  @Post(':id/start')
  @Roles('EDUCATOR', 'ADMIN')
  @ApiOkResponse({ description: 'Oturumu baslat' })
  @ApiErrorResponses()
  async start(@Param('id') id: string, @Req() req: any) {
    return this.startUC.execute(id, req.user.id);
  }

  @Post(':id/next')
  @Roles('EDUCATOR', 'ADMIN')
  @ApiOkResponse({ description: 'Sonraki soru' })
  @ApiErrorResponses()
  async next(@Param('id') id: string, @Req() req: any) {
    return this.navUC.execute(id, req.user.id, 'next');
  }

  @Post(':id/prev')
  @Roles('EDUCATOR', 'ADMIN')
  @ApiOkResponse({ description: 'Onceki soru' })
  @ApiErrorResponses()
  async prev(@Param('id') id: string, @Req() req: any) {
    return this.navUC.execute(id, req.user.id, 'prev');
  }

  @Post(':id/toggle-stats')
  @Roles('EDUCATOR', 'ADMIN')
  @ApiOkResponse({ description: 'Istatistik goster/gizle' })
  @ApiErrorResponses()
  async toggleStats(@Param('id') id: string, @Req() req: any) {
    return this.toggleStatsUC.execute(id, req.user.id);
  }

  @Post(':id/end')
  @Roles('EDUCATOR', 'ADMIN')
  @ApiOkResponse({ description: 'Oturumu bitir' })
  @ApiErrorResponses()
  async end(@Param('id') id: string, @Req() req: any) {
    return this.endUC.execute(id, req.user.id);
  }

  @Post(':id/round2')
  @Roles('EDUCATOR', 'ADMIN')
  @ApiOkResponse({ description: 'Tur 2 olustur' })
  @ApiErrorResponses()
  async createRound2(@Param('id') id: string, @Req() req: any) {
    return this.round2UC.execute(id, req.user.id);
  }

  @Get(':id/comparison')
  @Roles('EDUCATOR', 'ADMIN')
  @ApiOkResponse({ description: 'Oturum karsilastirma istatistikleri' })
  @ApiErrorResponses()
  async comparison(@Param('id') id: string, @Req() req: any) {
    return this.comparisonUC.execute(id, req.user.id);
  }

  // Participant endpoints

  @Get(':id/state')
  @Roles('CANDIDATE', 'EDUCATOR', 'ADMIN', 'WORKER')
  @ApiOkResponse({ description: 'Oturum durumu (polling)' })
  @ApiErrorResponses()
  async state(@Param('id') id: string, @Req() req: any) {
    return this.stateUC.execute(id, req.user.id);
  }

  @Post('join/:code')
  @Roles('CANDIDATE')
  @ApiOkResponse({ description: 'Oturuma katil' })
  @ApiErrorResponses()
  async join(@Param('code') code: string, @Req() req: any) {
    // IP — kapatma saldırısı limiti için (aynı cihazdan max katılım).
    const ip = req?.ip ?? req?.headers?.['x-forwarded-for'] ?? null;
    return this.joinUC.execute(code.toUpperCase(), req.user.id, { ip: Array.isArray(ip) ? ip[0] : ip });
  }

  @Post(':id/ping')
  @Roles('CANDIDATE')
  @ApiOkResponse({ description: 'Katilimci heartbeat' })
  @ApiErrorResponses()
  async ping(@Param('id') id: string, @Req() req: any) {
    return this.pingUC.execute(id, req.user.id);
  }

  @Post(':id/answer')
  @Roles('CANDIDATE')
  @ApiOkResponse({ description: 'Cevap gonder' })
  @ApiErrorResponses()
  async answer(
    @Param('id') id: string,
    @Body() body: { questionId: string; optionId: string },
    @Req() req: any,
  ) {
    return this.answerUC.execute(id, req.user.id, body.questionId, body.optionId);
  }

  // Public lookup

  @Get('code/:code')
  @Public()
  @ApiOkResponse({ description: 'Kod ile oturum bilgisi (public)' })
  @ApiErrorResponses()
  async getByCode(@Param('code') code: string) {
    return this.byCodeUC.execute(code.toUpperCase());
  }
}
