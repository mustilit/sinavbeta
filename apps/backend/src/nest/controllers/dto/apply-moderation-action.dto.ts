import {
  IsEnum,
  IsString,
  MinLength,
  MaxLength,
  IsOptional,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ModerationActionType } from '@prisma/client';

export class ApplyModerationActionDto {
  @IsEnum(ModerationActionType)
  actionType!: ModerationActionType;

  @IsString()
  @MinLength(20)
  @MaxLength(1000)
  reason!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  durationDays?: number;

  @IsOptional()
  @IsString()
  violationId?: string;
}
