// @ts-nocheck
import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AcceptContractDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  contractId!: string;
}
