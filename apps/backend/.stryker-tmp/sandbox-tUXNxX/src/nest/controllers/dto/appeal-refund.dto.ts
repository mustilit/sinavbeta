// @ts-nocheck
import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AppealRefundDto {
  @ApiProperty({ description: 'İtiraz gerekçesi (en az 5 karakter)', minLength: 5 })
  @IsString()
  @MinLength(5)
  reason!: string;
}
