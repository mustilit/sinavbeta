import { Module } from '@nestjs/common';
import { AuthController } from '../../controllers/auth.controller';
import { RegisterUseCase } from '../../../application/use-cases/auth/RegisterUseCase';
import { RegisterEducatorUseCase } from '../../../application/use-cases/auth/RegisterEducatorUseCase';
import { LoginUseCase } from '../../../application/use-cases/auth/LoginUseCase';
import { ForgotPasswordUseCase } from '../../../application/use-cases/auth/ForgotPasswordUseCase';
import { ResetPasswordUseCase } from '../../../application/use-cases/auth/ResetPasswordUseCase';
import { PrismaUserRepository } from '../../../infrastructure/repositories/PrismaUserRepository';
import { PasswordService } from '../../../infrastructure/services/PasswordService';
import { JwtService } from '../../../infrastructure/services/JwtService';
import { MockEmailProvider } from '../../../infrastructure/services/MockEmailProvider';
import { PrismaAuditLogRepository } from '../../../infrastructure/repositories/PrismaAuditLogRepository';
import { PrismaContractRepository } from '../../../infrastructure/repositories/PrismaContractRepository';
import { PrismaContractAcceptanceRepository } from '../../../infrastructure/repositories/PrismaContractAcceptanceRepository';
import { prisma } from '../../../infrastructure/database/prisma';
import { CONTRACT_REPO, CONTRACT_ACCEPTANCE_REPO, USER_REPO } from '../../../application/constants';
import { CaptchaService } from '../../services/captcha.service';
import { LoginBruteforceGuard } from '../../guards/login-bruteforce.guard';
import { AuditLogger } from '../../../infrastructure/audit/AuditLogger';
import { SendEmailUseCase } from '../../../application/use-cases/email/SendEmailUseCase';

@Module({
  controllers: [AuthController],
  providers: [
    PrismaUserRepository,
    { provide: USER_REPO, useClass: PrismaUserRepository },
    PasswordService,
    JwtService,
    {
      provide: RegisterUseCase,
      useFactory: (userRepo: PrismaUserRepository, passwordService: PasswordService) =>
        new RegisterUseCase(userRepo, passwordService),
      inject: [PrismaUserRepository, PasswordService],
    },
    AuditLogger,
    {
      provide: LoginUseCase,
      useFactory: (
        userRepo: PrismaUserRepository,
        passwordService: PasswordService,
        jwtService: JwtService,
        audit: AuditLogger,
      ) => new LoginUseCase(userRepo, passwordService, jwtService, audit),
      inject: [PrismaUserRepository, PasswordService, JwtService, AuditLogger],
    },
    CaptchaService,
    LoginBruteforceGuard,
    MockEmailProvider,
    { provide: SendEmailUseCase, useFactory: () => new SendEmailUseCase() },
    {
      provide: ForgotPasswordUseCase,
      useFactory: (
        userRepo: PrismaUserRepository,
        emailProvider: MockEmailProvider,
        sendEmail: SendEmailUseCase,
      ) => new ForgotPasswordUseCase(userRepo, emailProvider, sendEmail),
      inject: [PrismaUserRepository, MockEmailProvider, SendEmailUseCase],
    },
    {
      provide: ResetPasswordUseCase,
      useFactory: (userRepo: PrismaUserRepository, passwordService: PasswordService) =>
        new ResetPasswordUseCase(userRepo, passwordService),
      inject: [PrismaUserRepository, PasswordService],
    },
    PrismaAuditLogRepository,
    {
      provide: CONTRACT_REPO,
      useFactory: () => new PrismaContractRepository(prisma),
    },
    {
      provide: CONTRACT_ACCEPTANCE_REPO,
      useFactory: () => new PrismaContractAcceptanceRepository(prisma),
    },
    {
      provide: RegisterEducatorUseCase,
      useFactory: (
        userRepo: PrismaUserRepository,
        contractRepo: PrismaContractRepository,
        acceptanceRepo: PrismaContractAcceptanceRepository,
        auditRepo: PrismaAuditLogRepository,
        passwordService: PasswordService,
        jwtService: JwtService,
      ) =>
        new RegisterEducatorUseCase(userRepo, contractRepo, acceptanceRepo, auditRepo, passwordService, jwtService),
      inject: [PrismaUserRepository, CONTRACT_REPO, CONTRACT_ACCEPTANCE_REPO, PrismaAuditLogRepository, PasswordService, JwtService],
    },
  ],
})
export class AuthModule {}
