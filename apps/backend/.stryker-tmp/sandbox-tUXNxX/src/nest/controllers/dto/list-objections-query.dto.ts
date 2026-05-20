/** İtiraz listeleme sorgu parametreleri DTO'su */
// @ts-nocheck

import { IsOptional, IsISO8601 } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ListObjectionsQueryDto {
  @ApiPropertyOptional({ description: 'Filter by status (e.g. ESCALATED)' })
  @IsOptional()
  status?: string;

  @ApiPropertyOptional({ description: 'From date (ISO 8601)' })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({ description: 'To date (ISO 8601)' })
  @IsOptional()
  @IsISO8601()
  to?: string;
}
