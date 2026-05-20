// @ts-nocheck
import { IsString, IsNotEmpty, IsOptional, IsArray, ValidateNested, IsBoolean, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class LiveOptionDto {
  @IsString()
  @IsNotEmpty()
  content!: string;

  @IsBoolean()
  isCorrect!: boolean;
}

export class LiveQuestionDto {
  @IsString()
  @IsNotEmpty()
  content!: string;

  @IsOptional()
  @IsString()
  mediaUrl?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LiveOptionDto)
  options!: LiveOptionDto[];
}

export class CreateLiveSessionDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsOptional()
  @IsString()
  tierId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxParticipants?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LiveQuestionDto)
  questions!: LiveQuestionDto[];
}
