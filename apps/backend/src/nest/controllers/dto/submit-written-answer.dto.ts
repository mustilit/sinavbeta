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
}
