// @ts-nocheck
import { IsOptional, IsString, MinLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class EducatorRejectRefundDto {
  @ApiPropertyOptional({ description: 'Red gerekçesi (en az 5 karakter)' })
  @IsOptional()
  @IsString()
  @MinLength(5)
  reason?: string;
}
