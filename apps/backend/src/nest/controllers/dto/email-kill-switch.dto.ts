import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class SendWindowDto {
  @IsOptional() @IsBoolean() emailSendWindowEnabled?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(23) emailSendWindowStartHour?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(24) emailSendWindowEndHour?: number;
  @IsOptional() @IsString() @MaxLength(64) emailSendWindowTimezone?: string;
  @IsOptional() @IsBoolean() emailSendWindowAppliesToCritical?: boolean;
}

export class ToggleKillSwitchDto {
  @IsOptional() @IsBoolean() emailEnabled?: boolean;
  @IsOptional() @IsBoolean() emailEducatorCriticalEnabled?: boolean;
  @IsOptional() @IsBoolean() emailEducatorNotifyEnabled?: boolean;
  @IsOptional() @IsBoolean() emailEducatorBulkEnabled?: boolean;
  @IsOptional() @IsBoolean() emailCandidateCriticalEnabled?: boolean;
  @IsOptional() @IsBoolean() emailCandidateNotifyEnabled?: boolean;
  @IsOptional() @IsBoolean() emailCandidateBulkEnabled?: boolean;
  @IsOptional() @IsBoolean() emailStaffCriticalEnabled?: boolean;
  @IsOptional() @IsBoolean() emailStaffNotifyEnabled?: boolean;

  @IsString() @MinLength(3) @MaxLength(500)
  reason!: string;

  @IsOptional() @IsBoolean()
  clearAutoPause?: boolean;

  @IsOptional() @ValidateNested() @Type(() => SendWindowDto)
  sendWindow?: SendWindowDto;
}
