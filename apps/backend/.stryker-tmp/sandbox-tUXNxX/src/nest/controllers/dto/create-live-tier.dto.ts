// @ts-nocheck
import { IsString, IsNotEmpty, IsOptional, IsInt, IsBoolean, Min } from 'class-validator';

export class CreateLiveTierDto {
  @IsString()
  @IsNotEmpty()
  label!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  minParticipants?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxParticipants?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  priceCents?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}
