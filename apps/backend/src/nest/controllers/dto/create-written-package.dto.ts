import { IsString, IsOptional, IsInt, Min, MinLength, MaxLength, IsUrl, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Eğitici yazılı paket oluşturma. */
export class CreateWrittenPackageDto {
  @ApiProperty({ description: 'Paket başlığı', minLength: 1, maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({ description: 'Açıklama' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ description: 'Fiyat (kuruş, 0 = ücretsiz)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  priceCents?: number;

  @ApiPropertyOptional({ description: 'Zorluk seviyesi (easy/medium/hard)' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  difficulty?: string;

  @ApiPropertyOptional({ description: 'Sınav dili', enum: ['tr', 'en', 'de', 'fr', 'es', 'ar'] })
  @IsOptional()
  @IsString()
  @IsIn(['tr', 'en', 'de', 'fr', 'es', 'ar'])
  language?: string;

  @ApiPropertyOptional({ description: 'Sınav türü ID' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  examTypeId?: string;

  @ApiPropertyOptional({ description: 'Sınıf (GradeLevel) ID — boşsa Genel' })
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
