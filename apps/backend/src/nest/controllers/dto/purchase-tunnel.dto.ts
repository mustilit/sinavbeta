import { IsString, IsOptional, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class PurchaseTunnelDto {
  @ApiPropertyOptional({ description: 'İndirim kodu (opsiyonel)' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  discountCode?: string;
}
