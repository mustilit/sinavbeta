/** Sınıf (GradeLevel) güncelleme isteği DTO'su */
import { IsOptional, IsString, IsBoolean, MaxLength } from 'class-validator';

export class UpdateGradeLevelDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  slug?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsOptional()
  @IsString()
  iconUrl?: string;
}
