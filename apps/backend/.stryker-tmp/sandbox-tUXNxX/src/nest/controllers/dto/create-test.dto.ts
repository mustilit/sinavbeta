/** Test paketi oluşturma isteği DTO'su — sorular dahil tam test tanımı */
// @ts-nocheck

import { IsString, IsOptional, IsBoolean, IsNumber, IsUUID, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTestDto {
  @ApiProperty()
  @IsString()
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isTimed?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  duration?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  price?: number;

  @ApiPropertyOptional({ format: 'uuid', description: 'Exam type ID' })
  @IsOptional()
  @IsUUID()
  examTypeId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Topic ID (must belong to examTypeId)' })
  @IsOptional()
  @IsUUID()
  topicId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  questions?: any[];
}
