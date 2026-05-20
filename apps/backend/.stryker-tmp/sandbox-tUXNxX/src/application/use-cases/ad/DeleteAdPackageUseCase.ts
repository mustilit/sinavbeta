// @ts-nocheck
import { prisma } from '../../../infrastructure/database/prisma';
import { BadRequestException } from '@nestjs/common';

/** FR-Y-09: Admin reklam paketini siler */
export class DeleteAdPackageUseCase {
  async execute(id: string) {
    const existing = await prisma.adPackage.findUnique({ where: { id } });
    if (!existing) throw new BadRequestException({ code: 'NOT_FOUND', message: 'Ad package not found' });
    return prisma.adPackage.delete({ where: { id } });
  }
}
