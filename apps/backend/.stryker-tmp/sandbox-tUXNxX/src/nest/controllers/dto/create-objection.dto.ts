/** Soru itirazı oluşturma isteği DTO'su — deneme ve soru UUID'si zorunludur */
// @ts-nocheck

import { IsString, IsUUID, MinLength, IsOptional, IsUrl } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateObjectionDto {
  @ApiProperty({ description: 'Attempt UUID' })
  @IsUUID()
  attemptId!: string;

  @ApiProperty({ description: 'Question UUID' })
  @IsUUID()
  questionId!: string;

  @ApiProperty({ description: 'Reason (min 5 characters)', minLength: 5 })
  @IsString()
  @MinLength(5, { message: 'Reason must be at least 5 characters' })
  reason!: string;

  @ApiPropertyOptional({ description: 'Optional attachment URL' })
  @IsOptional()
  @IsUrl()
  attachmentUrl?: string;
}
