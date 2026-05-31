/** Sınav türü güncelleme isteği DTO'su */
import { IsOptional, IsString, IsBoolean, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateExamTypeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  slug?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  /** Sınav türü logosu/ikonu (yüklenen görselin URL'i). metadata.iconUrl olarak saklanır. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  iconUrl?: string;
}
