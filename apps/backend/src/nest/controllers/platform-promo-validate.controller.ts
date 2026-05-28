import { Body, Controller, HttpCode, Inject, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { IsIn, IsInt, IsString, Min } from 'class-validator';
import { Roles } from '../decorators/roles.decorator';
import { ValidatePlatformPromoCodeUseCase } from '../../application/use-cases/platform-promo/ValidatePlatformPromoCodeUseCase';

/**
 * Sprint 15 #3 — Eğitici canlı test / reklam paketi satın almadan ÖNCE promo
 * kodunu doğrular. Sadece kontrol — usedCount atmaz, asıl uygulama:
 *   - LiveSession: `PayLiveSessionUseCase`
 *   - AdPurchase:  `PurchaseAdUseCase`
 */
export class ValidatePromoDto {
  @IsString()
  code!: string;

  @IsIn(['LIVE_SESSION', 'AD_PACKAGE'])
  scope!: 'LIVE_SESSION' | 'AD_PACKAGE';

  @IsInt()
  @Min(0)
  basePriceCents!: number;
}

@ApiTags('Platform Promo Codes')
@Controller('platform-promo-codes')
export class PlatformPromoValidateController {
  constructor(
    @Inject(ValidatePlatformPromoCodeUseCase)
    private readonly validateUC: ValidatePlatformPromoCodeUseCase,
  ) {}

  @Post('validate')
  @Roles('EDUCATOR')
  @HttpCode(200)
  @ApiBearerAuth('bearer')
  @ApiOkResponse({
    description:
      'Promo kodu doğrulandı — { id, code, percentOff, discountCents, finalAmountCents, description }',
  })
  async validate(@Body() dto: ValidatePromoDto) {
    return this.validateUC.execute({
      code: dto.code,
      scope: dto.scope,
      basePriceCents: dto.basePriceCents,
    });
  }
}
