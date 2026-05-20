/** Reklam paketi oluşturma isteği DTO'su */
// @ts-nocheck

import { IsString, IsNumber, IsOptional, IsBoolean, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateAdPackageDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty({ minimum: 1 })
  @IsNumber()
  @Min(1)
  durationDays!: number;

  @ApiProperty({ minimum: 1 })
  @IsNumber()
  @Min(1)
  impressions!: number;

  @ApiProperty({ minimum: 0 })
  @IsNumber()
  @Min(0)
  priceCents!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
