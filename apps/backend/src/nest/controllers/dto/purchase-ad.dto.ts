/**
 * Reklam satın alma isteği DTO'su.
 * targetType = 'TEST'     → testId zorunlu; belirli paket öne çıkarılır.
 * targetType = 'EDUCATOR' → testId opsiyonel; eğiticinin kendisi öne çıkarılır.
 */
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

  /** WRITTEN türünde zorunlu — öne çıkarılacak yazılı paket */
  @ApiPropertyOptional({ format: 'uuid', description: 'Öne çıkarılacak yazılı paket (WRITTEN türünde zorunlu)' })
  @IsOptional()
  @IsString()
  @IsUUID()
  writtenPackageId?: string;

  /** Reklam hedef türü: TEST (test paketi) · WRITTEN (yazılı paket) · EDUCATOR (profil) */
  @ApiPropertyOptional({ enum: ['TEST', 'WRITTEN', 'EDUCATOR'], default: 'TEST' })
  @IsOptional()
  @IsIn(['TEST', 'WRITTEN', 'EDUCATOR'])
  targetType?: 'TEST' | 'WRITTEN' | 'EDUCATOR';
}
