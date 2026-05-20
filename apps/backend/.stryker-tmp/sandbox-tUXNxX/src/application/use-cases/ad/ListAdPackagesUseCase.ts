// @ts-nocheck
import { prisma } from '../../../infrastructure/database/prisma';

/** FR-Y-09: Admin reklam paketlerini listeler */
export class ListAdPackagesUseCase {
  async execute(activeOnly = true) {
    const where = activeOnly ? { active: true } : {};
    return prisma.adPackage.findMany({
      where,
      orderBy: { priceCents: 'asc' },
    });
  }
}
