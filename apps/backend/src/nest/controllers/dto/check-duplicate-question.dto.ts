/** Kopya soru tespiti isteği — eğitici soru girerken (blur) çağrılır. */
import { IsString, IsOptional, MaxLength } from 'class-validator';

export class CheckDuplicateQuestionDto {
  @IsString()
  @MaxLength(5000)
  content!: string;

  /**
   * Düzenleme akışında karşılaştırma dışında tutulacak soru id'si (kendisiyle
   * eşleşmesin). Frontend null gönderebilir — @IsOptional null/undefined'ı atlar.
   */
  @IsOptional()
  @IsString()
  excludeQuestionId?: string | null;
}
