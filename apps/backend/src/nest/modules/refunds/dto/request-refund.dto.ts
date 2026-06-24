import { IsString, IsUUID, MinLength, IsOptional, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RequestRefundDto {
  @ApiProperty({ description: 'Purchase UUID (TEST: Purchase; TUNNEL: TunnelPurchase; WRITTEN: WrittenPurchase)' })
  @IsUUID()
  purchaseId!: string;

  @ApiPropertyOptional({ description: 'Kaynak modül: TEST (varsayılan) | TUNNEL | WRITTEN', enum: ['TEST', 'TUNNEL', 'WRITTEN'] })
  @IsOptional()
  @IsIn(['TEST', 'TUNNEL', 'WRITTEN'])
  source?: 'TEST' | 'TUNNEL' | 'WRITTEN';

  @ApiPropertyOptional({ description: 'Reason (min 5 characters if provided)' })
  @IsOptional()
  @IsString()
  @MinLength(5, { message: 'Reason must be at least 5 characters if provided' })
  reason?: string;

  @ApiPropertyOptional({ description: 'Açıklama (opsiyonel)' })
  @IsOptional()
  @IsString()
  description?: string;
}
