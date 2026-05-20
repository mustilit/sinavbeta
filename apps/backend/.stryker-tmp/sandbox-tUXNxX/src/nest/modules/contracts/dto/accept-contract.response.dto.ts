// @ts-nocheck
import { ApiProperty } from '@nestjs/swagger';

export class AcceptContractResponseDto {
  @ApiProperty({ description: 'ISO 8601 date when contract was accepted' })
  acceptedAt!: string;
}
