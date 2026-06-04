/** Sınav türü oluşturma isteği DTO'su */
import { IsString, MinLength, IsOptional, IsBoolean } from 'class-validator';

export class CreateExamTypeDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  /** Sınav türü logosu — havuzdan seçilen lucide ikon key'i (metadata.icon). */
  @IsOptional()
  @IsString()
  icon?: string;

  /** (Geriye dönük) yüklenen logo URL'i — metadata.iconUrl. Yeni akış 'icon' kullanır. */
  @IsOptional()
  @IsString()
  iconUrl?: string;
}
