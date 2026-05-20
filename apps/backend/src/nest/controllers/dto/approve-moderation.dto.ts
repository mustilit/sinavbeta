import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ApproveModerationDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reviewerNote?: string;
}
