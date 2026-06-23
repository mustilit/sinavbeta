/** Aday not oluşturma DTO'su — body zorunlu; soru/test/attempt bağlamı opsiyonel. */
import { IsString, IsUUID, IsOptional, IsInt, Min, MinLength, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCandidateNoteDto {
  @ApiProperty({ description: 'Not metni', minLength: 1, maxLength: 5000 })
  @IsString()
  @MinLength(1, { message: 'Not boş olamaz' })
  @MaxLength(5000, { message: 'Not en fazla 5000 karakter olabilir' })
  body!: string;

  @ApiPropertyOptional({ description: 'Soru UUID — soru-bağlı not için' })
  @IsOptional()
  @IsUUID()
  questionId?: string;

  @ApiPropertyOptional({ description: 'Test UUID — sadece test bağlamı için' })
  @IsOptional()
  @IsUUID()
  testId?: string;

  @ApiPropertyOptional({ description: 'Attempt UUID — bağlam işareti' })
  @IsOptional()
  @IsUUID()
  attemptId?: string;

  @ApiPropertyOptional({ description: 'Ekranda görünen soru numarası (1-tabanlı)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  questionOrder?: number;

  @ApiPropertyOptional({ description: 'Kaynak modül: TEST | TUNNEL | WRITTEN' })
  @IsOptional()
  @IsString()
  source?: string;

  @ApiPropertyOptional({ description: 'Modül-dışı içerik id (tunnelId / writtenTestId)' })
  @IsOptional()
  @IsUUID()
  contextId?: string;

  @ApiPropertyOptional({ description: 'Modül-dışı soru id (tunnel/written question)' })
  @IsOptional()
  @IsUUID()
  contextQuestionId?: string;
}
