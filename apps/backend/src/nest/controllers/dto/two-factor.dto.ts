/**
 * 2FA endpoint DTO'ları.
 *
 * - `code` 6 haneli TOTP veya 16 hex recovery code olabilir → @Length(6, 16).
 * - `pendingSecretToken` / `pendingMfaToken` JWT — boyut alt sınır savunmacı kontrol.
 */
import { IsString, Length, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifySetupTwoFactorDto {
  @ApiProperty({ description: 'setup adımından dönen kısa-ömürlü JWT (5 dk).' })
  @IsString()
  @MinLength(20)
  pendingSecretToken!: string;

  @ApiProperty({ description: '6 haneli TOTP kodu veya 16 hex recovery kodu.' })
  @IsString()
  @Length(6, 16)
  code!: string;
}

export class VerifyLoginTwoFactorDto {
  @ApiProperty({ description: 'login akışında dönen kısa-ömürlü pending MFA token (5 dk).' })
  @IsString()
  @MinLength(20)
  pendingMfaToken!: string;

  @ApiProperty({ description: '6 haneli TOTP kodu veya 16 hex recovery kodu.' })
  @IsString()
  @Length(6, 16)
  code!: string;
}

export class DisableTwoFactorDto {
  @ApiProperty({ description: 'Kullanıcının mevcut hesap şifresi (doğrulama için).' })
  @IsString()
  @MinLength(8)
  password!: string;
}
