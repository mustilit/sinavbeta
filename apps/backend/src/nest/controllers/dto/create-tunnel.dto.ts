import { IsString, IsUUID, IsOptional, IsInt, Min, MinLength, MaxLength, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Wizard 1 — tünel oluşturma (sınav türü + konu + başlık). */
export class CreateTunnelDto {
  @ApiProperty({ description: 'Tünel başlığı', minLength: 1, maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({ description: 'Açıklama' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({ description: 'Sınav türü UUID' })
  @IsUUID()
  examTypeId!: string;

  @ApiPropertyOptional({ description: 'Sınıf (GradeLevel) UUID — boşsa Genel' })
  @IsOptional()
  @IsUUID()
  gradeLevelId?: string;

  @ApiProperty({ description: 'Konu UUID' })
  @IsUUID()
  topicId!: string;

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
