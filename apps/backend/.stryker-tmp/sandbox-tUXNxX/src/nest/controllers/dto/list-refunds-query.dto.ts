// @ts-nocheck
import { IsOptional, IsIn } from 'class-validator';

const VALID_STATUSES = [
  'actionable',
  'PENDING',
  'EDUCATOR_APPROVED',
  'EDUCATOR_REJECTED',
  'APPEAL_PENDING',
  'ESCALATED',
  'APPROVED',
  'REJECTED',
] as const;

export class ListRefundsQueryDto {
  @IsOptional()
  @IsIn(VALID_STATUSES)
  status?: (typeof VALID_STATUSES)[number] = 'actionable';
}
