/** Soru güncelleme isteği DTO'su */
// @ts-nocheck

import { IsString, IsOptional, IsNumber } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateQuestionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  order?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  mediaUrl?: string | null;

  @ApiPropertyOptional({ description: 'Written solution text or video/meeting URL' })
  @IsOptional()
  @IsString()
  solutionText?: string | null;

  @ApiPropertyOptional({ description: 'Solution image URL' })
  @IsOptional()
  @IsString()
  solutionMediaUrl?: string | null;
}
