import { IsInt, Min, Max, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpsertWrittenReviewDto {
  @ApiProperty({ description: 'Puan 1-5' })
  @IsInt() @Min(1) @Max(5)
  rating!: number;

  @ApiPropertyOptional({ description: 'Yorum' })
  @IsOptional() @IsString() @MaxLength(2000)
  comment?: string;
}
