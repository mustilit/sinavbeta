// @ts-nocheck
import { IsString, IsInt, IsOptional, MinLength, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdatePackageDto {
  @ApiPropertyOptional({ example: 'KPSS 2025 Paketi', description: 'Yeni paket başlığı' })
  @IsOptional()
  @IsString()
  @MinLength(3)
  title?: string;

  @ApiPropertyOptional({ example: 'Güncellenmiş açıklama' })
  @IsOptional()
  @IsString()
  description?: string | null;

  @ApiPropertyOptional({ example: 4500, description: 'Yeni fiyat (kuruş cinsinden)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  priceCents?: number;
}
