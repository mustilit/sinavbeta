// @ts-nocheck
import { IsString, IsUUID, MinLength, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RequestRefundDto {
  @ApiProperty({ description: 'Purchase UUID' })
  @IsUUID()
  purchaseId!: string;

  @ApiPropertyOptional({ description: 'Reason (min 5 characters if provided)' })
  @IsOptional()
  @IsString()
  @MinLength(5, { message: 'Reason must be at least 5 characters if provided' })
  reason?: string;
}
