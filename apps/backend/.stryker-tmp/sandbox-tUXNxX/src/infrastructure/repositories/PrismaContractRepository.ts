// @ts-nocheck
import type { PrismaClient } from '@prisma/client';
import type { IContractRepository, ContractModel, CreateContractInput } from '../../domain/interfaces/IContractRepository';
import type { ContractType } from '../../domain/types';

export class PrismaContractRepository implements IContractRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getActiveByType(type: ContractType): Promise<ContractModel | null> {
    const row = await this.prisma.contract.findFirst({
      where: { type, isActive: true },
      orderBy: { version: 'desc' },
    });
    return row ? this.toModel(row) : null;
  }

  async getById(id: string): Promise<ContractModel | null> {
    const row = await this.prisma.contract.findUnique({ where: { id } });
    return row ? this.toModel(row) : null;
  }

  async list(type?: ContractType): Promise<ContractModel[]> {
    const where = type ? { type } : {};
    const rows = await this.prisma.contract.findMany({
      where,
      orderBy: [{ type: 'asc' }, { version: 'desc' }],
    });
    return rows.map((r) => this.toModel(r));
  }

  async create(input: CreateContractInput): Promise<ContractModel> {
    const row = await this.prisma.contract.create({
      data: {
        type: input.type,
        version: input.version,
        title: input.title,
        content: input.content,
        isActive: input.isActive ?? false,
        publishedAt: input.isActive ? new Date() : null,
      },
    });
    return this.toModel(row);
  }

  async update(id: string, data: { title?: string; content?: string; isActive?: boolean }): Promise<ContractModel | null> {
    const clean: Record<string, unknown> = {};
    if (data.title !== undefined) clean.title = data.title;
    if (data.content !== undefined) clean.content = data.content;
    if (data.isActive !== undefined) clean.isActive = data.isActive;
    if (Object.keys(clean).length === 0) return this.getById(id);
    const row = await this.prisma.contract.update({ where: { id }, data: clean as any });
    return this.toModel(row);
  }

  async setActive(type: ContractType, contractId: string): Promise<ContractModel> {
    return this.prisma.$transaction(async (tx) => {
      await tx.contract.updateMany({
        where: { type, isActive: true },
        data: { isActive: false },
      });
      const row = await tx.contract.update({
        where: { id: contractId },
        data: { isActive: true, publishedAt: new Date() },
      });
      return this.toModel(row);
    });
  }

  private toModel(row: { id: string; type: string; version: number; title: string; content: string; isActive: boolean; publishedAt: Date | null; createdAt: Date; updatedAt: Date }): ContractModel {
    return {
      id: row.id,
      type: row.type as ContractType,
      version: row.version,
      title: row.title,
      content: row.content,
      isActive: row.isActive,
      publishedAt: row.publishedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
