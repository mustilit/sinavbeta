import { IsString, IsInt, IsOptional, MinLength, Min, IsIn } from 'class-validator';
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

  @ApiPropertyOptional({ example: 'tr', description: 'Sınav dili', enum: ['tr', 'en', 'de', 'fr', 'es', 'ar'] })
  @IsOptional()
  @IsString()
  @IsIn(['tr', 'en', 'de', 'fr', 'es', 'ar'])
  language?: string;

  @ApiPropertyOptional({ description: 'Paket kapak görseli URL — null gönderilirse mevcut görsel silinir' })
  @IsOptional()
  @IsString()
  coverImageUrl?: string | null;
}
