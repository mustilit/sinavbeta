// @ts-nocheck
import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AddTestToPackageDto {
  @ApiProperty({ example: 'test-uuid-buraya', description: 'Pakete eklenecek test ID' })
  @IsString()
  @IsNotEmpty()
  testId!: string;
}
