// @ts-nocheck
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { prisma } from '../database/prisma';
import { IExamTypeRepository } from '../../domain/interfaces/IExamTypeRepository';
import { ExamType } from '../../domain/entities/ExamType';

@Injectable()
export class PrismaExamTypeRepository implements IExamTypeRepository {
  async create(input: { name: string; slug: string; description?: string | null; metadata?: Record<string, unknown> | null; active?: boolean }): Promise<ExamType> {
    const r = await prisma.examType.create({
      data: {
        name: input.name,
        slug: input.slug,
        description: input.description ?? null,
        metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
        active: input.active ?? true,
      },
    });
    return r as any;
  }

  async findBySlug(slug: string): Promise<ExamType | null> {
    const r = await prisma.examType.findUnique({ where: { slug } });
    return r as any;
  }

  async findById(id: string): Promise<ExamType | null> {
    const r = await prisma.examType.findUnique({ where: { id } });
    return r as any;
  }

  async list(filter?: { activeOnly?: boolean }): Promise<ExamType[]> {
    const where = filter?.activeOnly ? { active: true } : undefined;
    const r = await prisma.examType.findMany({ where, orderBy: { createdAt: 'desc' } });
    return r as any;
  }

  async update(id: string, data: { name?: string; slug?: string; description?: string | null; active?: boolean }): Promise<ExamType | null> {
    const clean: Record<string, unknown> = {};
    if (data.name !== undefined) clean.name = data.name;
    if (data.slug !== undefined) clean.slug = data.slug;
    if (data.description !== undefined) clean.description = data.description;
    if (data.active !== undefined) clean.active = data.active;
    if (Object.keys(clean).length === 0) return this.findById(id);
    const r = await prisma.examType.updateMany({ where: { id }, data: clean as any });
    if (r.count === 0) return null;
    const updated = await prisma.examType.findUnique({ where: { id } });
    return updated as any;
  }

  async delete(id: string): Promise<boolean> {
    const topics = await prisma.topic.count({ where: { examTypes: { some: { examTypeId: id } } } });
    if (topics > 0) return false;
    const r = await prisma.examType.deleteMany({ where: { id } });
    return r.count > 0;
  }
}

