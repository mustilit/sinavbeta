import { IsString, IsOptional, IsInt, Min, Max, MinLength, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Aday tünel değerlendirmesi (puan + yorum). */
export class UpsertTunnelReviewDto {
  @ApiProperty({ description: 'Puan 1-5', minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @ApiPropertyOptional({ description: 'Yorum' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}

/** Aday tünel sorusu hata bildirimi. */
export class ReportTunnelQuestionDto {
  @ApiPropertyOptional({ description: 'İlgili soru id (opsiyonel)' })
  @IsOptional()
  @IsString()
  questionId?: string;

  @ApiProperty({ description: 'Bildirim metni', minLength: 1, maxLength: 1000 })
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  reason!: string;
}
