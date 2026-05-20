/**
 * Reklam satın alma isteği DTO'su.
 * targetType = 'TEST'     → testId zorunlu; belirli paket öne çıkarılır.
 * targetType = 'EDUCATOR' → testId opsiyonel; eğiticinin kendisi öne çıkarılır.
 */
// @ts-nocheck

import { IsString, IsUUID, IsOptional, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PurchaseAdDto {
  @ApiProperty({ format: 'uuid', description: 'Satın alınacak reklam paketi' })
  @IsString()
  @IsUUID()
  adPackageId!: string;

  /** TEST türünde zorunlu; EDUCATOR türünde göndermek gerekmez */
  @ApiPropertyOptional({ format: 'uuid', description: 'Öne çıkarılacak test paketi (TEST türünde zorunlu)' })
  @IsOptional()
  @IsString()
  @IsUUID()
  testId?: string;

  /** Reklam hedef türü: TEST (paket öne çıkarma) veya EDUCATOR (profil öne çıkarma) */
  @ApiPropertyOptional({ enum: ['TEST', 'EDUCATOR'], default: 'TEST' })
  @IsOptional()
  @IsIn(['TEST', 'EDUCATOR'])
  targetType?: 'TEST' | 'EDUCATOR';
}
