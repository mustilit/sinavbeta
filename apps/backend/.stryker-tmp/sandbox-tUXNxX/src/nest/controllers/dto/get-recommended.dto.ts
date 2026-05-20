/** Ana sayfa önerilen testler sorgu DTO'su — limit ve sınav türü filtresi */
// @ts-nocheck

import { IsOptional, IsInt, Min, Max, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class GetRecommendedDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 20;

  @IsOptional()
  @IsString()
  examTypeId?: string;
}
