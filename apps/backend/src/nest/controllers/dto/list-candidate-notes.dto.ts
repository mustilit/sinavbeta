/** Notlarım liste query DTO'su — cursor + konu/test/sınav türü/metin filtreleri. */
import { IsString, IsOptional, IsInt, Min, Max, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ListCandidateNotesQueryDto {
  @ApiPropertyOptional({ description: 'Sayfa (1-tabanlı)', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ description: 'Sayfa boyutu (1-100)', default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @ApiPropertyOptional({ description: 'Konu filtresi' })
  @IsOptional()
  @IsString()
  topicId?: string;

  @ApiPropertyOptional({ description: 'Test filtresi' })
  @IsOptional()
  @IsString()
  testId?: string;

  @ApiPropertyOptional({ description: 'Sınav türü filtresi' })
  @IsOptional()
  @IsString()
  examTypeId?: string;

  @ApiPropertyOptional({ description: 'Modül-dışı içerik filtresi (tünel/yazılı id)' })
  @IsOptional()
  @IsString()
  contextId?: string;

  @ApiPropertyOptional({ description: 'Metin araması (not içeriği)' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ description: "Yalnızca serbest notlar için 'general'" })
  @IsOptional()
  @IsIn(['general'])
  scope?: 'general';
}
