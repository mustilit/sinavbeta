// @ts-nocheck
import { prisma } from './prisma';

export type PrismaTransaction = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * Kritik işlemler için atomic transaction runner
 * Birden fazla repository işlemini tek transaction'da çalıştırır
 *
 * Örnek:
 * await runInTransaction(async (tx) => {
 *   const user = await userRepo.saveWithTx(user, tx);
 *   const audit = await auditRepo.logWithTx('register', user.id, tx);
 *   return user;
 * });
 */
export async function runInTransaction<T>(fn: (tx: PrismaTransaction) => Promise<T>): Promise<T> {
  return prisma.$transaction(fn);
}
