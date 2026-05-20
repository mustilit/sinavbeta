// @ts-nocheck
import { Injectable } from '@nestjs/common';
import { prisma } from '../../../infrastructure/database/prisma';

/**
 * Sınav türüne göre konuları düz liste olarak döndürür.
 * examTypeId verilmezse tüm konular döner.
 */
@Injectable()
export class ListTopicsByExamTypeUseCase {
  async execute(examTypeId?: string, activeOnly = true) {
    const where: any = activeOnly ? { active: true } : {};
    if (examTypeId) where.examTypes = { some: { examTypeId } };

    const rows = await (prisma.topic as any).findMany({
      where,
      include: {
        examTypes: { include: { examType: { select: { id: true, name: true } } } },
        parent: { select: { id: true, name: true } },
      },
      orderBy: { name: 'asc' },
    });

    return rows.map((r: any) => ({
      id: r.id, name: r.name, slug: r.slug, active: r.active,
      parentId: (r as any).parentId ?? null,
      parentName: (r as any).parent?.name ?? null,
      examTypes: (r as any).examTypes.map((te: any) => ({ id: te.examType.id, name: te.examType.name })),
    }));
  }
}
