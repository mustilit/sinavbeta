import { IsString, IsInt, IsOptional, MinLength, Min, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePackageDto {
  @ApiProperty({ example: 'KPSS Hazırlık Paketi', description: 'Paket başlığı' })
  @IsString()
  @MinLength(3)
  title!: string;

  @ApiPropertyOptional({ example: 'Bu paket KPSS sınavına hazırlık testleri içerir.' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 5000, description: 'Fiyat (kuruş cinsinden)' })
  @IsInt()
  @Min(0)
  priceCents!: number;

  @ApiPropertyOptional({ example: 'medium', enum: ['easy', 'medium', 'hard'] })
  @IsOptional()
  @IsString()
  @IsIn(['easy', 'medium', 'hard'])
  difficulty?: string;

  @ApiPropertyOptional({ example: 'tr', description: 'Sınav dili (soruların hazırlandığı dil)', enum: ['tr', 'en', 'de', 'fr', 'es', 'ar'] })
  @IsOptional()
  @IsString()
  @IsIn(['tr', 'en', 'de', 'fr', 'es', 'ar'])
  language?: string;

  @ApiPropertyOptional({ description: 'Paket kapak görseli URL (yükleme sonrası /uploads/... döner)' })
  @IsOptional()
  @IsString()
  coverImageUrl?: string | null;
}
