// @ts-nocheck
import { Injectable } from '@nestjs/common';
import { prisma } from '../../../infrastructure/database/prisma';

const INCLUDE_EXAM_TYPES = {
  examTypes: { include: { examType: { select: { id: true, name: true, slug: true } } } },
};

const CHILDREN_L2 = {
  children: {
    include: {
      ...INCLUDE_EXAM_TYPES,
      children: { include: { ...INCLUDE_EXAM_TYPES } },
    },
    orderBy: { name: 'asc' as const },
  },
};

/**
 * Konu ağacını getirir (üst konular + en fazla 2 seviye alt konu).
 * Admin paneli ve kamu endpoint'leri için kullanılır.
 */
@Injectable()
export class GetTopicTreeUseCase {
  async execute(activeOnly = false) {
    const roots = await (prisma.topic as any).findMany({
      where: { parentId: null, ...(activeOnly ? { active: true } : {}) },
      include: { ...INCLUDE_EXAM_TYPES, ...CHILDREN_L2 },
      orderBy: { name: 'asc' },
    });
    return roots.map((t: any) => this.mapNode(t));
  }

  /** Düz liste — dropdown seçiciler için; üst konu adını içerir */
  async flat(examTypeId?: string) {
    const where: any = { active: true };
    if (examTypeId) where.examTypes = { some: { examTypeId } };
    const rows = await (prisma.topic as any).findMany({
      where,
      include: {
        ...INCLUDE_EXAM_TYPES,
        parent: { select: { id: true, name: true } },
      },
      orderBy: { name: 'asc' },
    });
    return rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      active: r.active,
      parentId: (r as any).parentId ?? null,
      parentName: (r as any).parent?.name ?? null,
      examTypes: (r as any).examTypes.map((te: any) => ({ id: te.examType.id, name: te.examType.name })),
    }));
  }

  private mapNode(t: any): any {
    return {
      id: t.id,
      name: t.name,
      slug: t.slug,
      active: t.active,
      parentId: t.parentId ?? null,
      examTypes: t.examTypes.map((te: any) => ({ id: te.examType.id, name: te.examType.name })),
      children: (t.children || []).map((c: any) => this.mapNode(c)),
    };
  }
}
