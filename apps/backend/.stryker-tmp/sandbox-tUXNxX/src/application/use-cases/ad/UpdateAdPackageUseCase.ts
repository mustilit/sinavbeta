// @ts-nocheck
import { prisma } from '../../../infrastructure/database/prisma';
import { BadRequestException } from '@nestjs/common';

/** FR-Y-09: Admin reklam paketini günceller */
export class UpdateAdPackageUseCase {
  async execute(
    id: string,
    updates: {
      name?: string;
      durationDays?: number;
      impressions?: number;
      priceCents?: number;
      currency?: string;
      active?: boolean;
    },
  ) {
    const existing = await prisma.adPackage.findUnique({ where: { id } });
    if (!existing) throw new BadRequestException({ code: 'NOT_FOUND', message: 'Ad package not found' });

    const data: Record<string, unknown> = {};
    if (updates.name !== undefined) data.name = updates.name;
    if (updates.durationDays !== undefined) {
      if (updates.durationDays < 1) throw new BadRequestException({ code: 'INVALID_INPUT', message: 'durationDays must be >= 1' });
      data.durationDays = updates.durationDays;
    }
    if (updates.impressions !== undefined) {
      if (updates.impressions < 1) throw new BadRequestException({ code: 'INVALID_INPUT', message: 'impressions must be >= 1' });
      data.impressions = updates.impressions;
    }
    if (updates.priceCents !== undefined) {
      if (updates.priceCents < 0) throw new BadRequestException({ code: 'INVALID_INPUT', message: 'priceCents must be >= 0' });
      data.priceCents = updates.priceCents;
    }
    if (updates.currency !== undefined) data.currency = updates.currency;
    if (updates.active !== undefined) data.active = updates.active;

    return prisma.adPackage.update({
      where: { id },
      data,
    });
  }
}
