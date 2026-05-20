import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../decorators/roles.decorator';
import { getDefaultTenantId } from '../../common/tenant';
import { ListEmailLogsUseCase } from '../../application/use-cases/email/ListEmailLogsUseCase';
import { GetEmailLogDetailUseCase } from '../../application/use-cases/email/GetEmailLogDetailUseCase';
import { RetryFailedEmailUseCase } from '../../application/use-cases/email/RetryFailedEmailUseCase';
import { ManageProviderConfigUseCase } from '../../application/use-cases/email/ManageProviderConfigUseCase';
import { TestProviderConfigUseCase } from '../../application/use-cases/email/TestProviderConfigUseCase';
import { ToggleEmailKillSwitchUseCase } from '../../application/use-cases/email/ToggleEmailKillSwitchUseCase';
import { ManageSuppressedEmailUseCase } from '../../application/use-cases/email/ManageSuppressedEmailUseCase';
import { ManageEmailTemplateUseCase } from '../../application/use-cases/email/ManageEmailTemplateUseCase';
import { GetEmailTrafficMetricsUseCase } from '../../application/use-cases/email/GetEmailTrafficMetricsUseCase';
import { ListEmailLogsQueryDto } from './dto/email-list-logs.dto';
import { CreateProviderDto, TestProviderDto, UpdateProviderDto } from './dto/email-provider.dto';
import { ToggleKillSwitchDto } from './dto/email-kill-switch.dto';
import { AddSuppressionDto, ListSuppressionsQueryDto } from './dto/email-suppression.dto';
import { UpdateTemplateDto } from './dto/email-template.dto';

/**
 * Admin mail trafiği yönetim endpoint'leri.
 * WORKER rolü için email izni daha sonra WorkerPermission'lara eklenebilir.
 */
@Controller('admin/email')
@ApiTags('admin/email')
@ApiBearerAuth('bearer')
export class AdminEmailController {
  constructor(
    @Inject(GetEmailTrafficMetricsUseCase) private readonly metricsUC: GetEmailTrafficMetricsUseCase,
    @Inject(ListEmailLogsUseCase) private readonly listLogsUC: ListEmailLogsUseCase,
    @Inject(GetEmailLogDetailUseCase) private readonly getLogUC: GetEmailLogDetailUseCase,
    @Inject(RetryFailedEmailUseCase) private readonly retryUC: RetryFailedEmailUseCase,
    @Inject(ManageProviderConfigUseCase) private readonly providerUC: ManageProviderConfigUseCase,
    @Inject(TestProviderConfigUseCase) private readonly testProviderUC: TestProviderConfigUseCase,
    @Inject(ToggleEmailKillSwitchUseCase) private readonly killSwitchUC: ToggleEmailKillSwitchUseCase,
    @Inject(ManageSuppressedEmailUseCase) private readonly suppressionUC: ManageSuppressedEmailUseCase,
    @Inject(ManageEmailTemplateUseCase) private readonly templateUC: ManageEmailTemplateUseCase,
  ) {}

  private tenantId(): string {
    return getDefaultTenantId();
  }

  // ── Dashboard ─────────────────────────────────────────────────────────
  @Get('dashboard')
  @Roles('ADMIN')
  async dashboard() {
    return this.metricsUC.execute({ tenantId: this.tenantId() });
  }

  // ── Logs ──────────────────────────────────────────────────────────────
  @Get('logs')
  @Roles('ADMIN')
  async listLogs(@Query() q: ListEmailLogsQueryDto) {
    return this.listLogsUC.execute({
      tenantId: this.tenantId(),
      cursor:
        q.cursorId && q.cursorQueuedAt
          ? { id: q.cursorId, queuedAt: q.cursorQueuedAt }
          : undefined,
      limit: q.limit,
      filter: {
        queue: q.queue,
        status: q.status,
        recipientRole: q.recipientRole,
        templateKey: q.templateKey,
        emailSearch: q.emailSearch,
        from: q.from,
        to: q.to,
      },
    });
  }

  @Get('logs/:id')
  @Roles('ADMIN')
  async getLog(@Param('id') id: string) {
    try {
      return await this.getLogUC.execute({ tenantId: this.tenantId(), id });
    } catch (err: any) {
      throw new HttpException(err.message || 'Not found', err.status ?? HttpStatus.NOT_FOUND);
    }
  }

  @Post('logs/:id/retry')
  @Roles('ADMIN')
  @HttpCode(200)
  async retry(@Param('id') id: string, @Req() req: any) {
    try {
      return await this.retryUC.execute({
        tenantId: this.tenantId(),
        emailLogId: id,
        actorId: req.user?.sub,
      });
    } catch (err: any) {
      throw new HttpException(err.message || 'Retry failed', err.status ?? HttpStatus.BAD_REQUEST);
    }
  }

  // ── Providers ─────────────────────────────────────────────────────────
  @Get('providers')
  @Roles('ADMIN')
  async listProviders() {
    return this.providerUC.list(this.tenantId());
  }

  @Post('providers')
  @Roles('ADMIN')
  async createProvider(@Body() body: CreateProviderDto, @Req() req: any) {
    try {
      return await this.providerUC.create({
        tenantId: this.tenantId(),
        actorId: req.user?.sub,
        ...body,
      });
    } catch (err: any) {
      throw new HttpException(err.message || 'Bad request', err.status ?? HttpStatus.BAD_REQUEST);
    }
  }

  @Patch('providers/:id')
  @Roles('ADMIN')
  async updateProvider(@Param('id') id: string, @Body() body: UpdateProviderDto, @Req() req: any) {
    try {
      return await this.providerUC.update({
        tenantId: this.tenantId(),
        actorId: req.user?.sub,
        id,
        ...body,
      });
    } catch (err: any) {
      throw new HttpException(err.message || 'Bad request', err.status ?? HttpStatus.BAD_REQUEST);
    }
  }

  @Delete('providers/:id')
  @Roles('ADMIN')
  async deleteProvider(@Param('id') id: string, @Req() req: any) {
    try {
      return await this.providerUC.delete({
        tenantId: this.tenantId(),
        actorId: req.user?.sub,
        id,
      });
    } catch (err: any) {
      throw new HttpException(err.message || 'Bad request', err.status ?? HttpStatus.NOT_FOUND);
    }
  }

  @Post('providers/:id/test')
  @Roles('ADMIN')
  @HttpCode(200)
  async testProvider(@Param('id') id: string, @Body() body: TestProviderDto, @Req() req: any) {
    try {
      return await this.testProviderUC.execute({
        tenantId: this.tenantId(),
        actorId: req.user?.sub,
        providerConfigId: id,
        toEmail: body.toEmail,
        subject: body.subject,
      });
    } catch (err: any) {
      throw new HttpException(err.message || 'Bad request', err.status ?? HttpStatus.BAD_REQUEST);
    }
  }

  // ── Kill switches ─────────────────────────────────────────────────────
  @Get('kill-switches')
  @Roles('ADMIN')
  async getKillSwitches() {
    // Email modülüne özel AdminSettings alanlarını döndürür — kullanıcının paralel
    // GetAdminSettingsUseCase'ini değiştirmeden kendi okuma yolumuz.
    const { prisma } = await import('../../infrastructure/database/prisma');
    const row = await prisma.adminSettings.findFirst({ where: { id: 1 } });
    if (!row) return {};
    return {
      emailEnabled: row.emailEnabled,
      emailEducatorCriticalEnabled: row.emailEducatorCriticalEnabled,
      emailEducatorNotifyEnabled: row.emailEducatorNotifyEnabled,
      emailEducatorBulkEnabled: row.emailEducatorBulkEnabled,
      emailCandidateCriticalEnabled: row.emailCandidateCriticalEnabled,
      emailCandidateNotifyEnabled: row.emailCandidateNotifyEnabled,
      emailCandidateBulkEnabled: row.emailCandidateBulkEnabled,
      emailStaffCriticalEnabled: row.emailStaffCriticalEnabled,
      emailStaffNotifyEnabled: row.emailStaffNotifyEnabled,
      emailDailyCapPerUser: row.emailDailyCapPerUser,
      emailBounceRateAlertThreshold: row.emailBounceRateAlertThreshold,
      emailRetentionDays: row.emailRetentionDays,
      emailBulkAutoPausedAt: row.emailBulkAutoPausedAt,
      emailBulkAutoPausedReason: row.emailBulkAutoPausedReason,
      emailSendWindowEnabled: row.emailSendWindowEnabled,
      emailSendWindowStartHour: row.emailSendWindowStartHour,
      emailSendWindowEndHour: row.emailSendWindowEndHour,
      emailSendWindowTimezone: row.emailSendWindowTimezone,
      emailSendWindowAppliesToCritical: row.emailSendWindowAppliesToCritical,
    };
  }

  @Patch('kill-switches')
  @Roles('ADMIN')
  async toggleKillSwitch(@Body() body: ToggleKillSwitchDto, @Req() req: any) {
    try {
      const { reason, clearAutoPause, sendWindow, ...changes } = body;
      return await this.killSwitchUC.execute({
        actorId: req.user?.sub,
        changes: changes as any,
        reason,
        clearAutoPause,
        sendWindow,
      });
    } catch (err: any) {
      throw new HttpException(err.message || 'Bad request', err.status ?? HttpStatus.BAD_REQUEST);
    }
  }

  // ── Suppressions ──────────────────────────────────────────────────────
  @Get('suppressions')
  @Roles('ADMIN')
  async listSuppressions(@Query() q: ListSuppressionsQueryDto) {
    return this.suppressionUC.list({
      tenantId: this.tenantId(),
      cursor: q.cursor ? { id: q.cursor } : undefined,
      limit: q.limit,
      search: q.search,
    });
  }

  @Post('suppressions')
  @Roles('ADMIN')
  async addSuppression(@Body() body: AddSuppressionDto, @Req() req: any) {
    return this.suppressionUC.add({
      tenantId: this.tenantId(),
      actorId: req.user?.sub,
      ...body,
    });
  }

  @Delete('suppressions/:id')
  @Roles('ADMIN')
  async deleteSuppression(@Param('id') id: string, @Req() req: any) {
    try {
      return await this.suppressionUC.remove({
        tenantId: this.tenantId(),
        actorId: req.user?.sub,
        id,
      });
    } catch (err: any) {
      throw new HttpException(err.message || 'Bad request', err.status ?? HttpStatus.NOT_FOUND);
    }
  }

  // ── Templates ─────────────────────────────────────────────────────────
  @Get('templates')
  @Roles('ADMIN')
  async listTemplates() {
    return this.templateUC.list(this.tenantId());
  }

  @Patch('templates/:id')
  @Roles('ADMIN')
  async updateTemplate(@Param('id') id: string, @Body() body: UpdateTemplateDto, @Req() req: any) {
    try {
      return await this.templateUC.update({
        tenantId: this.tenantId(),
        actorId: req.user?.sub,
        id,
        ...body,
      });
    } catch (err: any) {
      throw new HttpException(err.message || 'Bad request', err.status ?? HttpStatus.BAD_REQUEST);
    }
  }
}
