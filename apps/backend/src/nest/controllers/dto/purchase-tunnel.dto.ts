import { IsString, IsOptional, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class PurchaseTunnelDto {
  @ApiPropertyOptional({ description: 'İndirim kodu (opsiyonel)' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  discountCode?: string;

  @ApiPropertyOptional({ description: 'Ödeme sağlayıcısı (iyzico/google_pay/amazon_pay)' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  paymentProvider?: string;

  @ApiPropertyOptional({ description: 'Onaylanan mesafeli satış sözleşmesi ID' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  acceptedDistanceSaleContractId?: string;
}

/** Tünel indirim kodu önizleme doğrulaması. */
export class ValidateTunnelDiscountDto {
  @IsString()
  @MaxLength(64)
  code!: string;
}
