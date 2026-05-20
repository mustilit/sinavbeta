// @ts-nocheck
import { Controller, Get, Query, Patch, Body, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiOkResponse } from '@nestjs/swagger';
import { ApiErrorResponses } from '../swagger/decorators';
import { UnsubscribeResponseDto } from './dto/unsubscribe.response.dto';
import { Public } from '../decorators/public.decorator';
import { UnsubscribeEmailUseCase } from '../../application/use-cases/notification/UnsubscribeEmailUseCase';
import { PrismaNotificationPreferenceRepository } from '../../infrastructure/repositories/PrismaNotificationPreferenceRepository';
import { PrismaAuditLogRepository } from '../../infrastructure/repositories/PrismaAuditLogRepository';
import { UpdateNotificationPreferencesUseCase } from '../../application/use-cases/notification/UpdateNotificationPreferencesUseCase';
import { Roles } from '../decorators/roles.decorator';
import { Request } from 'express';

/**
 * Bildirim tercihlerini ve e-posta aboneliğini yönetir.
 * /unsubscribe endpoint'i e-posta bağlantısı üzerinden geldiğinden herkese açıktır (@Public).
 */
@Controller('notifications')
@ApiTags('Notifications')
export class NotificationsController {
  private readonly useCase: UnsubscribeEmailUseCase;
  constructor() {
    // Tam DI karmaşıklığını önlemek için hafif manuel bağlama
    this.useCase = new UnsubscribeEmailUseCase(new PrismaNotificationPreferenceRepository(), new PrismaAuditLogRepository());
  }

  @Public()
  @Get('unsubscribe')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOkResponse({ type: UnsubscribeResponseDto })
  @ApiErrorResponses()
  async unsubscribe(@Query('token') token: string) {
    if (!token) return { ok: false };
    const ok = await this.useCase.execute(token);
    return { ok };
  }

  @Patch()
  @Roles('CANDIDATE')
  async updatePreferences(@Body() body: { emailEnabled?: boolean; weeklyDigestEnabled?: boolean; inactiveReminderEnabled?: boolean }, @Req() req: Request) {
    const userId = (req as any).user?.id;
    if (!userId) return { ok: false };
    const repo = new PrismaNotificationPreferenceRepository();
    const uc = new UpdateNotificationPreferencesUseCase(repo);
    const res = await uc.execute(userId, body);
    return { ok: true, pref: res };
  }
}

