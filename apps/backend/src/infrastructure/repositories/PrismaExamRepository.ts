import { Injectable } from '@nestjs/common';
import { ExamTest, ExamQuestion, ExamOption } from '../../domain/entities/Exam';
import { ExamWithQuestions, IExamRepository } from '../../domain/interfaces/IExamRepository';
import { prisma } from '../database/prisma';
import { getDefaultTenantId } from '../../common/tenant';

/**
 * Prisma Exam Repository
 * Kritik işlemler $transaction ile atomic
 */
@Injectable()
export class PrismaExamRepository implements IExamRepository {
  async findById(id: string): Promise<ExamWithQuestions | null> {
    const test = await prisma.examTest.findUnique({
      where: { id },
      include: {
        questions: {
          include: { options: true },
          orderBy: { order: 'asc' },
        },
      },
    });
    return test ? this.toDomain(test) : null;
  }

  async save(
    test: ExamTest,
    questions: (ExamQuestion & { options: ExamOption[] })[]
  ): Promise<ExamWithQuestions> {
    return prisma.$transaction(async (tx) => {
      const priceCents = (test as any).priceCents ?? (test as any).price;
      const tenantId = (test as any).tenantId ?? getDefaultTenantId();
      const created = await tx.examTest.create({
        data: {
          id: test.id,
          tenantId,
          title: test.title,
          educatorId: (test as any).educatorId ?? null,
          examTypeId: (test as any).examTypeId ?? null,
          gradeLevelId: (test as any).gradeLevelId ?? null,
          topicId: (test as any).topicId ?? null,
          isTimed: test.isTimed,
          duration: test.duration,
          ...(priceCents != null && { priceCents }),
          questions: {
            create: questions.map((q) => ({
              id: q.id,
              content: q.content,
              order: q.order,
              ...((q as any).mediaUrl != null && { mediaUrl: (q as any).mediaUrl }),
              ...((q as any).solutionText != null && { solutionText: (q as any).solutionText }),
              ...((q as any).solutionMediaUrl != null && { solutionMediaUrl: (q as any).solutionMediaUrl }),
              options: {
                create: q.options.map((o) => ({
                  id: o.id,
                  content: o.content,
                  isCorrect: o.isCorrect,
                  ...((o as any).mediaUrl != null && { mediaUrl: (o as any).mediaUrl }),
                })),
              },
            })),
          },
        },
        include: {
          questions: { include: { options: true }, orderBy: { order: 'asc' } },
        },
      });
      return this.toDomain(created);
    });
  }

  async findAll(): Promise<ExamWithQuestions[]> {
    const reviews = await prisma.examTest.findMany({
      include: { questions: { include: { options: true }, orderBy: { order: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });
    return reviews.map(this.toDomain);
  }

  async findPublished(filters?: {
    examTypeId?: string;
    topicId?: string;
    educatorId?: string;
    isTimed?: boolean;
    minPriceCents?: number;
    maxPriceCents?: number;
    minRating?: number;
    page?: number;
    limit?: number;
    sortBy?: 'publishedAt' | 'priceCents' | 'createdAt';
    order?: 'asc' | 'desc';
  }): Promise<{ items: ExamWithQuestions[]; total: number }> {
    const where: any = { status: 'PUBLISHED' };
    if (filters) {
      if (filters.examTypeId) where.examTypeId = filters.examTypeId;
      if (filters.topicId) where.topicId = filters.topicId;
      if (filters.educatorId) where.educatorId = filters.educatorId;
      if (typeof filters.isTimed === 'boolean') where.isTimed = filters.isTimed;
      if (typeof filters.minPriceCents === 'number' || typeof filters.maxPriceCents === 'number') {
        where.priceCents = where.priceCents ?? {};
        if (typeof filters.minPriceCents === 'number') where.priceCents.gte = filters.minPriceCents;
        if (typeof filters.maxPriceCents === 'number') where.priceCents.lte = filters.maxPriceCents;
      }
      if (typeof filters.minRating === 'number' && filters.minRating > 0) {
        const stats = await prisma.testStats.findMany({
          where: { ratingAvg: { gte: filters.minRating } },
          select: { testId: true },
        });
        const testIds = stats.map((s) => s.testId);
        if (testIds.length === 0) return { items: [], total: 0 };
        where.id = { in: testIds };
      }
    }

    const page = filters?.page && filters.page > 0 ? filters.page : 1;
    const limit = filters?.limit && filters.limit > 0 ? filters.limit : 20;
    const skip = (page - 1) * limit;

    const sortBy = filters?.sortBy ?? 'publishedAt';
    const order = filters?.order ?? 'desc';

    const orderBy =
      sortBy === 'priceCents'
        ? ([{ priceCents: order }, { publishedAt: 'desc' }] as const)
        : { [sortBy]: order };

    const [total, tests] = await Promise.all([
      prisma.examTest.count({ where }),
      prisma.examTest.findMany({
        where,
        include: { questions: { include: { options: true }, orderBy: { order: 'asc' } } },
        orderBy: orderBy as any,
        skip,
        take: limit,
      }),
    ]);

    return { items: tests.map(this.toDomain), total };
  }

  async listPublishedByFollowed(opts: { educatorIds?: string[]; examTypeIds?: string[]; limit: number; examTypeId?: string | null }): Promise<ExamWithQuestions[]> {
    const where: any = { status: 'PUBLISHED' };
    if (opts.examTypeId) where.examTypeId = opts.examTypeId;
    const or: any[] = [];
    if (opts.educatorIds && opts.educatorIds.length) or.push({ educatorId: { in: opts.educatorIds } });
    if (opts.examTypeIds && opts.examTypeIds.length) or.push({ examTypeId: { in: opts.examTypeIds } });
    if (or.length) where.OR = or;
    const tests = await prisma.examTest.findMany({
      where,
      include: { questions: { include: { options: true }, orderBy: { order: 'asc' } } },
      orderBy: [{ publishedAt: 'desc' }],
      take: opts.limit,
    });
    return tests.map(this.toDomain);
  }

  async listPublishedFallback(opts: { excludeIds?: string[]; limit: number; examTypeId?: string | null }): Promise<ExamWithQuestions[]> {
    const where: any = { status: 'PUBLISHED' };
    if (opts.examTypeId) where.examTypeId = opts.examTypeId;
    if (opts.excludeIds && opts.excludeIds.length) where.id = { notIn: opts.excludeIds };
    const tests = await prisma.examTest.findMany({
      where,
      include: { questions: { include: { options: true }, orderBy: { order: 'asc' } } },
      orderBy: [{ publishedAt: 'desc' }],
      take: opts.limit,
    });
    return tests.map(this.toDomain);
  }

  async listPublishedByEducator(opts: { educatorId: string; examTypeId?: string | null; page?: number; limit?: number; sortBy?: 'publishedAt' | 'price' | 'createdAt'; order?: 'asc' | 'desc' }): Promise<{ items: ExamWithQuestions[]; total: number }> {
    const where: any = { status: 'PUBLISHED', educatorId: opts.educatorId };
    if (opts.examTypeId) where.examTypeId = opts.examTypeId;
    const page = opts.page && opts.page > 0 ? opts.page : 1;
    const limit = opts.limit && opts.limit > 0 ? opts.limit : 20;
    const skip = (page - 1) * limit;
    const sortField = opts.sortBy ?? 'publishedAt';
    const order: any = opts.order ?? 'desc';
    const [total, tests] = await Promise.all([
      prisma.examTest.count({ where }),
      prisma.examTest.findMany({
        where,
        include: { questions: { include: { options: true }, orderBy: { order: 'asc' } } },
        orderBy: { [sortField]: order },
        skip,
        take: limit,
      }),
    ]);
    return { items: tests.map(this.toDomain), total };
  }

  async findByEducatorId(educatorId: string): Promise<ExamWithQuestions[]> {
    const tests = await prisma.examTest.findMany({
      where: { educatorId },
      include: {
        questions: { include: { options: true }, orderBy: { order: 'asc' } },
        educator: { select: { id: true, email: true, username: true } },
        _count: { select: { Purchase: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return tests.map((t) => this.toDomain(t));
  }

  async findCorrectOptionIdsByQuestionIds(questionIds: string[]): Promise<Record<string, string[]>> {
    if (!questionIds || questionIds.length === 0) return {};
    const rows: any[] = await prisma.examOption.findMany({
      where: { questionId: { in: questionIds }, isCorrect: true },
      select: { id: true, questionId: true },
    });
    const map: Record<string, string[]> = {};
    for (const r of rows) {
      map[r.questionId] = map[r.questionId] ?? [];
      map[r.questionId].push(r.id);
    }
    return map;
  }

  async findQuestionById(questionId: string): Promise<{ id: string; testId: string } | null> {
    const q = await prisma.examQuestion.findUnique({
      where: { id: questionId },
      select: { id: true, testId: true },
    });
    return q ? { id: q.id, testId: q.testId } : null;
  }

  async findOptionById(optionId: string): Promise<{ id: string; questionId: string; testId: string } | null> {
    const o = await prisma.examOption.findUnique({
      where: { id: optionId },
      include: { question: { select: { id: true, testId: true } } },
    });
    return o ? { id: o.id, questionId: o.questionId, testId: o.question.testId } : null;
  }

  async updateOption(optionId: string, updates: { content?: string; isCorrect?: boolean }): Promise<ExamOption | null> {
    const data: Record<string, unknown> = {};
    if (updates.content !== undefined) data.content = updates.content;
    if (updates.isCorrect !== undefined) data.isCorrect = updates.isCorrect;
    if (Object.keys(data).length === 0) return null;
    const o = await prisma.examOption.update({
      where: { id: optionId },
      data,
    });
    return { id: o.id, questionId: o.questionId, content: o.content, isCorrect: o.isCorrect };
  }

  async addQuestion(testId: string, question: ExamQuestion & { options: ExamOption[] }): Promise<ExamWithQuestions> {
    return prisma.$transaction(async (tx) => {
      await tx.examQuestion.create({
        data: {
          id: question.id,
          testId,
          content: question.content,
          order: question.order,
          ...((question as any).mediaUrl !== undefined && { mediaUrl: (question as any).mediaUrl }),
          ...((question as any).solutionText !== undefined && { solutionText: (question as any).solutionText }),
          ...((question as any).solutionMediaUrl !== undefined && { solutionMediaUrl: (question as any).solutionMediaUrl }),
          options: {
            create: question.options.map((o) => ({
              id: o.id,
              content: o.content,
              isCorrect: o.isCorrect,
              ...((o as any).mediaUrl !== undefined && { mediaUrl: (o as any).mediaUrl }),
            })),
          },
        },
      });
      const updated = await tx.examTest.findUnique({
        where: { id: testId },
        include: { questions: { include: { options: true }, orderBy: { order: 'asc' } } },
      });
      return this.toDomain(updated as any);
    });
  }

  async updateQuestion(questionId: string, updates: Partial<ExamQuestion & { options?: ExamOption[]; mediaUrl?: string | null; solutionText?: string | null; solutionMediaUrl?: string | null }>): Promise<ExamQuestion | null> {
    const data: Record<string, unknown> = {};
    if (updates.content !== undefined) data.content = updates.content;
    if (updates.order !== undefined) data.order = updates.order;
    if ('mediaUrl' in updates) data.mediaUrl = updates.mediaUrl ?? null;
    if ('solutionText' in updates) data.solutionText = updates.solutionText ?? null;
    if ('solutionMediaUrl' in updates) data.solutionMediaUrl = updates.solutionMediaUrl ?? null;
    const q = await prisma.examQuestion.update({ where: { id: questionId }, data });
    return {
      id: q.id,
      testId: q.testId,
      content: q.content,
      order: q.order,
      options: [],
    };
  }

  async updateTestMetadata(
    testId: string,
    updates: {
      title?: string;
      priceCents?: number;
      duration?: number;
      isTimed?: boolean;
      hasSolutions?: boolean;
      campaignPriceCents?: number | null;
      campaignValidFrom?: Date | null;
      campaignValidUntil?: Date | null;
      coverImageUrl?: string | null;
    },
  ): Promise<ExamWithQuestions | null> {
    const data: Record<string, unknown> = {};
    if (updates.title !== undefined) data.title = updates.title;
    if (updates.priceCents !== undefined) data.priceCents = updates.priceCents;
    if (updates.duration !== undefined) data.duration = updates.duration;
    if (updates.isTimed !== undefined) data.isTimed = updates.isTimed;
    if (updates.hasSolutions !== undefined) data.hasSolutions = updates.hasSolutions;
    if (updates.campaignPriceCents !== undefined) data.campaignPriceCents = updates.campaignPriceCents;
    if (updates.campaignValidFrom !== undefined) data.campaignValidFrom = updates.campaignValidFrom;
    if (updates.campaignValidUntil !== undefined) data.campaignValidUntil = updates.campaignValidUntil;
    if (updates.coverImageUrl !== undefined) data.coverImageUrl = updates.coverImageUrl;
    if (Object.keys(data).length === 0) return this.findById(testId);

    const updated = await prisma.examTest.update({
      where: { id: testId },
      data,
      include: {
        questions: { include: { options: true }, orderBy: { order: 'asc' } },
      },
    });
    return this.toDomain(updated);
  }

  async publish(id: string): Promise<ExamWithQuestions | null> {
    const updated = await prisma.examTest.update({
      where: { id },
      data: { status: 'PUBLISHED', publishedAt: new Date() },
      include: {
        questions: { include: { options: true }, orderBy: { order: 'asc' } },
      },
    });
    return this.toDomain(updated);
  }

  async unpublish(id: string): Promise<ExamWithQuestions | null> {
    const updated = await prisma.examTest.update({
      where: { id },
      data: { status: 'DRAFT', publishedAt: null },
      include: {
        questions: { include: { options: true }, orderBy: { order: 'asc' } },
      },
    });
    return this.toDomain(updated);
  }

  private toDomain(row: {
    id: string;
    title: string;
    isTimed: boolean;
    duration: number | null;
    publishedAt: Date | null;
    status?: string | null;
    metadata?: any;
    createdAt: Date;
    updatedAt: Date;
    examTypeId?: string | null;
    topicId?: string | null;
    questions: Array<{
      id: string;
      content: string;
      order: number;
      options: Array<{ id: string; content: string; isCorrect: boolean }>;
      solutionText?: string | null;
      solutionMediaUrl?: string | null;
    }>;
  }): ExamWithQuestions & { priceCents?: number | null; educator?: { id: string; email: string; username: string } | null; _count?: { Purchase: number } } {
    const r = row as any;
    return {
      id: row.id,
      title: row.title,
      isTimed: row.isTimed,
      duration: row.duration,
      status: (row.status as ExamWithQuestions['status']) ?? 'DRAFT',
      educatorId: r.educatorId ?? null,
      examTypeId: (row as any).examTypeId ?? null,
      topicId: (row as any).topicId ?? null,
      metadata: (row.metadata as Record<string, unknown>) ?? {},
      publishedAt: row.publishedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      questionCount: row.questions?.length ?? r.questionCount ?? 0,
      hasSolutions: r.hasSolutions ?? false,
      priceCents: r.priceCents ?? null,
      packageId: r.packageId ?? null,
      educator: r.educator ?? null,
      _count: r._count ?? null,
      questions: row.questions.map((q) => ({
        id: q.id,
        testId: row.id,
        content: q.content,
        order: q.order,
        mediaUrl: (q as any).mediaUrl ?? null,
        options: q.options.map((o) => ({
          id: o.id,
          questionId: q.id,
          content: o.content,
          isCorrect: o.isCorrect,
          mediaUrl: (o as any).mediaUrl ?? null,
        })),
        solutionText: (q as any).solutionText ?? null,
        solutionMediaUrl: (q as any).solutionMediaUrl ?? null,
      })),
    };
  }
}
