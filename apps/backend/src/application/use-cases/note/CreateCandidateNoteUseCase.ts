import { prisma } from '../../../infrastructure/database/prisma';
import { AppError } from '../../errors/AppError';

const MAX_BODY = 5000;
const EXCERPT_LEN = 160;

type Input = {
  body: string;
  // Adresleme — soru-bağlı not için questionId; sadece test bağlamı için testId.
  // İkisi de yoksa serbest ("genel") not.
  questionId?: string | null;
  testId?: string | null;
  attemptId?: string | null;
};

/**
 * Aday kişisel notu oluşturur. Soru-bağlıysa (questionId) soru→test→konu/sınav türü
 * zincirinden adres snapshot'ı doldurulur; sadece testId verilirse test snapshot'ı;
 * hiçbiri yoksa serbest ("genel") not. tenantId her zaman adayın kaydından alınır.
 */
export class CreateCandidateNoteUseCase {
  async execute(input: Input, actorId?: string | null) {
    if (!actorId) throw new AppError('UNAUTHORIZED', 'Giriş gerekli', 401);

    const body = (input.body ?? '').trim();
    if (!body) throw new AppError('NOTE_EMPTY', 'Not boş olamaz', 400);
    if (body.length > MAX_BODY)
      throw new AppError('NOTE_TOO_LONG', `Not en fazla ${MAX_BODY} karakter olabilir`, 400);

    const candidate = await prisma.user.findUnique({
      where: { id: actorId },
      select: { id: true, tenantId: true },
    });
    if (!candidate) throw new AppError('UNAUTHORIZED', 'Kullanıcı bulunamadı', 401);

    // Adres snapshot'ı
    let testId: string | null = null;
    let questionId: string | null = null;
    let topicId: string | null = null;
    let examTypeId: string | null = null;
    let testTitle: string | null = null;
    let topicName: string | null = null;
    let examTypeName: string | null = null;
    let questionExcerpt: string | null = null;
    let questionOrder: number | null = null;

    if (input.questionId) {
      const q = await prisma.examQuestion.findUnique({
        where: { id: input.questionId },
        select: {
          id: true,
          content: true,
          order: true,
          testId: true,
          test: {
            select: {
              id: true,
              title: true,
              tenantId: true,
              topicId: true,
              examTypeId: true,
              topic: { select: { name: true } },
              examType: { select: { name: true } },
            },
          },
        },
      });
      if (!q) throw new AppError('NOTE_TARGET_NOT_FOUND', 'Not eklenecek soru bulunamadı', 404);
      questionId = q.id;
      questionExcerpt = (q.content ?? '').slice(0, EXCERPT_LEN);
      questionOrder = q.order;
      testId = q.test.id;
      testTitle = q.test.title;
      topicId = q.test.topicId;
      topicName = q.test.topic?.name ?? null;
      examTypeId = q.test.examTypeId;
      examTypeName = q.test.examType?.name ?? null;
    } else if (input.testId) {
      const t = await prisma.examTest.findUnique({
        where: { id: input.testId },
        select: {
          id: true,
          title: true,
          topicId: true,
          examTypeId: true,
          topic: { select: { name: true } },
          examType: { select: { name: true } },
        },
      });
      if (!t) throw new AppError('NOTE_TARGET_NOT_FOUND', 'Not eklenecek test bulunamadı', 404);
      testId = t.id;
      testTitle = t.title;
      topicId = t.topicId;
      topicName = t.topic?.name ?? null;
      examTypeId = t.examTypeId;
      examTypeName = t.examType?.name ?? null;
    }

    const note = await prisma.candidateNote.create({
      data: {
        tenantId: candidate.tenantId,
        candidateId: candidate.id,
        body,
        testId,
        questionId,
        topicId,
        examTypeId,
        attemptId: input.attemptId ?? null,
        testTitle,
        topicName,
        examTypeName,
        questionExcerpt,
        questionOrder,
      },
    });

    return serializeNote(note);
  }
}

export function serializeNote(n: {
  id: string;
  body: string;
  testId: string | null;
  questionId: string | null;
  topicId: string | null;
  examTypeId: string | null;
  attemptId: string | null;
  testTitle: string | null;
  topicName: string | null;
  examTypeName: string | null;
  questionExcerpt: string | null;
  questionOrder: number | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: n.id,
    body: n.body,
    testId: n.testId,
    questionId: n.questionId,
    topicId: n.topicId,
    examTypeId: n.examTypeId,
    attemptId: n.attemptId,
    testTitle: n.testTitle,
    topicName: n.topicName,
    examTypeName: n.examTypeName,
    questionExcerpt: n.questionExcerpt,
    questionOrder: n.questionOrder,
    createdAt: n.createdAt.toISOString(),
    updatedAt: n.updatedAt.toISOString(),
  };
}
