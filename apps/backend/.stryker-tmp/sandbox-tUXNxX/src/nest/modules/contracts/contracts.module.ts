// @ts-nocheck
import { Module } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { ContractsController } from './contracts.controller';
import { GetActiveContractUseCase } from '../../../application/use-cases/contract/GetActiveContractUseCase';
import { AcceptContractUseCase } from '../../../application/use-cases/contract/AcceptContractUseCase';
import { PrismaContractRepository } from '../../../infrastructure/repositories/PrismaContractRepository';
import { PrismaContractAcceptanceRepository } from '../../../infrastructure/repositories/PrismaContractAcceptanceRepository';
import { PrismaAuditLogRepository } from '../../../infrastructure/repositories/PrismaAuditLogRepository';
import { CONTRACT_REPO, CONTRACT_ACCEPTANCE_REPO } from '../../../application/constants';

@Module({
  controllers: [ContractsController],
  exports: [CONTRACT_REPO, CONTRACT_ACCEPTANCE_REPO, GetActiveContractUseCase, AcceptContractUseCase],
  providers: [
    {
      provide: CONTRACT_REPO,
      useFactory: (prisma: PrismaClient) => new PrismaContractRepository(prisma),
      inject: ['PRISMA'],
    },
    {
      provide: CONTRACT_ACCEPTANCE_REPO,
      useFactory: (prisma: PrismaClient) => new PrismaContractAcceptanceRepository(prisma),
      inject: ['PRISMA'],
    },
    {
      provide: GetActiveContractUseCase,
      useFactory: (contractRepo: PrismaContractRepository) => new GetActiveContractUseCase(contractRepo),
      inject: [CONTRACT_REPO],
    },
    {
      provide: AcceptContractUseCase,
      useFactory: (
        contractRepo: PrismaContractRepository,
        acceptanceRepo: PrismaContractAcceptanceRepository,
        auditRepo: PrismaAuditLogRepository,
      ) => new AcceptContractUseCase(contractRepo, acceptanceRepo, auditRepo),
      inject: [CONTRACT_REPO, CONTRACT_ACCEPTANCE_REPO, PrismaAuditLogRepository],
    },
    PrismaAuditLogRepository,
  ],
})
export class ContractsModule {}
