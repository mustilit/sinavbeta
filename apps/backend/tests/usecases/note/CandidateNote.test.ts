/**
 * Aday not (CandidateNote) use-case testleri.
 * Create / List / Update / Delete / Facets — sahiplik, adres snapshot, cursor.
 */

jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    examQuestion: { findUnique: jest.fn() },
    examTest: { findUnique: jest.fn() },
    candidateNote: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      groupBy: jest.fn(),
      count: jest.fn(),
    },
  },
}));

import { CreateCandidateNoteUseCase } from '../../../src/application/use-cases/note/CreateCandidateNoteUseCase';
import { ListCandidateNotesUseCase } from '../../../src/application/use-cases/note/ListCandidateNotesUseCase';
import { UpdateCandidateNoteUseCase } from '../../../src/application/use-cases/note/UpdateCandidateNoteUseCase';
import { DeleteCandidateNoteUseCase } from '../../../src/application/use-cases/note/DeleteCandidateNoteUseCase';
import { GetCandidateNoteFacetsUseCase } from '../../../src/application/use-cases/note/GetCandidateNoteFacetsUseCase';
import { prisma } from '../../../src/infrastructure/database/prisma';

const p = prisma as any;
const now = new Date('2026-06-13T10:00:00.000Z');

function noteRow(over: Record<string, unknown> = {}) {
  return {
    id: 'n1',
    body: 'metin',
    testId: null,
    questionId: null,
    topicId: null,
    examTypeId: null,
    attemptId: null,
    testTitle: null,
    topicName: null,
    examTypeName: null,
    questionExcerpt: null,
    questionOrder: null,
    createdAt: now,
    updatedAt: now,
    ...over,
  };
}

beforeEach(() => jest.clearAllMocks());

describe('CreateCandidateNoteUseCase', () => {
  it('actorId yoksa UNAUTHORIZED', async () => {
    await expect(new CreateCandidateNoteUseCase().execute({ body: 'x' }, null)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('boş body → NOTE_EMPTY', async () => {
    p.user.findUnique.mockResolvedValue({ id: 'u1', tenantId: 't1' });
    await expect(
      new CreateCandidateNoteUseCase().execute({ body: '   ' }, 'u1'),
    ).rejects.toMatchObject({ code: 'NOTE_EMPTY' });
  });

  it('serbest not (id yok) → snapshot boş, tenantId adaydan', async () => {
    p.user.findUnique.mockResolvedValue({ id: 'u1', tenantId: 't1' });
    p.candidateNote.create.mockImplementation(({ data }: any) => noteRow({ ...data, id: 'n1' }));
    const r = await new CreateCandidateNoteUseCase().execute({ body: 'serbest' }, 'u1');
    expect(p.candidateNote.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tenantId: 't1', candidateId: 'u1', body: 'serbest', testId: null, questionId: null }) }),
    );
    expect(r.testTitle).toBeNull();
    expect(r.createdAt).toBe(now.toISOString());
  });

  it('soru-bağlı not → soru→test→konu/sınav türü snapshot doldurulur', async () => {
    p.user.findUnique.mockResolvedValue({ id: 'u1', tenantId: 't1' });
    p.examQuestion.findUnique.mockResolvedValue({
      id: 'q1',
      content: 'A'.repeat(300),
      order: 5,
      testId: 'test1',
      test: {
        id: 'test1',
        title: 'TYT Deneme',
        tenantId: 't1',
        topicId: 'top1',
        examTypeId: 'et1',
        topic: { name: 'Matematik' },
        examType: { name: 'TYT' },
      },
    });
    p.candidateNote.create.mockImplementation(({ data }: any) => noteRow({ ...data, id: 'n1' }));
    const r = await new CreateCandidateNoteUseCase().execute({ body: 'soru notu', questionId: 'q1' }, 'u1');
    expect(r.testId).toBe('test1');
    expect(r.testTitle).toBe('TYT Deneme');
    expect(r.topicName).toBe('Matematik');
    expect(r.examTypeName).toBe('TYT');
    expect(r.questionOrder).toBe(5);
    expect(r.questionExcerpt?.length).toBe(160); // kırpma
  });

  it('ekranda görünen soru numarası (questionOrder) DB order yerine saklanır', async () => {
    p.user.findUnique.mockResolvedValue({ id: 'u1', tenantId: 't1' });
    p.examQuestion.findUnique.mockResolvedValue({
      id: 'q1', content: 'soru', order: 5, testId: 'test1',
      test: { id: 'test1', title: 'T', tenantId: 't1', topicId: null, examTypeId: null, topic: null, examType: null },
    });
    p.candidateNote.create.mockImplementation(({ data }: any) => noteRow({ ...data, id: 'n1' }));
    // DB order=5 ama aday ekranda "Soru 2" gördü → 2 saklanmalı
    const r = await new CreateCandidateNoteUseCase().execute(
      { body: 'x', questionId: 'q1', questionOrder: 2 }, 'u1');
    expect(r.questionOrder).toBe(2);
  });

  it('questionOrder verilmezse DB order fallback', async () => {
    p.user.findUnique.mockResolvedValue({ id: 'u1', tenantId: 't1' });
    p.examQuestion.findUnique.mockResolvedValue({
      id: 'q1', content: 'soru', order: 7, testId: 'test1',
      test: { id: 'test1', title: 'T', tenantId: 't1', topicId: null, examTypeId: null, topic: null, examType: null },
    });
    p.candidateNote.create.mockImplementation(({ data }: any) => noteRow({ ...data, id: 'n1' }));
    const r = await new CreateCandidateNoteUseCase().execute({ body: 'x', questionId: 'q1' }, 'u1');
    expect(r.questionOrder).toBe(7);
  });

  it('geçersiz questionId → NOTE_TARGET_NOT_FOUND', async () => {
    p.user.findUnique.mockResolvedValue({ id: 'u1', tenantId: 't1' });
    p.examQuestion.findUnique.mockResolvedValue(null);
    await expect(
      new CreateCandidateNoteUseCase().execute({ body: 'x', questionId: 'yok' }, 'u1'),
    ).rejects.toMatchObject({ code: 'NOTE_TARGET_NOT_FOUND' });
  });
});

describe('ListCandidateNotesUseCase', () => {
  it('hasMore: limit+1 satır gelince nextCursor dolu', async () => {
    const rows = Array.from({ length: 3 }, (_, i) => noteRow({ id: `n${i}` }));
    p.candidateNote.findMany.mockResolvedValue(rows);
    const r = await new ListCandidateNotesUseCase().execute('u1', { limit: 2 });
    expect(r.items).toHaveLength(2);
    expect(r.nextCursor).toEqual({ id: 'n1' });
  });

  it('son sayfa → nextCursor null', async () => {
    p.candidateNote.findMany.mockResolvedValue([noteRow({ id: 'n0' })]);
    const r = await new ListCandidateNotesUseCase().execute('u1', { limit: 20 });
    expect(r.items).toHaveLength(1);
    expect(r.nextCursor).toBeNull();
  });

  it('metin filtresi → body contains (insensitive) where', async () => {
    p.candidateNote.findMany.mockResolvedValue([]);
    await new ListCandidateNotesUseCase().execute('u1', { q: 'türev', topicId: 'top1' });
    expect(p.candidateNote.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          candidateId: 'u1',
          topicId: 'top1',
          body: { contains: 'türev', mode: 'insensitive' },
        }),
      }),
    );
  });
});

describe('UpdateCandidateNoteUseCase', () => {
  it('başka adayın notu → FORBIDDEN', async () => {
    p.candidateNote.findUnique.mockResolvedValue({ id: 'n1', candidateId: 'other' });
    await expect(new UpdateCandidateNoteUseCase().execute('n1', 'yeni', 'u1')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(p.candidateNote.update).not.toHaveBeenCalled();
  });

  it('sahibi günceller → body değişir', async () => {
    p.candidateNote.findUnique.mockResolvedValue({ id: 'n1', candidateId: 'u1' });
    p.candidateNote.update.mockResolvedValue(noteRow({ id: 'n1', body: 'yeni' }));
    const r = await new UpdateCandidateNoteUseCase().execute('n1', 'yeni', 'u1');
    expect(r.body).toBe('yeni');
    expect(p.candidateNote.update).toHaveBeenCalledWith({ where: { id: 'n1' }, data: { body: 'yeni' } });
  });

  it('not yok → NOTE_NOT_FOUND', async () => {
    p.candidateNote.findUnique.mockResolvedValue(null);
    await expect(new UpdateCandidateNoteUseCase().execute('n1', 'x', 'u1')).rejects.toMatchObject({
      code: 'NOTE_NOT_FOUND',
    });
  });
});

describe('DeleteCandidateNoteUseCase', () => {
  it('başka adayın notu → FORBIDDEN, delete çağrılmaz', async () => {
    p.candidateNote.findUnique.mockResolvedValue({ id: 'n1', candidateId: 'other' });
    await expect(new DeleteCandidateNoteUseCase().execute('n1', 'u1')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(p.candidateNote.delete).not.toHaveBeenCalled();
  });

  it('sahibi siler → ok', async () => {
    p.candidateNote.findUnique.mockResolvedValue({ id: 'n1', candidateId: 'u1' });
    p.candidateNote.delete.mockResolvedValue({});
    const r = await new DeleteCandidateNoteUseCase().execute('n1', 'u1');
    expect(r).toEqual({ ok: true });
  });
});

describe('GetCandidateNoteFacetsUseCase', () => {
  it('groupBy sonuçlarını {id,name/title} listelerine map eder + hasGeneral', async () => {
    p.candidateNote.groupBy
      .mockResolvedValueOnce([{ topicId: 'top1', topicName: 'Matematik' }]) // topics
      .mockResolvedValueOnce([{ testId: 'test1', testTitle: 'TYT Deneme' }]) // tests
      .mockResolvedValueOnce([{ examTypeId: 'et1', examTypeName: 'TYT' }]); // examTypes
    p.candidateNote.count.mockResolvedValue(2);
    const r = await new GetCandidateNoteFacetsUseCase().execute('u1');
    expect(r.topics).toEqual([{ id: 'top1', name: 'Matematik' }]);
    expect(r.tests).toEqual([{ id: 'test1', title: 'TYT Deneme' }]);
    expect(r.examTypes).toEqual([{ id: 'et1', name: 'TYT' }]);
    expect(r.hasGeneral).toBe(true);
  });
});
