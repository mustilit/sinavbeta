import { IsString, IsOptional, IsInt, Min, MaxLength, IsIn } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/** Eğitici yazılı paket meta güncelleme (yayımlanmışken de serbest). */
export class UpdateWrittenPackageDto {
  @ApiPropertyOptional({ description: 'Paket başlığı' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ description: 'Açıklama' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ description: 'Fiyat (kuruş)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  priceCents?: number;

  @ApiPropertyOptional({ description: 'Zorluk seviyesi' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  difficulty?: string;

  @ApiPropertyOptional({ description: 'Sınav dili', enum: ['tr', 'en', 'de', 'fr', 'es', 'ar'] })
  @IsOptional()
  @IsString()
  @IsIn(['tr', 'en', 'de', 'fr', 'es', 'ar'])
  language?: string;

  @ApiPropertyOptional({ description: 'Sınıf (GradeLevel) ID' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  gradeLevelId?: string;

  @ApiPropertyOptional({ description: 'Kapak görseli URL' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  coverImageUrl?: string;
}
