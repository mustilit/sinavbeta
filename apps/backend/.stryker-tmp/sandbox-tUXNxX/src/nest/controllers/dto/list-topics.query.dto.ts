// @ts-nocheck
import { IsOptional, IsUUID } from 'class-validator';

export class ListTopicsQueryDto {
  @IsUUID()
  examTypeId!: string;

  @IsOptional()
  activeOnly?: string; // query comes as string: 'true' | 'false'
}
