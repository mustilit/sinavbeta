/** Admin uygulama ayarları güncelleme DTO'su — özellik bayrakları */
import { IsOptional, IsInt, Min, Max, IsBoolean, IsPositive, IsString } from 'class-validator';
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

  @ApiPropertyOptional({ description: '2FA sistem geneli aç/kapat — kapalıyken hiçbir kullanıcı 2FA aktif edemez' })
  @IsOptional()
  @IsBoolean()
  twoFactorSystemEnabled?: boolean;

  @ApiPropertyOptional({ example: 100, description: 'Minimum paket fiyatı (kuruş, ör. 100 = 1 ₺)' })
  @IsOptional()
  @IsInt()
  @IsPositive()
  minPackagePriceCents?: number;

  @ApiPropertyOptional({ example: 0, description: 'Minimum tünel fiyatı (kuruş; 0 = ücretsiz serbest)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  minTunnelPriceCents?: number;

  @ApiPropertyOptional({ example: 50, description: 'Eğiticinin tanımlayabileceği maksimum indirim oranı (1-100)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  maxDiscountPercent?: number;

  @ApiPropertyOptional({ example: '123456-abcdef.apps.googleusercontent.com', description: 'Google OAuth 2.0 Client ID — boş bırakılırsa Google ile giriş devre dışı' })
  @IsOptional()
  @IsString()
  googleClientId?: string | null;

  @ApiPropertyOptional({ example: '0x4AAAAAAA...', description: 'Cloudflare Turnstile site key (public). Boşsa CAPTCHA devre dışı.' })
  @IsOptional()
  @IsString()
  turnstileSiteKey?: string | null;

  @ApiPropertyOptional({ example: '0x4AAAAAAA...', description: 'Cloudflare Turnstile secret key (backend-only). Boşsa CAPTCHA atlanır.' })
  @IsOptional()
  @IsString()
  turnstileSecretKey?: string | null;

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

  @ApiPropertyOptional({ example: 10, description: 'Yazılı paket başına maksimum yazılı test' })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxWrittenTestsPerPackage?: number;

  @ApiPropertyOptional({ example: 1, description: 'Yazılı test başına minimum soru' })
  @IsOptional()
  @IsInt()
  @Min(1)
  minQuestionsPerWrittenTest?: number;

  @ApiPropertyOptional({ example: 50, description: 'Yazılı test başına maksimum soru' })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxQuestionsPerWrittenTest?: number;

  @ApiPropertyOptional({ example: 50, description: 'Canlı oturum başına maksimum soru sayısı' })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxLiveQuestions?: number;

  // ── Tünel limitleri ──
  @ApiPropertyOptional({ example: 7, description: 'Tünel başına katman sayısı' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  maxLayersPerTunnel?: number;

  @ApiPropertyOptional({ example: 10, description: 'Katman başına minimum soru' })
  @IsOptional()
  @IsInt()
  @Min(1)
  minQuestionsPerLayer?: number;

  @ApiPropertyOptional({ example: 50, description: 'Katman başına maksimum soru' })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxQuestionsPerLayer?: number;

  @ApiPropertyOptional({ example: 10, description: 'Üst katmanı açmak için üst üste doğru sayısı' })
  @IsOptional()
  @IsInt()
  @Min(1)
  tunnelAdvanceStreak?: number;

  @ApiPropertyOptional({ example: 10, description: 'Tünel sorusu başına seçenek sayısı' })
  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(20)
  tunnelOptionsPerQuestion?: number;
}
