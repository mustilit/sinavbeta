import { IsString, IsOptional, IsInt, Min, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Yazılı soru oluşturma. ŞIK YOK.
 * content VEYA mediaUrl zorunlu; solutionText VEYA solutionMediaUrl zorunlu.
 * Zorunluluk use-case katmanında enforce edilir (schema'da nullable — draft esnekliği).
 */
export class CreateWrittenQuestionDto {
  @ApiPropertyOptional({ description: 'Soru metni (content veya mediaUrl zorunlu)' })
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

  @ApiPropertyOptional({ description: 'Çözüm metni (solutionText veya solutionMediaUrl zorunlu)' })
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
