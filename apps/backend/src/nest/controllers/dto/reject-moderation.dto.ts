import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RejectModerationDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reviewerNote?: string;
}
