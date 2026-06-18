import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ValidateWrittenDiscountDto {
  @ApiProperty({ description: 'İndirim kodu' })
  @IsString()
  code!: string;
}
