import { Module } from '@nestjs/common';
import { AuthController } from '../../controllers/auth.controller';
import { RegisterUseCase } from '../../../application/use-cases/auth/RegisterUseCase';
import { RegisterEducatorUseCase } from '../../../application/use-cases/auth/RegisterEducatorUseCase';
import { LoginUseCase } from '../../../application/use-cases/auth/LoginUseCase';
import { ForgotPasswordUseCase } from '../../../application/use-cases/auth/ForgotPasswordUseCase';
import { ResetPasswordUseCase } from '../../../application/use-cases/auth/ResetPasswordUseCase';
import { ChangePasswordUseCase } from '../../../application/use-cases/auth/ChangePasswordUseCase';
import { GoogleAuthUseCase } from '../../../application/use-cases/auth/GoogleAuthUseCase';
import { NotifyNewDeviceLoginUseCase } from '../../../application/use-cases/auth/NotifyNewDeviceLoginUseCase';
import { VerifyDeviceUseCase } from '../../../application/use-cases/auth/VerifyDeviceUseCase';
import { PrismaUserRepository } from '../../../infrastructure/repositories/PrismaUserRepository';
import { PasswordService } from '../../../infrastructure/services/PasswordService';
import { JwtService } from '../../../infrastructure/services/JwtService';
import { MockEmailProvider } from '../../../infrastructure/services/MockEmailProvider';
import { PrismaAuditLogRepository } from '../../../infrastructure/repositories/PrismaAuditLogRepository';
import { PrismaContractRepository } from '../../../infrastructure/repositories/PrismaContractRepository';
import { PrismaContractAcceptanceRepository } from '../../../infrastructure/repositories/PrismaContractAcceptanceRepository';
import { PrismaPendingRegistrationRepository } from '../../../infrastructure/repositories/PrismaPendingRegistrationRepository';
import { prisma } from '../../../infrastructure/database/prisma';
import { CONTRACT_REPO, CONTRACT_ACCEPTANCE_REPO, USER_REPO } from '../../../application/constants';
import { CaptchaService } from '../../services/captcha.service';
import { LoginBruteforceGuard } from '../../guards/login-bruteforce.guard';
import { AuditLogger } from '../../../infrastructure/audit/AuditLogger';
import { SendEmailUseCase } from '../../../application/use-cases/email/SendEmailUseCase';
// SendEmail kullanıcı tarafından üretilmiş yardımcı (NotifyNewDevice için gerekli)

@Module({
  controllers: [AuthController],
  providers: [
    PrismaUserRepository,
    { provide: USER_REPO, useClass: PrismaUserRepository },
    PasswordService,
    JwtService,
    PrismaPendingRegistrationRepository,
    // Sprint 14 — RegisterUseCase artık contract repo'larını alır (üyelik + KVKK zorunlu)
    // Yeni: pendingRepo ile pending-first kayıt akışı
    {
      provide: RegisterUseCase,
      useFactory: (
        userRepo: PrismaUserRepository,
        passwordService: PasswordService,
        pendingRepo: PrismaPendingRegistrationRepository,
      ) =>
        new RegisterUseCase(
          userRepo,
          passwordService,
          new PrismaContractRepository(prisma),
          new PrismaContractAcceptanceRepository(prisma),
          new PrismaAuditLogRepository(),
          pendingRepo,
        ),
      inject: [PrismaUserRepository, PasswordService, PrismaPendingRegistrationRepository],
    },
    AuditLogger,
    {
      provide: NotifyNewDeviceLoginUseCase,
      useFactory: (sendEmail: SendEmailUseCase) => new NotifyNewDeviceLoginUseCase(sendEmail),
      inject: [SendEmailUseCase],
    },
    {
      provide: VerifyDeviceUseCase,
      useFactory: () => new VerifyDeviceUseCase(),
    },
    {
      provide: LoginUseCase,
      useFactory: (
        userRepo: PrismaUserRepository,
        passwordService: PasswordService,
        jwtService: JwtService,
        audit: AuditLogger,
        notifyDevice: NotifyNewDeviceLoginUseCase,
      ) => new LoginUseCase(userRepo, passwordService, jwtService, audit, notifyDevice),
      inject: [PrismaUserRepository, PasswordService, JwtService, AuditLogger, NotifyNewDeviceLoginUseCase],
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
    {
      provide: ChangePasswordUseCase,
      useFactory: (userRepo: PrismaUserRepository, passwordService: PasswordService) =>
        new ChangePasswordUseCase(userRepo, passwordService),
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
        pendingRepo: PrismaPendingRegistrationRepository,
      ) =>
        new RegisterEducatorUseCase(userRepo, contractRepo, acceptanceRepo, auditRepo, passwordService, jwtService, pendingRepo),
      inject: [PrismaUserRepository, CONTRACT_REPO, CONTRACT_ACCEPTANCE_REPO, PrismaAuditLogRepository, PasswordService, JwtService, PrismaPendingRegistrationRepository],
    },
    {
      provide: GoogleAuthUseCase,
      useFactory: (userRepo: PrismaUserRepository, pwd: PasswordService, jwt: JwtService) =>
        // clientId artık runtime'da DB+env'den okunuyor; constructor param backwards-compat
        new GoogleAuthUseCase(userRepo, pwd, jwt, process.env.GOOGLE_CLIENT_ID),
      inject: [PrismaUserRepository, PasswordService, JwtService],
    },
  ],
})
export class AuthModule {}
