import { IsString, IsOptional, IsInt, Min, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/** Yazılı soru güncelleme. ŞIK YOK. */
export class UpdateWrittenQuestionDto {
  @ApiPropertyOptional({ description: 'Soru metni' })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  content?: string;

  @ApiPropertyOptional({ description: 'Soru medya URL' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  mediaUrl?: string;

  @ApiPropertyOptional({ description: 'Sıralama' })
  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;

  @ApiPropertyOptional({ description: 'Çözüm metni' })
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  solutionText?: string;

  @ApiPropertyOptional({ description: 'Çözüm medya URL' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  solutionMediaUrl?: string;
}
