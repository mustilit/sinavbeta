// @ts-nocheck
import { IsEmail, IsString, MinLength, IsArray, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateWorkerDto {
  @ApiProperty({ example: 'worker@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'worker_ali', minLength: 3 })
  @IsString()
  @MinLength(3)
  username!: string;

  @ApiProperty({ minLength: 6 })
  @IsString()
  @MinLength(6)
  password!: string;

  @ApiPropertyOptional({
    type: [String],
    example: ['AdminDashboard', 'ManageTests'],
    description: 'İzin verilen sayfa adları',
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  pages?: string[];
}
