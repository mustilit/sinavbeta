// @ts-nocheck
import { IsString, MinLength, IsOptional, IsBoolean, IsUUID, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTopicDto {
  @ApiProperty({ example: 'Matematik' })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiPropertyOptional({ type: [String], description: 'Sınav türü UUID listesi' })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  examTypeIds?: string[];

  @ApiPropertyOptional({ description: 'Üst konu UUID (ağaç yapısı için)' })
  @IsOptional()
  @IsUUID()
  parentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
