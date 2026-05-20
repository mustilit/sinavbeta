/** Test denemesi anlık durum yanıtı DTO'su — aktif deneme bilgilerini içerir */
// @ts-nocheck

import { ApiProperty } from '@nestjs/swagger';

class AttemptInfoDto {
  @ApiProperty() id!: string;
  @ApiProperty() testId!: string;
  @ApiProperty() status!: string;
  @ApiProperty({ nullable: true }) startedAt?: string;
  @ApiProperty({ nullable: true }) submittedAt?: string | null;
  @ApiProperty({ nullable: true }) durationMinutes?: number;
  @ApiProperty({ nullable: true }) totalSeconds?: number;
  @ApiProperty({ nullable: true }) endsAt?: string;
  @ApiProperty({ nullable: true }) remainingSeconds?: number;
  @ApiProperty() isInLast10Percent!: boolean;
  @ApiProperty() isInLast3Minutes!: boolean;
}

class TestInfoDto {
  @ApiProperty() id!: string;
  @ApiProperty() title!: string;
  @ApiProperty() questionCount!: number;
  @ApiProperty() isTimed!: boolean;
  @ApiProperty() hasSolutions!: boolean;
}

class QuestionStateDto {
  @ApiProperty() id!: string;
  @ApiProperty() index!: number;
  @ApiProperty() answered!: boolean;
  @ApiProperty({ nullable: true }) selectedOptionId?: string | null;
}

export class AttemptStateResponseDto {
  @ApiProperty() attempt!: AttemptInfoDto;
  @ApiProperty() test!: TestInfoDto;
  @ApiProperty({ type: [QuestionStateDto] }) questions!: QuestionStateDto[];
  @ApiProperty() summary!: { answeredCount: number; blankCount: number };
}
