/** Takip işlemleri yanıt DTO'su */
// @ts-nocheck

export class FollowsResponseDto {
  ok!: boolean;
  follows?: Array<{ educatorId?: string; followType?: string; notificationsEnabled?: boolean }>;
}
