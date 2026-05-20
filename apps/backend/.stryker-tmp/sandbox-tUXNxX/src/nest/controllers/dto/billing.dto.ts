/**
 * Billing DTO'ları — POST /v1/billing/checkout, /portal için.
 *
 * class-validator zorunlu — main.ts'te `whitelist: true` ile fazla alanlar atılır.
 */
// @ts-nocheck

import { IsEnum, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class StartCheckoutDto {
  @ApiProperty({ enum: ['PRO', 'BUSINESS', 'ENTERPRISE'] })
  @IsEnum(['PRO', 'BUSINESS', 'ENTERPRISE'] as const)
  tier!: 'PRO' | 'BUSINESS' | 'ENTERPRISE';

  @ApiProperty({ enum: ['monthly', 'yearly'] })
  @IsEnum(['monthly', 'yearly'] as const)
  period!: 'monthly' | 'yearly';

  @ApiProperty({ enum: ['EDUCATOR', 'TENANT'] })
  @IsEnum(['EDUCATOR', 'TENANT'] as const)
  kind!: 'EDUCATOR' | 'TENANT';

  @ApiPropertyOptional({ description: 'Başarılı checkout sonrası dönülecek URL.' })
  @IsOptional()
  @IsString()
  @IsUrl({ require_protocol: true, require_tld: false })
  @MaxLength(500)
  successUrl?: string;

  @ApiPropertyOptional({ description: 'İptal durumunda dönülecek URL.' })
  @IsOptional()
  @IsString()
  @IsUrl({ require_protocol: true, require_tld: false })
  @MaxLength(500)
  cancelUrl?: string;
}

export class CreatePortalLinkDto {
  @ApiProperty({ enum: ['EDUCATOR', 'TENANT'] })
  @IsEnum(['EDUCATOR', 'TENANT'] as const)
  kind!: 'EDUCATOR' | 'TENANT';

  @ApiPropertyOptional({ description: 'Portal kapatınca dönülecek URL.' })
  @IsOptional()
  @IsString()
  @IsUrl({ require_protocol: true, require_tld: false })
  @MaxLength(500)
  returnUrl?: string;
}
