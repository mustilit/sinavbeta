import { IsString, IsOptional, IsBoolean, IsInt, Min, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Paket içi yazılı test oluşturma. */
export class CreateWrittenTestDto {
  @ApiProperty({ description: 'Test başlığı', minLength: 1, maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({ description: 'Süre sınırlı mı?' })
  @IsOptional()
  @IsBoolean()
  isTimed?: boolean;

  @ApiPropertyOptional({ description: 'Süre (dakika)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  duration?: number;

  @ApiPropertyOptional({ description: 'Sınav türü ID' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  examTypeId?: string;

  @ApiPropertyOptional({ description: 'Konu ID' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  topicId?: string;
}
