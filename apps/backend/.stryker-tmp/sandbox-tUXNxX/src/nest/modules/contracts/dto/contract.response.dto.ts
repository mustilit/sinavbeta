// @ts-nocheck
import { ApiProperty } from '@nestjs/swagger';

export class ContractResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: ['CANDIDATE', 'EDUCATOR'] }) type!: string;
  @ApiProperty() version!: number;
  @ApiProperty() title!: string;
  @ApiProperty() content!: string;
  @ApiProperty({ nullable: true }) publishedAt!: string | null;
}
