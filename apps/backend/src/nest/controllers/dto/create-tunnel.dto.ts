import { IsString, IsUUID, IsOptional, IsInt, Min, MinLength, MaxLength } from 'class-validator';
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

  @ApiProperty({ description: 'Konu UUID' })
  @IsUUID()
  topicId!: string;

  @ApiPropertyOptional({ description: 'Fiyat (kuruş)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  priceCents?: number;
}
