import { EmailQueue, EmailStatus, UserRole } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsISO8601, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListEmailLogsQueryDto {
  @IsOptional() @IsString()
  cursorId?: string;

  @IsOptional() @IsISO8601()
  cursorQueuedAt?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit?: number;

  @IsOptional() @IsEnum(EmailQueue)
  queue?: EmailQueue;

  @IsOptional() @IsEnum(EmailStatus)
  status?: EmailStatus;

  @IsOptional() @IsEnum(UserRole)
  recipientRole?: UserRole;

  @IsOptional() @IsString()
  templateKey?: string;

  @IsOptional() @IsString()
  emailSearch?: string;

  @IsOptional() @IsISO8601()
  from?: string;

  @IsOptional() @IsISO8601()
  to?: string;
}
