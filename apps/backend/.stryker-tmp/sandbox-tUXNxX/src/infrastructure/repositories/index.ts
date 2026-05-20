// @ts-nocheck
import { IUserRepository } from '../../domain/interfaces/IUserRepository';
import { IAuditLogRepository } from '../../domain/interfaces/IAuditLogRepository';
import { IExamRepository } from '../../domain/interfaces/IExamRepository';
import { ITestAttemptRepository } from '../../domain/interfaces/ITestAttemptRepository';
import { InMemoryUserRepository } from './InMemoryUserRepository';
import { InMemoryAuditLogRepository } from './InMemoryAuditLogRepository';
import { InMemoryExamRepository } from './InMemoryExamRepository';
import { InMemoryTestAttemptRepository } from './InMemoryTestAttemptRepository';
import { PrismaUserRepository } from './PrismaUserRepository';
import { PrismaAuditLogRepository } from './PrismaAuditLogRepository';
import { PrismaExamRepository } from './PrismaExamRepository';
import { PrismaTestAttemptRepository } from './PrismaTestAttemptRepository';

/**
 * DATABASE_URL varsa Prisma (transaction ile atomic)
 * Yoksa InMemory (geliştirme/test)
 */
export function createUserRepository(): IUserRepository {
  if (process.env.DATABASE_URL) {
    return new PrismaUserRepository();
  }
  return new InMemoryUserRepository();
}
export function createAuditLogRepository(): IAuditLogRepository {
  if (process.env.DATABASE_URL) {
    return new PrismaAuditLogRepository();
  }
  return new InMemoryAuditLogRepository();
}

export function createExamRepository(): IExamRepository {
  if (process.env.DATABASE_URL) {
    return new PrismaExamRepository();
  }
  return new InMemoryExamRepository();
}

export function createTestAttemptRepository(): ITestAttemptRepository {
  if (process.env.DATABASE_URL) {
    return new PrismaTestAttemptRepository();
  }
  return new InMemoryTestAttemptRepository();
}
