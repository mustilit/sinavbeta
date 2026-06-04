import { IsString, MinLength, MaxLength } from 'class-validator';

/**
 * Oturum açmış kullanıcının şifre değiştirme isteği.
 * `newPassword` tekrar (confirm) alanı frontend'de doğrulanır; backend'e
 * yalnızca doğrulanmış tek `newPassword` gelir.
 */
export class ChangePasswordDto {
  @IsString({ message: 'Mevcut şifre zorunludur' })
  @MinLength(1, { message: 'Mevcut şifre zorunludur' })
  currentPassword!: string;

  @IsString({ message: 'Yeni şifre zorunludur' })
  @MinLength(8, { message: 'Yeni şifre en az 8 karakter olmalı' })
  @MaxLength(128, { message: 'Yeni şifre en fazla 128 karakter olabilir' })
  newPassword!: string;
}
