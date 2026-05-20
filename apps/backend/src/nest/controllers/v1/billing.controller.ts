/**
 * BillingController — `/v1/billing/*` — Stripe abonelik akış endpoint'leri.
 *
 *   POST /v1/billing/checkout    → Stripe Checkout session URL'i üretir
 *   POST /v1/billing/portal      → Stripe Billing Portal linki üretir
 *   GET  /v1/billing/subscription → Mevcut aktif abonelik özeti
 *
 * Tüm endpoint'ler authenticated. Idempotency-Key header'ı POST'larda önerilir.
 */
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
  Query,
  Req,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { IdempotencyInterceptor } from '../../interceptors/idempotency.interceptor';
import { StartCheckoutUseCase } from '../../../application/use-cases/billing/StartCheckoutUseCase';
import { CreatePortalLinkUseCase } from '../../../application/use-cases/billing/CreatePortalLinkUseCase';
import { GetMySubscriptionUseCase } from '../../../application/use-cases/billing/GetMySubscriptionUseCase';
import { StartCheckoutDto, CreatePortalLinkDto } from '../dto/billing.dto';

@ApiTags('billing')
@ApiBearerAuth('bearer')
@Controller({ path: 'billing', version: '1' })
export class BillingController {
  constructor(
    private readonly startCheckout: StartCheckoutUseCase,
    private readonly createPortal: CreatePortalLinkUseCase,
    private readonly getMySubscription: GetMySubscriptionUseCase,
  ) {}

  @Post('checkout')
  @HttpCode(200)
  @UseInterceptors(IdempotencyInterceptor)
  @ApiBody({ type: StartCheckoutDto })
  @ApiOkResponse({ description: '{ url, sessionId } — frontend redirect yapar.' })
  @ApiUnauthorizedResponse({ description: 'Kimlik doğrulama gerekli.' })
  async checkout(@Body() dto: StartCheckoutDto, @Req() req: any) {
    const userId = req.user?.sub ?? req.user?.id;
    const tenantId = req.tenant?.id ?? req.user?.tenantId;
    if (!userId) throw new HttpException({ error: 'Unauthorized' }, HttpStatus.UNAUTHORIZED);
    if (!tenantId)
      throw new HttpException({ error: 'Tenant resolve edilemedi' }, HttpStatus.BAD_REQUEST);

    const idemKey =
      (typeof req.header === 'function' ? req.header('idempotency-key') : undefined) ??
      req.headers?.['idempotency-key'];

    return this.startCheckout.execute({
      userId,
      tenantId,
      kind: dto.kind as any,
      tier: dto.tier,
      period: dto.period,
      successUrl: dto.successUrl,
      cancelUrl: dto.cancelUrl,
      idempotencyKey: typeof idemKey === 'string' ? idemKey : undefined,
    });
  }

  @Post('portal')
  @HttpCode(200)
  @ApiBody({ type: CreatePortalLinkDto })
  @ApiOkResponse({ description: '{ url } — Stripe Billing Portal linki.' })
  @ApiUnauthorizedResponse({ description: 'Kimlik doğrulama gerekli.' })
  async portal(@Body() dto: CreatePortalLinkDto, @Req() req: any) {
    const userId = req.user?.sub ?? req.user?.id;
    const tenantId = req.tenant?.id ?? req.user?.tenantId;
    if (!userId) throw new HttpException({ error: 'Unauthorized' }, HttpStatus.UNAUTHORIZED);
    if (!tenantId)
      throw new HttpException({ error: 'Tenant resolve edilemedi' }, HttpStatus.BAD_REQUEST);

    return this.createPortal.execute({
      userId,
      tenantId,
      kind: dto.kind as any,
      returnUrl: dto.returnUrl,
    });
  }

  @Get('subscription')
  @ApiQuery({ name: 'kind', enum: ['EDUCATOR', 'TENANT'], required: false })
  @ApiOkResponse({ description: 'Aktif abonelik özeti veya FREE varsayılan.' })
  @ApiUnauthorizedResponse({ description: 'Kimlik doğrulama gerekli.' })
  async subscription(@Req() req: any, @Query('kind') kind?: string) {
    const userId = req.user?.sub ?? req.user?.id;
    const tenantId = req.tenant?.id ?? req.user?.tenantId;
    if (!userId) throw new HttpException({ error: 'Unauthorized' }, HttpStatus.UNAUTHORIZED);
    if (!tenantId)
      throw new HttpException({ error: 'Tenant resolve edilemedi' }, HttpStatus.BAD_REQUEST);

    const resolvedKind = (kind === 'TENANT' ? 'TENANT' : 'EDUCATOR') as any;
    return this.getMySubscription.execute({ userId, tenantId, kind: resolvedKind });
  }
}
