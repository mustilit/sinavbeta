import { Body, Controller, HttpCode, Inject, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { IsInt, IsString, Min } from 'class-validator';
import { Roles } from '../decorators/roles.decorator';
import { ValidateDiscountCodeUseCase } from '../../application/use-cases/discount/ValidateDiscountCodeUseCase';

/**
 * Sprint 15 #2 — Aday paket satın almadan ÖNCE indirim kodunu doğrular.
 *
 * Aday "Uygula" butonuna basınca bu endpoint çağrılır; başarılıysa indirim
 * tutarı + son fiyat döner. Submit'te aynı kod Purchase.create body'sine
 * geçer ve gerçek `usedCount++` orada race-condition korumalı yapılır.
 *
 * NOT: Sadece **CANDIDATE** rolüne açık. Educator/admin'in test amaçlı çağrısı
 * için ayrı bir endpoint açılmaz — admin paneli kodu istatistikleriyle gösterir.
 */
export class ValidateDiscountDto {
  @IsString()
  code!: string;

  @IsString()
  packageId!: string;

  @IsInt()
  @Min(0)
  basePriceCents!: number;
}

@ApiTags('Discounts')
@Controller('discounts')
export class DiscountValidateController {
  constructor(
    @Inject(ValidateDiscountCodeUseCase)
    private readonly validateUC: ValidateDiscountCodeUseCase,
  ) {}

  @Post('validate')
  @Roles('CANDIDATE')
  @HttpCode(200)
  @ApiBearerAuth('bearer')
  @ApiOkResponse({
    description:
      'İndirim kodu doğrulandı — { code, percentOff, discountCents, finalAmountCents, description }',
  })
  async validate(@Body() dto: ValidateDiscountDto) {
    return this.validateUC.execute({
      code: dto.code,
      packageId: dto.packageId,
      basePriceCents: dto.basePriceCents,
    });
  }
}
