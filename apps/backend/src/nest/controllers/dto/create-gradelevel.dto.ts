/** Sınıf (GradeLevel) oluşturma isteği DTO'su */
import { IsString, MinLength, IsOptional, IsBoolean } from 'class-validator';

export class CreateGradeLevelDto {
  @IsString()
  @MinLength(1)
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

  /** Sınıf logosu — havuzdan seçilen lucide ikon key'i (metadata.icon). */
  @IsOptional()
  @IsString()
  icon?: string;

  /** (Geriye dönük) yüklenen logo URL'i — metadata.iconUrl. */
  @IsOptional()
  @IsString()
  iconUrl?: string;
}
