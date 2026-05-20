// @ts-nocheck
import { IsOptional, IsBooleanString } from 'class-validator';

export class ListExamTypeQueryDto {
  // pass ?activeOnly=true or false
  @IsOptional()
  activeOnly?: string;
}

