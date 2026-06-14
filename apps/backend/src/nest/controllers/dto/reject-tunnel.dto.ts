import { IsString, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/** Admin tünel reddi — sebep zorunlu. */
export class RejectTunnelDto {
  @ApiProperty({ description: 'Red sebebi', minLength: 1, maxLength: 1000 })
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  reason!: string;
}
