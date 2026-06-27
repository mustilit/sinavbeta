import { IsString, IsUUID, IsOptional, IsInt, Min, MaxLength, IsIn } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/** Wizard 1'e geri dönüş — tünel meta güncelleme (tümü opsiyonel). */
export class UpdateTunnelDto {
  @ApiPropertyOptional({ description: 'Tünel başlığı', maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ description: 'Açıklama' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ description: 'Sınav türü UUID' })
  @IsOptional()
  @IsUUID()
  examTypeId?: string;

  @ApiPropertyOptional({ description: 'Sınıf (GradeLevel) UUID' })
  @IsOptional()
  @IsUUID()
  gradeLevelId?: string;

  @ApiPropertyOptional({ description: 'Konu UUID' })
  @IsOptional()
  @IsUUID()
  topicId?: string;

  @ApiPropertyOptional({ description: 'Fiyat (kuruş)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  priceCents?: number;

  @ApiPropertyOptional({ description: 'Sınav dili', enum: ['tr', 'en', 'de', 'fr', 'es', 'ar'] })
  @IsOptional()
  @IsString()
  @IsIn(['tr', 'en', 'de', 'fr', 'es', 'ar'])
  language?: string;

  @ApiPropertyOptional({ description: 'Kapak görseli URL' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  coverImageUrl?: string;
}
