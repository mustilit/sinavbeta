import {
  IsOptional,
  IsString,
  IsInt,
  Min,
  Max,
  IsEnum,
  IsISO8601,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { EducatorRiskLevel } from '@prisma/client';

export class ListRiskyEducatorsQueryDto {
  @IsOptional()
  @IsString()
  cursorUserId?: string;

  @IsOptional()
  @IsString()
  cursorScore?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  /** ?riskLevel=HIGH&riskLevel=CRITICAL — çoklu değer destekler */
  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
  @IsEnum(EducatorRiskLevel, { each: true })
  riskLevel?: EducatorRiskLevel[];

  @IsOptional()
  @IsISO8601()
  dateFrom?: string;

  @IsOptional()
  @IsISO8601()
  dateTo?: string;
}
