/** Sınav türü oluşturma isteği DTO'su */
// @ts-nocheck

import { IsString, MinLength, IsOptional, IsBoolean } from 'class-validator';

export class CreateExamTypeDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
