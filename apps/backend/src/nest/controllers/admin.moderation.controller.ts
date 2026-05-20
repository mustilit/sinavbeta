import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  Req,
  UseGuards,
  Inject,
} from '@nestjs/common';
import { Roles } from '../decorators/roles.decorator';
import { WorkerPermissions } from '../decorators/worker-permissions.decorator';
import { ListPendingModerationsUseCase } from '../../application/use-cases/moderation/ListPendingModerationsUseCase';
import { GetModerationResultUseCase } from '../../application/use-cases/moderation/GetModerationResultUseCase';
import { ApproveModerationUseCase } from '../../application/use-cases/moderation/ApproveModerationUseCase';
import { RejectModerationUseCase } from '../../application/use-cases/moderation/RejectModerationUseCase';
import { ListRiskyEducatorsUseCase } from '../../application/use-cases/moderation/ListRiskyEducatorsUseCase';
import { GetEducatorViolationHistoryUseCase } from '../../application/use-cases/moderation/GetEducatorViolationHistoryUseCase';
import { ApplyModerationActionUseCase } from '../../application/use-cases/moderation/ApplyModerationActionUseCase';
import { RevokeModerationActionUseCase } from '../../application/use-cases/moderation/RevokeModerationActionUseCase';
import { ListBlockedTermsUseCase } from '../../application/use-cases/moderation/ListBlockedTermsUseCase';
import { CreateBlockedTermUseCase } from '../../application/use-cases/moderation/CreateBlockedTermUseCase';
import { UpdateBlockedTermUseCase } from '../../application/use-cases/moderation/UpdateBlockedTermUseCase';
import { DeleteBlockedTermUseCase } from '../../application/use-cases/moderation/DeleteBlockedTermUseCase';
import { ListPendingModerationsQueryDto } from './dto/list-pending-moderations-query.dto';
import { ApproveModerationDto } from './dto/approve-moderation.dto';
import { RejectModerationDto } from './dto/reject-moderation.dto';
import { ListRiskyEducatorsQueryDto } from './dto/list-risky-educators-query.dto';
import { ApplyModerationActionDto } from './dto/apply-moderation-action.dto';
import { CreateBlockedTermDto } from './dto/create-blocked-term.dto';
import { UpdateBlockedTermDto } from './dto/update-blocked-term.dto';
import { ListBlockedTermsQueryDto } from './dto/list-blocked-terms-query.dto';

const TENANT_ID = process.env.DEFAULT_TENANT_ID ?? 'dev-tenant';

@Controller('admin/moderation')
export class AdminModerationController {
  constructor(
    @Inject(ListPendingModerationsUseCase) private readonly listPendingUC: ListPendingModerationsUseCase,
    @Inject(GetModerationResultUseCase) private readonly getResultUC: GetModerationResultUseCase,
    @Inject(ApproveModerationUseCase) private readonly approveUC: ApproveModerationUseCase,
    @Inject(RejectModerationUseCase) private readonly rejectUC: RejectModerationUseCase,
    @Inject(ListRiskyEducatorsUseCase) private readonly listRiskyUC: ListRiskyEducatorsUseCase,
    @Inject(GetEducatorViolationHistoryUseCase) private readonly getHistoryUC: GetEducatorViolationHistoryUseCase,
    @Inject(ApplyModerationActionUseCase) private readonly applyActionUC: ApplyModerationActionUseCase,
    @Inject(RevokeModerationActionUseCase) private readonly revokeActionUC: RevokeModerationActionUseCase,
    @Inject(ListBlockedTermsUseCase) private readonly listTermsUC: ListBlockedTermsUseCase,
    @Inject(CreateBlockedTermUseCase) private readonly createTermUC: CreateBlockedTermUseCase,
    @Inject(UpdateBlockedTermUseCase) private readonly updateTermUC: UpdateBlockedTermUseCase,
    @Inject(DeleteBlockedTermUseCase) private readonly deleteTermUC: DeleteBlockedTermUseCase,
  ) {}

  // ── Moderasyon kuyruğu ──────────────────────────────────────────────────────

  @Get('queue')
  @Roles('ADMIN', 'WORKER')
  @WorkerPermissions('ModerationQueue')
  async listQueue(@Query() q: ListPendingModerationsQueryDto) {
    return this.listPendingUC.execute({
      tenantId: TENANT_ID,
      cursor: q.cursorId ? { id: q.cursorId } : undefined,
      limit: q.limit,
      category: q.category,
      dateFrom: q.dateFrom ? new Date(q.dateFrom) : undefined,
      dateTo: q.dateTo ? new Date(q.dateTo) : undefined,
      userId: q.userId,
    });
  }

  @Get('results/:id')
  @Roles('ADMIN', 'WORKER')
  @WorkerPermissions('ModerationQueue')
  async getResult(@Param('id') id: string) {
    return this.getResultUC.execute(id);
  }

  @Post('results/:id/approve')
  @Roles('ADMIN', 'WORKER')
  @WorkerPermissions('ModerationQueue')
  async approve(
    @Param('id') id: string,
    @Body() dto: ApproveModerationDto,
    @Req() req: any,
  ) {
    await this.approveUC.execute({
      resultId: id,
      reviewerId: req.user?.id,
      reviewerNote: dto.reviewerNote ?? null,
    });
    return { success: true };
  }

  @Post('results/:id/reject')
  @Roles('ADMIN', 'WORKER')
  @WorkerPermissions('ModerationQueue')
  async reject(
    @Param('id') id: string,
    @Body() dto: RejectModerationDto,
    @Req() req: any,
  ) {
    await this.rejectUC.execute({
      resultId: id,
      reviewerId: req.user?.id,
      reviewerNote: dto.reviewerNote ?? null,
    });
    return { success: true };
  }

  // ── Riskli eğiticiler ───────────────────────────────────────────────────────

  @Get('risky-educators')
  @Roles('ADMIN')
  async listRiskyEducators(@Query() q: ListRiskyEducatorsQueryDto) {
    const cursor =
      q.cursorUserId && q.cursorScore
        ? { userId: q.cursorUserId, computedScore: Number(q.cursorScore) }
        : undefined;

    return this.listRiskyUC.execute({
      tenantId: TENANT_ID,
      cursor,
      limit: q.limit,
      riskLevels: q.riskLevel,
      dateFrom: q.dateFrom ? new Date(q.dateFrom) : undefined,
      dateTo: q.dateTo ? new Date(q.dateTo) : undefined,
    });
  }

  @Get('educators/:id/violations')
  @Roles('ADMIN')
  async getEducatorViolations(
    @Param('id') id: string,
    @Query('cursorId') cursorId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.getHistoryUC.execute({
      educatorId: id,
      tenantId: TENANT_ID,
      cursor: cursorId ? { id: cursorId } : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Post('educators/:id/actions')
  @Roles('ADMIN')
  async applyAction(
    @Param('id') id: string,
    @Body() dto: ApplyModerationActionDto,
    @Req() req: any,
  ) {
    return this.applyActionUC.execute({
      tenantId: TENANT_ID,
      userId: id,
      actorId: req.user?.id,
      actionType: dto.actionType,
      reason: dto.reason,
      durationDays: dto.durationDays ?? null,
      violationId: dto.violationId ?? null,
    });
  }

  @Delete('actions/:id')
  @Roles('ADMIN')
  async revokeAction(@Param('id') id: string, @Req() req: any) {
    await this.revokeActionUC.execute({
      actionId: id,
      actorId: req.user?.id,
      tenantId: TENANT_ID,
    });
    return { success: true };
  }

  // ── Yasaklı terimler ────────────────────────────────────────────────────────

  @Get('blocked-terms')
  @Roles('ADMIN')
  async listBlockedTerms(@Query() q: ListBlockedTermsQueryDto) {
    return this.listTermsUC.execute({
      tenantId: TENANT_ID,
      cursor: q.cursorId ? { id: q.cursorId } : undefined,
      limit: q.limit,
      category: q.category,
      isActive: q.isActive,
      term: q.term,
    });
  }

  @Post('blocked-terms')
  @Roles('ADMIN')
  async createBlockedTerm(@Body() dto: CreateBlockedTermDto, @Req() req: any) {
    return this.createTermUC.execute({
      tenantId: TENANT_ID,
      term: dto.term,
      pattern: dto.pattern ?? null,
      category: dto.category,
      severity: dto.severity,
      isActive: dto.isActive,
      createdBy: req.user?.id,
    });
  }

  @Patch('blocked-terms/:id')
  @Roles('ADMIN')
  async updateBlockedTerm(
    @Param('id') id: string,
    @Body() dto: UpdateBlockedTermDto,
  ) {
    return this.updateTermUC.execute({
      id,
      tenantId: TENANT_ID,
      term: dto.term,
      pattern: dto.pattern,
      category: dto.category,
      severity: dto.severity,
      isActive: dto.isActive,
    });
  }

  @Delete('blocked-terms/:id')
  @Roles('ADMIN')
  async deleteBlockedTerm(@Param('id') id: string) {
    await this.deleteTermUC.execute(id, TENANT_ID);
    return { success: true };
  }
}
