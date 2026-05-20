// @ts-nocheck
import { prisma } from '../database/prisma';
import { Objection, CreateObjectionInput, ObjectionWithTestOwner } from '../../domain/entities/Objection';
import type { ObjectionStatus } from '../../domain/types';
import { IObjectionRepository, EnrichedObjection, TestReportStat } from '../../domain/interfaces/IObjectionRepository';
import { ObjectionStatus as PrismaObjectionStatus } from '@prisma/client';

const SLA_DAYS = 10;
const toDeadline = (d: Date) => new Date(d.getTime() + SLA_DAYS * 24 * 60 * 60 * 1000);

function toObjection(row: {
  id: string;
  attemptId: string;
  questionId: string;
  reporterId: string;
  reason: string;
  status: string;
  answerText: string | null;
  createdAt: Date;
  answeredAt: Date | null;
  escalatedAt: Date | null;
}): Objection {
  return {
    id: row.id,
    attemptId: row.attemptId,
    questionId: row.questionId,
    reporterId: row.reporterId,
    reason: row.reason,
    status: row.status as ObjectionStatus,
    answerText: row.answerText ?? undefined,
    createdAt: row.createdAt,
    answeredAt: row.answeredAt ?? undefined,
    escalatedAt: row.escalatedAt ?? undefined,
  };
}

const ENRICHED_INCLUDE = {
  attempt: {
    select: {
      test: {
        select: {
          id: true, title: true, educatorId: true,
          educator: { select: { name: true } },
        },
      },
    },
  },
  question: { select: { content: true } },
  reporter: { select: { name: true, email: true } },
} as const;

function toEnriched(row: any): EnrichedObjection {
  const test = row.attempt?.test;
  return {
    id: row.id,
    reason: row.reason,
    status: row.status,
    createdAt: row.createdAt,
    answerText: row.answerText ?? undefined,
    answeredAt: row.answeredAt ?? undefined,
    escalatedAt: row.escalatedAt ?? undefined,
    deadlineAt: toDeadline(row.createdAt),
    questionId: row.questionId,
    questionContent: (row.question?.content ?? '').slice(0, 150),
    testId: test?.id ?? '',
    testTitle: test?.title ?? '',
    reporterId: row.reporterId,
    reporterName: row.reporter?.name ?? row.reporter?.email ?? 'Bilinmiyor',
    educatorId: test?.educatorId ?? null,
    educatorName: test?.educator?.name ?? null,
  };
}

export class PrismaObjectionRepository implements IObjectionRepository {
  async create(input: CreateObjectionInput): Promise<Objection> {
    const row = await prisma.objection.create({
      data: {
        attemptId: input.attemptId,
        questionId: input.questionId,
        reporterId: input.reporterId,
        reason: input.reason,
      },
    });
    return toObjection(row);
  }

  async findByAttemptAndQuestion(attemptId: string, questionId: string): Promise<Objection | null> {
    const row = await prisma.objection.findFirst({ where: { attemptId, questionId } });
    if (!row) return null;
    return toObjection(row);
  }

  async findByIdWithTestOwner(objectionId: string): Promise<ObjectionWithTestOwner | null> {
    const row = await prisma.objection.findUnique({
      where: { id: objectionId },
      include: {
        attempt: { select: { test: { select: { educatorId: true } } } },
        question: { select: { test: { select: { educatorId: true } } } },
      },
    });
    if (!row) return null;
    const educatorId =
      (row.attempt as any)?.test?.educatorId ??
      (row.question as any)?.test?.educatorId ??
      null;
    return { objection: toObjection(row), educatorId };
  }

  async updateAnswer(objectionId: string, data: { answerText: string; answeredAt: Date; status: 'ANSWERED' }): Promise<Objection | null> {
    const row = await prisma.objection.updateMany({
      where: { id: objectionId },
      data: { answerText: data.answerText, answeredAt: data.answeredAt, status: 'ANSWERED' },
    });
    if (row.count === 0) return null;
    const updated = await prisma.objection.findUnique({ where: { id: objectionId } });
    return updated ? toObjection(updated) : null;
  }

  async escalate(objectionId: string, data: { status: 'ESCALATED'; escalatedAt: Date }): Promise<Objection | null> {
    const row = await prisma.objection.updateMany({
      where: { id: objectionId },
      data: { status: 'ESCALATED', escalatedAt: data.escalatedAt },
    });
    if (row.count === 0) return null;
    const updated = await prisma.objection.findUnique({ where: { id: objectionId } });
    return updated ? toObjection(updated) : null;
  }

  async listEscalated(filters?: { from?: Date; to?: Date }): Promise<Objection[]> {
    const where: { status: PrismaObjectionStatus; createdAt?: { gte?: Date; lte?: Date } } = { status: 'ESCALATED' };
    if (filters?.from != null || filters?.to != null) {
      where.createdAt = {};
      if (filters?.from != null) where.createdAt.gte = filters.from;
      if (filters?.to != null) where.createdAt.lte = filters.to;
    }
    const rows = await prisma.objection.findMany({ where, orderBy: { createdAt: 'desc' } });
    return rows.map(toObjection);
  }

  async listByEducator(educatorId: string, filters?: { status?: string }): Promise<EnrichedObjection[]> {
    const where: any = { attempt: { test: { educatorId } } };
    if (filters?.status) {
      const statuses = filters.status.split(',').map(s => s.trim()).filter(Boolean);
      where.status = statuses.length === 1 ? statuses[0] : { in: statuses };
    }
    const rows = await (prisma.objection as any).findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: ENRICHED_INCLUDE,
    });
    return rows.map(toEnriched);
  }

  async listAll(filters?: { status?: string; from?: Date; to?: Date }): Promise<EnrichedObjection[]> {
    const where: any = {};
    if (filters?.status) {
      const statuses = filters.status.split(',').map(s => s.trim()).filter(Boolean);
      where.status = statuses.length === 1 ? statuses[0] : { in: statuses };
    }
    if (filters?.from != null || filters?.to != null) {
      where.createdAt = {};
      if (filters?.from != null) where.createdAt.gte = filters.from;
      if (filters?.to != null) where.createdAt.lte = filters.to;
    }
    const rows = await (prisma.objection as any).findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: ENRICHED_INCLUDE,
    });
    return rows.map(toEnriched);
  }

  async listTestReportStats(): Promise<TestReportStat[]> {
    const rows = await (prisma.objection as any).findMany({
      select: {
        status: true,
        attempt: {
          select: {
            test: {
              select: {
                id: true, title: true, educatorId: true,
                educator: { select: { name: true } },
              },
            },
          },
        },
      },
    });
    const statsMap = new Map<string, TestReportStat>();
    for (const row of rows) {
      const test = row.attempt?.test;
      if (!test?.id) continue;
      if (!statsMap.has(test.id)) {
        statsMap.set(test.id, {
          testId: test.id,
          testTitle: test.title ?? '',
          educatorId: test.educatorId ?? null,
          educatorName: test.educator?.name ?? null,
          totalCount: 0, openCount: 0, answeredCount: 0, escalatedCount: 0,
        });
      }
      const stat = statsMap.get(test.id)!;
      stat.totalCount += 1;
      if (row.status === 'OPEN') stat.openCount += 1;
      else if (row.status === 'ANSWERED') stat.answeredCount += 1;
      else if (row.status === 'ESCALATED') stat.escalatedCount += 1;
    }
    return Array.from(statsMap.values()).sort((a, b) => b.totalCount - a.totalCount);
  }

  async countByTestAndCandidate(testId: string, candidateId: string): Promise<number> {
    return prisma.objection.count({ where: { attempt: { testId }, reporterId: candidateId } });
  }

  async findOverdueOpenObjections(olderThanDays: number, limit = 100): Promise<Objection[]> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - olderThanDays);
    const rows = await prisma.objection.findMany({
      where: { status: 'OPEN', createdAt: { lt: cutoff } },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
    return rows.map(toObjection);
  }

  async markEscalated(objectionIds: string[]): Promise<number> {
    if (objectionIds.length === 0) return 0;
    const result = await prisma.objection.updateMany({
      where: { id: { in: objectionIds } },
      data: { status: 'ESCALATED', escalatedAt: new Date() },
    });
    return result.count;
  }
}
