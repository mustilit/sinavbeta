import { IsString, IsOptional, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SubmitWrittenAnswerDto {
  @ApiProperty({ description: 'Soru ID' })
  @IsString()
  questionId!: string;

  @ApiPropertyOptional({ description: 'Metin cevap (boş → cevabı sil)' })
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  textAnswer?: string;

  @ApiPropertyOptional({ description: 'Kalem çizimi URL (/upload/image) — cevaba dahil' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  drawingUrl?: string;
}
