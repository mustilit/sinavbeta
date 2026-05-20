import { EmailProviderKind } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateProviderDto {
  @IsString() @MinLength(1) @MaxLength(120)
  name!: string;

  @IsEnum(EmailProviderKind)
  kind!: EmailProviderKind;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(10_000)
  priority?: number;

  @IsOptional() @IsBoolean()
  isActive?: boolean;

  @IsEmail()
  fromEmail!: string;

  @IsString() @MinLength(1) @MaxLength(120)
  fromName!: string;

  @IsOptional() @IsEmail()
  replyToEmail?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1_000_000)
  dailyCap?: number;

  @IsOptional() @IsBoolean()
  generateWebhookSecret?: boolean;

  // BREVO_API
  @IsOptional() @IsString() @MaxLength(512)
  apiKey?: string;

  // SMTP
  @IsOptional() @IsString() @MaxLength(255)
  smtpHost?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(65535)
  smtpPort?: number;

  @IsOptional() @IsBoolean()
  smtpSecure?: boolean;

  @IsOptional() @IsString() @MaxLength(255)
  smtpUser?: string;

  @IsOptional() @IsString() @MaxLength(512)
  smtpPass?: string;
}

export class UpdateProviderDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120)
  name?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(10_000)
  priority?: number;

  @IsOptional() @IsBoolean()
  isActive?: boolean;

  @IsOptional() @IsEmail()
  fromEmail?: string;

  @IsOptional() @IsString() @MinLength(1) @MaxLength(120)
  fromName?: string;

  @IsOptional() @IsEmail()
  replyToEmail?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1_000_000)
  dailyCap?: number;

  @IsOptional() @IsBoolean()
  generateWebhookSecret?: boolean;

  @IsOptional() @IsString() @MaxLength(512)
  apiKey?: string;

  @IsOptional() @IsString() @MaxLength(255)
  smtpHost?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(65535)
  smtpPort?: number;

  @IsOptional() @IsBoolean()
  smtpSecure?: boolean;

  @IsOptional() @IsString() @MaxLength(255)
  smtpUser?: string;

  @IsOptional() @IsString() @MaxLength(512)
  smtpPass?: string;
}

export class TestProviderDto {
  @IsEmail()
  toEmail!: string;

  @IsOptional() @IsString() @MaxLength(255)
  subject?: string;
}
