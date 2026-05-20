/** Eğitici profil sayfası sorgu parametreleri DTO'su — sayfalama ve filtreleme */
// @ts-nocheck

import { IsOptional, IsString, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export class EducatorPageQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  limit?: number;

  @IsOptional()
  @IsString()
  examTypeId?: string;

  @IsOptional()
  @IsString()
  sortBy?: 'NEWEST' | 'PRICE' | 'RATING' | 'POPULARITY';

  @IsOptional()
  @IsString()
  sortDir?: 'asc' | 'desc';
}
