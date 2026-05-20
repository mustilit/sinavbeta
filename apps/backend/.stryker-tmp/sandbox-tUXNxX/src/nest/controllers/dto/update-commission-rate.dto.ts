// @ts-nocheck
import { IsInt, Min, Max, IsOptional, IsString, IsDateString } from 'class-validator';

export class UpdateCommissionRateDto {
  @IsInt()
  @Min(0)
  @Max(100)
  commissionPercent!: number;

  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  @IsOptional()
  @IsString()
  note?: string;
}
