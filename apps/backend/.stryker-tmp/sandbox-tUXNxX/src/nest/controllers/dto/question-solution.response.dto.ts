/** Soru çözümü yanıt DTO'su */
// @ts-nocheck

import { ApiProperty } from '@nestjs/swagger';

export class QuestionSolutionResponseDto {
  @ApiProperty() questionId!: string;
  @ApiProperty({ nullable: true }) solutionText?: string | null;
  @ApiProperty({ nullable: true }) solutionMediaUrl?: string | null;
}
