// @ts-nocheck
import { Injectable } from '@nestjs/common';
import { prisma } from '../database/prisma';
import { ITopicRepository } from '../../domain/interfaces/ITopicRepository';
import { Topic } from '../../domain/entities/Topic';

/** Prisma topic row (v2 schema, junction table) → legacy Topic domain entity */
function toTopic(r: any): Topic {
  const examTypeId = r.examTypes?.[0]?.examTypeId ?? r.examTypes?.[0]?.examType?.id ?? '';
  return { id: r.id, examTypeId, name: r.name, slug: r.slug, active: r.active, createdAt: r.createdAt };
}

const INCLUDE_ET = { examTypes: { select: { examTypeId: true } } } as const;

@Injectable()
export class PrismaTopicRepository implements ITopicRepository {
  async create(input: { examTypeId: string; name: string; slug: string; active?: boolean }): Promise<Topic> {
    const r = await (prisma.topic as any).create({
      data: {
        name: input.name, slug: input.slug, active: input.active ?? true,
        examTypes: { create: [{ examTypeId: input.examTypeId }] },
      },
      include: INCLUDE_ET,
    });
    return toTopic(r);
  }

  async findById(id: string): Promise<Topic | null> {
    const r = await (prisma.topic as any).findUnique({ where: { id }, include: INCLUDE_ET });
    if (!r) return null;
    return toTopic(r);
  }

  async findByExamTypeAndSlug(examTypeId: string, slug: string): Promise<Topic | null> {
    const r = await (prisma.topic as any).findFirst({
      where: { slug, examTypes: { some: { examTypeId } } },
      include: INCLUDE_ET,
    });
    if (!r) return null;
    return toTopic(r);
  }

  async listByExamType(examTypeId: string, activeOnly?: boolean): Promise<Topic[]> {
    const rows = await (prisma.topic as any).findMany({
      where: { examTypes: { some: { examTypeId } }, ...(activeOnly ? { active: true } : {}) },
      include: INCLUDE_ET,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toTopic);
  }

  async update(id: string, data: { name?: string; slug?: string; active?: boolean }): Promise<Topic | null> {
    const clean: Record<string, unknown> = {};
    if (data.name !== undefined) clean.name = data.name;
    if (data.slug !== undefined) clean.slug = data.slug;
    if (data.active !== undefined) clean.active = data.active;
    if (Object.keys(clean).length === 0) return this.findById(id);
    await (prisma.topic as any).updateMany({ where: { id }, data: clean });
    return this.findById(id);
  }

  async delete(id: string): Promise<boolean> {
    const r = await (prisma.topic as any).deleteMany({ where: { id } });
    return r.count > 0;
  }
}
