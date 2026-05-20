/** Admin uygulama ayarları güncelleme DTO'su — özellik bayrakları */
// @ts-nocheck

import { IsOptional, IsInt, Min, Max, IsBoolean, IsPositive } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateAdminSettingsDto {
  @ApiPropertyOptional({ description: 'Komisyon yüzdesi (0-100)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  commissionPercent?: number;

  @ApiPropertyOptional({ description: 'KDV yüzdesi (0-100)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  vatPercent?: number;

  @ApiPropertyOptional({ description: 'Satın alma açık/kapalı' })
  @IsOptional()
  @IsBoolean()
  purchasesEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Paket/test oluşturma açık/kapalı' })
  @IsOptional()
  @IsBoolean()
  packageCreationEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Test yayınlama (canlı test) açık/kapalı' })
  @IsOptional()
  @IsBoolean()
  testPublishingEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Test çözüm başlatma açık/kapalı' })
  @IsOptional()
  @IsBoolean()
  testAttemptsEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Eğitici reklam satın alma açık/kapalı' })
  @IsOptional()
  @IsBoolean()
  adPurchasesEnabled?: boolean;

  @ApiPropertyOptional({ example: 100, description: 'Minimum paket fiyatı (kuruş, ör. 100 = 1 ₺)' })
  @IsOptional()
  @IsInt()
  @IsPositive()
  minPackagePriceCents?: number;

  @ApiPropertyOptional({ example: 1, description: 'Test başına minimum soru sayısı' })
  @IsOptional()
  @IsInt()
  @Min(1)
  minQuestionsPerTest?: number;

  @ApiPropertyOptional({ example: 100, description: 'Test başına maksimum soru sayısı' })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxQuestionsPerTest?: number;

  @ApiPropertyOptional({ example: 10, description: 'Paket başına maksimum test sayısı' })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxTestsPerPackage?: number;

  @ApiPropertyOptional({ example: 50, description: 'Canlı oturum başına maksimum soru sayısı' })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxLiveQuestions?: number;
}
