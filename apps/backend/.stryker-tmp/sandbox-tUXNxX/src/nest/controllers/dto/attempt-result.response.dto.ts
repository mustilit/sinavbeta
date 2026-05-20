/** Test denemesi sonuç yanıtı DTO'su — tamamlanmış deneme bilgilerini içerir */
// @ts-nocheck

import { ApiProperty } from '@nestjs/swagger';

class AttemptMinimalDto {
  @ApiProperty() id!: string;
  @ApiProperty() testId!: string;
  @ApiProperty() status!: string;
  @ApiProperty({ nullable: true }) score?: number | null;
  @ApiProperty({ nullable: true }) submittedAt?: string | null;
  @ApiProperty({ nullable: true }) completedAt?: string | null;
}

class QuestionResultDto {
  @ApiProperty() id!: string;
  @ApiProperty() index!: number;
  @ApiProperty({ nullable: true }) selectedOptionId?: string | null;
  @ApiProperty({ type: [String] }) correctOptionIds!: string[];
  @ApiProperty({ nullable: true }) isCorrect?: boolean | null;
}

export class AttemptResultResponseDto {
  @ApiProperty() attempt!: AttemptMinimalDto;
  @ApiProperty() summary!: { correct: number; wrong: number; blank: number; total: number; percentage?: number };
  @ApiProperty({ type: [QuestionResultDto] }) questions!: QuestionResultDto[];
}
