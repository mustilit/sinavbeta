import { IsString, IsOptional, IsBoolean, IsInt, Min, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/** Yazılı test meta güncelleme. */
export class UpdateWrittenTestDto {
  @ApiPropertyOptional({ description: 'Test başlığı' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

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
