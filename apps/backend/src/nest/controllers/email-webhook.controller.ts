import { Body, Controller, Get, HttpCode, HttpException, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../decorators/public.decorator';
import { getDefaultTenantId } from '../../common/tenant';
import { HandleEmailWebhookUseCase } from '../../application/use-cases/email/HandleEmailWebhookUseCase';
import { UnsubscribeViaTokenUseCase } from '../../application/use-cases/email/UnsubscribeViaTokenUseCase';
import type { EmailPreferences } from '../../application/services/email/preferenceMap';

/**
 * Public endpoint'ler:
 * - POST /webhooks/email/brevo : Brevo bounce/delivered/spam webhook'ları
 * - GET  /unsubscribe          : Mail footer one-click unsubscribe
 */
@Controller()
@ApiTags('email-webhook')
export class EmailWebhookController {
  constructor(
    private readonly webhookUC: HandleEmailWebhookUseCase,
    private readonly unsubUC: UnsubscribeViaTokenUseCase,
  ) {}

  @Post('webhooks/email/brevo')
  @Public()
  @HttpCode(200)
  async brevo(@Query('secret') secret: string, @Body() payload: unknown) {
    if (!secret || typeof secret !== 'string') {
      throw new HttpException({ error: 'secret query required' }, HttpStatus.UNAUTHORIZED);
    }
    try {
      return await this.webhookUC.execute({
        tenantId: getDefaultTenantId(),
        secret,
        payload: payload as any,
      });
    } catch (err: any) {
      throw new HttpException({ error: err.message }, err.status ?? HttpStatus.UNAUTHORIZED);
    }
  }

  @Get('unsubscribe')
  @Public()
  async unsubscribe(
    @Query('token') token: string,
    @Query('category') category?: string,
  ) {
    if (!token) {
      throw new HttpException({ error: 'token gerekli' }, HttpStatus.BAD_REQUEST);
    }
    try {
      const result = await this.unsubUC.execute({
        token,
        category: (category as keyof EmailPreferences | 'all' | undefined) ?? 'all',
      });
      return result;
    } catch (err: any) {
      throw new HttpException({ error: err.message }, err.status ?? HttpStatus.BAD_REQUEST);
    }
  }
}
