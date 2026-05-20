import {
  IsString,
  IsEnum,
  IsOptional,
  IsInt,
  Min,
  Max,
  IsBoolean,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ModerationCategory } from '@prisma/client';

export class CreateBlockedTermDto {
  @IsString()
  @MinLength(1)
  term!: string;

  @IsOptional()
  @IsString()
  pattern?: string | null;

  @IsEnum(ModerationCategory)
  category!: ModerationCategory;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  severity?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
