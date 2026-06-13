/** Aday not güncelleme DTO'su — yalnızca metin değişir, adresleme sabit. */
import { IsString, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateCandidateNoteDto {
  @ApiProperty({ description: 'Yeni not metni', minLength: 1, maxLength: 5000 })
  @IsString()
  @MinLength(1, { message: 'Not boş olamaz' })
  @MaxLength(5000, { message: 'Not en fazla 5000 karakter olabilir' })
  body!: string;
}
