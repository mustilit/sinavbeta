// @ts-nocheck
import { ExamTest, ExamQuestion, ExamOption } from '../../domain/entities/Exam';
import { ExamWithQuestions, IExamRepository } from '../../domain/interfaces/IExamRepository';

/**
 * In-memory Exam Repository - geliştirme/test
 */
export class InMemoryExamRepository implements IExamRepository {
  private tests: Map<string, ExamWithQuestions> = new Map();

  async findById(id: string): Promise<ExamWithQuestions | null> {
    return this.tests.get(id) ?? null;
  }

  async save(
    test: ExamTest,
    questions: (ExamQuestion & { options: ExamOption[] })[]
  ): Promise<ExamWithQuestions> {
    const full: ExamWithQuestions = {
      ...test,
      questions: questions.map((q) => ({
        ...q,
        testId: test.id,
        options: q.options.map((o) => ({ ...o, questionId: q.id })),
      })),
    };
    this.tests.set(test.id, full);
    return full;
  }

  async publish(id: string): Promise<ExamWithQuestions | null> {
    const test = this.tests.get(id);
    if (!test) return null;
    const published = { ...test, publishedAt: new Date() };
    this.tests.set(id, published);
    return published;
  }

  async unpublish(id: string): Promise<ExamWithQuestions | null> {
    const test = this.tests.get(id);
    if (!test) return null;
    const unpublished = { ...test, publishedAt: null };
    this.tests.set(id, unpublished);
    return unpublished;
  }

  async findAll(): Promise<ExamWithQuestions[]> {
    return Array.from(this.tests.values());
  }

  async findPublished(filters?: {
    examTypeId?: string;
    topicId?: string;
    educatorId?: string;
    isTimed?: boolean;
    minPriceCents?: number;
    maxPriceCents?: number;
    page?: number;
    limit?: number;
    sortBy?: 'publishedAt' | 'priceCents' | 'createdAt';
    order?: 'asc' | 'desc';
  }): Promise<{ items: ExamWithQuestions[]; total: number }> {
    let items = Array.from(this.tests.values()).filter((t) => t.status === 'PUBLISHED' || t.publishedAt != null);
    if (filters) {
      if (filters.examTypeId) {
        items = items.filter((i) => (i as any).examTypeId === filters.examTypeId);
      }
      if (filters.topicId) {
        items = items.filter((i) => (i as any).topicId === filters.topicId);
      }
      if (filters.educatorId) {
        items = items.filter((i) => (i as any).educatorId === filters.educatorId);
      }
      if (typeof filters.isTimed === 'boolean') {
        items = items.filter((i) => i.isTimed === filters.isTimed);
      }
      const minPrice = filters.minPriceCents;
      if (typeof minPrice === 'number') {
        items = items.filter((i) => typeof (i as any).priceCents === 'number' && (i as any).priceCents >= minPrice);
      }
      const maxPrice = filters.maxPriceCents;
      if (typeof maxPrice === 'number') {
        items = items.filter((i) => typeof (i as any).priceCents === 'number' && (i as any).priceCents <= maxPrice);
      }
    }
    const total = items.length;
    // sorting
    const sortBy = filters?.sortBy ?? 'publishedAt';
    const order = filters?.order === 'asc' ? 1 : -1;
    items.sort((a, b) => {
      const amap: any = a as any;
      const bmap: any = b as any;
      const fieldMap: Record<string, string> = { publishedAt: 'publishedAt', priceCents: 'priceCents', createdAt: 'createdAt' };
      const field = fieldMap[sortBy] ?? 'publishedAt';
      const va = amap[field];
      const vb = bmap[field];
      if (va == null && vb == null) return 0;
      if (va == null) return 1 * order;
      if (vb == null) return -1 * order;
      return va > vb ? 1 * order : va < vb ? -1 * order : 0;
    });
    const page = filters?.page && filters.page > 0 ? filters.page : 1;
    const limit = filters?.limit && filters.limit > 0 ? filters.limit : 20;
    const start = (page - 1) * limit;
    const paged = items.slice(start, start + limit);
    return { items: paged, total };
  }

  async addQuestion(testId: string, question: ExamQuestion & { options: ExamOption[] }): Promise<ExamWithQuestions> {
    const existing = this.tests.get(testId);
    if (!existing) throw new Error('TEST_NOT_FOUND');
    const q = { ...question, testId };
    const updated = { ...existing, questions: [...(existing.questions ?? []), q] };
    this.tests.set(testId, updated);
    return updated;
  }

  async updateQuestion(questionId: string, updates: Partial<ExamQuestion & { options?: ExamOption[] }>): Promise<ExamQuestion | null> {
    for (const [tid, t] of this.tests) {
      const idx = t.questions.findIndex(q => q.id === questionId);
      if (idx >= 0) {
        const old = t.questions[idx];
        const updatedQ = { ...old, ...updates };
        t.questions[idx] = updatedQ;
        this.tests.set(tid, t);
        return updatedQ;
      }
    }
    return null;
  }

  async updateTestMetadata(
    testId: string,
    updates: {
      title?: string;
      priceCents?: number;
      duration?: number;
      isTimed?: boolean;
      campaignPriceCents?: number | null;
      campaignValidFrom?: Date | null;
      campaignValidUntil?: Date | null;
    },
  ): Promise<ExamWithQuestions | null> {
    const t = this.tests.get(testId);
    if (!t) return null;
    const data = { ...t } as any;
    if (updates.title !== undefined) data.title = updates.title;
    if (updates.priceCents !== undefined) data.priceCents = updates.priceCents;
    if (updates.duration !== undefined) data.duration = updates.duration;
    if (updates.isTimed !== undefined) data.isTimed = updates.isTimed;
    if (updates.campaignPriceCents !== undefined) data.campaignPriceCents = updates.campaignPriceCents;
    if (updates.campaignValidFrom !== undefined) data.campaignValidFrom = updates.campaignValidFrom;
    if (updates.campaignValidUntil !== undefined) data.campaignValidUntil = updates.campaignValidUntil;
    this.tests.set(testId, data);
    return data;
  }

  async findCorrectOptionIdsByQuestionIds(questionIds: string[]): Promise<Record<string, string[]>> {
    const map: Record<string, string[]> = {};
    for (const qid of questionIds) map[qid] = [];
    for (const t of this.tests.values()) {
      for (const q of t.questions) {
        if (!questionIds.includes(q.id)) continue;
        for (const o of (q.options ?? [])) {
          if (o.isCorrect) {
            map[q.id] = map[q.id] ?? [];
            map[q.id].push(o.id);
          }
        }
      }
    }
    return map;
  }

  async findQuestionById(questionId: string): Promise<{ id: string; testId: string } | null> {
    for (const t of this.tests.values()) {
      const q = t.questions.find((x) => x.id === questionId);
      if (q) return { id: q.id, testId: t.id };
    }
    return null;
  }

  async findOptionById(optionId: string): Promise<{ id: string; questionId: string; testId: string } | null> {
    for (const t of this.tests.values()) {
      for (const q of t.questions) {
        const o = q.options?.find((x) => x.id === optionId);
        if (o) return { id: o.id, questionId: q.id, testId: t.id };
      }
    }
    return null;
  }

  async updateOption(optionId: string, updates: { content?: string; isCorrect?: boolean }): Promise<ExamOption | null> {
    for (const t of this.tests.values()) {
      for (const q of t.questions) {
        const o = q.options?.find((x) => x.id === optionId);
        if (o) {
          if (updates.content !== undefined) o.content = updates.content;
          if (updates.isCorrect !== undefined) o.isCorrect = updates.isCorrect;
          return o;
        }
      }
    }
    return null;
  }

  async listPublishedByFollowed(opts: { educatorIds?: string[]; examTypeIds?: string[]; limit: number; examTypeId?: string | null }): Promise<ExamWithQuestions[]> {
    let items = Array.from(this.tests.values()).filter((t) => t.status === 'PUBLISHED' || t.publishedAt != null);
    if (opts.educatorIds?.length) {
      items = items.filter((i) => opts.educatorIds!.includes((i as any).educatorId));
    }
    if (opts.examTypeIds?.length) {
      items = items.filter((i) => opts.examTypeIds!.includes((i as any).examTypeId));
    }
    if (opts.examTypeId) {
      items = items.filter((i) => (i as any).examTypeId === opts.examTypeId);
    }
    return items.slice(0, opts.limit);
  }

  async listPublishedFallback(opts: { excludeIds?: string[]; limit: number; examTypeId?: string | null }): Promise<ExamWithQuestions[]> {
    let items = Array.from(this.tests.values()).filter((t) => t.status === 'PUBLISHED' || t.publishedAt != null);
    if (opts.excludeIds?.length) {
      items = items.filter((i) => !opts.excludeIds!.includes(i.id));
    }
    if (opts.examTypeId) {
      items = items.filter((i) => (i as any).examTypeId === opts.examTypeId);
    }
    return items.slice(0, opts.limit);
  }

  async listPublishedByEducator(opts: { educatorId: string; examTypeId?: string | null; page?: number; limit?: number; sortBy?: 'publishedAt' | 'price' | 'createdAt'; order?: 'asc' | 'desc' }): Promise<{ items: ExamWithQuestions[]; total: number }> {
    let items = Array.from(this.tests.values()).filter((t) => (t.status === 'PUBLISHED' || t.publishedAt != null) && (t as any).educatorId === opts.educatorId);
    if (opts.examTypeId) {
      items = items.filter((i) => (i as any).examTypeId === opts.examTypeId);
    }
    const sortBy = opts.sortBy ?? 'publishedAt';
    const order = opts.order === 'asc' ? 1 : -1;
    const fieldMap: Record<string, string> = { publishedAt: 'publishedAt', price: 'priceCents', createdAt: 'createdAt' };
    const field = fieldMap[sortBy] ?? 'publishedAt';
    items.sort((a, b) => {
      const va = (a as any)[field];
      const vb = (b as any)[field];
      if (va == null && vb == null) return 0;
      if (va == null) return 1 * order;
      if (vb == null) return -1 * order;
      return va > vb ? 1 * order : va < vb ? -1 * order : 0;
    });
    const total = items.length;
    const page = opts.page && opts.page > 0 ? opts.page : 1;
    const limit = opts.limit && opts.limit > 0 ? opts.limit : 20;
    const start = (page - 1) * limit;
    return { items: items.slice(start, start + limit), total };
  }

  async findByEducatorId(educatorId: string): Promise<ExamWithQuestions[]> {
    return Array.from(this.tests.values())
      .filter((t) => (t as any).educatorId === educatorId)
      .sort((a, b) => new Date((b as any).createdAt).getTime() - new Date((a as any).createdAt).getTime());
  }
}
