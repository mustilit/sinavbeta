import { IsString, IsOptional, MinLength, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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
