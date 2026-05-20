import { SuppressionReason } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEmail, IsEnum, IsInt, IsISO8601, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class ListSuppressionsQueryDto {
  @IsOptional() @IsString()
  cursor?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit?: number;

  @IsOptional() @IsString() @MaxLength(255)
  search?: string;
}

export class AddSuppressionDto {
  @IsEmail()
  email!: string;

  @IsEnum(SuppressionReason)
  reason!: SuppressionReason;

  @IsOptional() @IsString() @MaxLength(500)
  note?: string;

  @IsOptional() @IsISO8601()
  expiresAt?: string;
}
