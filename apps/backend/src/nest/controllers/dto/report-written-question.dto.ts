import { IsString, IsOptional, MinLength, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ReportWrittenQuestionDto {
  @ApiPropertyOptional({ description: 'Soru ID (opsiyonel)' })
  @IsOptional()
  @IsString()
  questionId?: string;

  @ApiProperty({ description: 'Hata açıklaması' })
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  reason!: string;
}
