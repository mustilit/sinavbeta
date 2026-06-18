import { IsString, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class PurchaseWrittenDto {
  @ApiPropertyOptional({ description: 'İndirim kodu' })
  @IsOptional()
  @IsString()
  discountCode?: string;

  @ApiPropertyOptional({ description: 'Onaylanan mesafeli satış sözleşmesi ID' })
  @IsOptional()
  @IsString()
  acceptedDistanceSaleContractId?: string;

  @ApiPropertyOptional({ description: 'Ödeme sağlayıcı' })
  @IsOptional()
  @IsString()
  paymentProvider?: string;
}
