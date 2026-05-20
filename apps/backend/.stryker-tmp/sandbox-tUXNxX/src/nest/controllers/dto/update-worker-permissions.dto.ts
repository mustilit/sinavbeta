// @ts-nocheck
import { IsArray, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateWorkerPermissionsDto {
  @ApiProperty({
    type: [String],
    example: ['AdminDashboard', 'ManageTests'],
    description: 'Worker kullanıcısına verilecek sayfa izinleri',
  })
  @IsArray()
  @IsString({ each: true })
  pages!: string[];
}
