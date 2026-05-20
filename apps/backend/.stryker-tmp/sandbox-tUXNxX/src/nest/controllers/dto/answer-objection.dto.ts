/** İtiraz yanıtlama isteği DTO'su — yanıt metni en az 5 karakter olmalıdır */
// @ts-nocheck

import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AnswerObjectionDto {
  @ApiProperty({ description: 'Answer text (min 5 characters)', minLength: 5 })
  @IsString()
  @MinLength(5, { message: 'Answer must be at least 5 characters' })
  answerText!: string;
}
