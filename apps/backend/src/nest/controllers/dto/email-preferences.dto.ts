import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateEmailPreferencesDto {
  @IsOptional() @IsBoolean() marketing?: boolean;
  @IsOptional() @IsBoolean() productUpdates?: boolean;
  @IsOptional() @IsBoolean() weeklyDigest?: boolean;
  @IsOptional() @IsBoolean() reviewNotifications?: boolean;
  @IsOptional() @IsBoolean() objectionUpdates?: boolean;
  @IsOptional() @IsBoolean() liveSessionInvites?: boolean;
  @IsOptional() @IsBoolean() refundUpdates?: boolean;
}
