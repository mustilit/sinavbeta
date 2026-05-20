/** İndirim kodu oluşturma isteği DTO'su — maksimum indirim oranı %50 ile sınırlandırılmıştır */
// @ts-nocheck

import { IsString, IsNumber, IsOptional, IsDateString, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateDiscountCodeDto {
  @ApiProperty({ example: 'YAZ2025' })
  @IsString()
  code!: string;

  @ApiProperty({ minimum: 1, maximum: 50, example: 20 })
  @IsNumber()
  @Min(1)
  @Max(50)
  percentOff!: number;

  @ApiPropertyOptional({ description: 'Max uses (null = unlimited)' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  maxUses?: number;

  @ApiPropertyOptional({ description: 'Valid from (ISO date)' })
  @IsOptional()
  @IsDateString()
  validFrom?: string;

  @ApiPropertyOptional({ description: 'Valid until (ISO date)' })
  @IsOptional()
  @IsDateString()
  validUntil?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}
