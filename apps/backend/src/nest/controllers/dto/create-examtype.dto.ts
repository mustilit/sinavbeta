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

  /** Sınav türü logosu/ikonu (yüklenen görselin URL'i). metadata.iconUrl olarak saklanır. */
  @IsOptional()
  @IsString()
  iconUrl?: string;
}
