// @ts-nocheck
import type { PrismaClient } from '@prisma/client';
import type { IContractAcceptanceRepository, ContractAcceptanceModel } from '../../domain/interfaces/IContractAcceptanceRepository';

export class PrismaContractAcceptanceRepository implements IContractAcceptanceRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByUserAndContract(userId: string, contractId: string): Promise<ContractAcceptanceModel | null> {
    const row = await this.prisma.contractAcceptance.findUnique({
      where: { userId_contractId: { userId, contractId } },
    });
    return row ? this.toModel(row) : null;
  }

  async create(input: { userId: string; contractId: string; ip?: string; userAgent?: string }): Promise<ContractAcceptanceModel> {
    const row = await this.prisma.contractAcceptance.create({
      data: {
        userId: input.userId,
        contractId: input.contractId,
        ip: input.ip ?? undefined,
        userAgent: input.userAgent ?? undefined,
      },
    });
    return this.toModel(row);
  }

  private toModel(row: { id: string; userId: string; contractId: string; acceptedAt: Date; ip: string | null; userAgent: string | null }): ContractAcceptanceModel {
    return {
      id: row.id,
      userId: row.userId,
      contractId: row.contractId,
      acceptedAt: row.acceptedAt,
      ip: row.ip ?? undefined,
      userAgent: row.userAgent ?? undefined,
    };
  }
}
