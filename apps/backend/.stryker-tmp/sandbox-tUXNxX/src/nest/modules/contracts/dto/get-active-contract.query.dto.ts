// @ts-nocheck
import { IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export type ContractType = 'CANDIDATE' | 'EDUCATOR';

export class GetActiveContractQueryDto {
  @ApiProperty({ enum: ['CANDIDATE', 'EDUCATOR'] })
  @IsIn(['CANDIDATE', 'EDUCATOR'], { message: 'type must be CANDIDATE or EDUCATOR' })
  type!: ContractType;
}
