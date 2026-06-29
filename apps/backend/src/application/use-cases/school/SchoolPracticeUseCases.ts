/**
 * E-Sınıf — Serbest Alıştırma (Keşfet).
 *
 * Öğrenci, kendi sınıf seviyesindeki TÜM sınavları (öğretmen ödev olarak atamasa bile)
 * serbestçe çözebilir. Ödev akışından (SchoolAssignment) BAĞIMSIZ, exam-scoped:
 *  - TEST/WRITTEN → SchoolSubmission(kind=PRACTICE, examId dolu, assignmentId null).
 *  - TUNNEL → zaten exam-scoped (SchoolTunnelAttempt); burada yalnız listelenir,
 *    çözme mevcut schoolTunnel akışıyla yürür.
 *
 * Erişim kapısı: aynı okul + sınavın gradeLevel'i öğrencinin sınıf seviyesine eşit
 * (veya null = "genel"). Son tarih yok; sonuç teslimden hemen sonra görünür (SUBMIT).
 * Ödev akışı (SchoolStudentUseCases) HİÇ değişmez — bu paralel, additive bir katmandır.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '../../../infrastructure/database/prisma';
import { prismaRead } from '../../../infrastructure/database/dbRouter';
import { AppError } from '../../errors/AppError';
import { logger } from '../../../infrastructure/logger/logger';
import { resolveSchoolContext, requireSchoolRole } from './schoolHelpers';
import { buildExamSnapshot, resolveResultQuestions } from './schoolExamSnapshot';

/** Öğrencinin sınıf seviyesi (Classroom.gradeLevel). Sınıfı yoksa null. */
async function studentGradeLevel(classroomId: string | null): Promise<number | null> {
  if (!classroomId) return null;
  const c = await prisma.classroom.findUnique({ where: { id: classroomId }, select: { gradeLevel: true } });
  return c?.gradeLevel ?? null;
}

/** Alıştırma için sınavı yükle + yetki: aynı okul + öğrencinin seviyesi (veya genel). */
async function loadPracticeExam(examId: string, schoolId: string, grade: number | null) {
  const exam = await prisma.schoolExam.findFirst({
    where: { id: examId, schoolId, isArchived: false },
    include: { questions: { orderBy: { order: 'asc' }, include: { options: { orderBy: { order: 'asc' } } } } },
  });
  if (!exam) throw new AppError('EXAM_NOT_FOUND', 'Sınav bulunamadı', 404);
  if (exam.gradeLevel != null && grade != null && exam.gradeLevel !== grade) {
    throw new AppError('LEVEL_MISMATCH', 'Bu sınav seviyenize ait değil', 403);
  }
  if (exam.questions.length === 0) throw new AppError('EXAM_EMPTY', 'Bu sınavda soru yok', 409);
  return exam;
}

/** Keşfet — öğrencinin seviyesindeki tüm (yayına hazır) sınavlar + alıştırma durumu. */
export class ListStudentLevelExamsUseCase {
  async execute(
    input: { q?: string; examType?: string; subject?: string; page?: number; pageSize?: number } = {},
    actorId?: string,
  ) {
    const ctx = await resolveSchoolContext(actorId);
    requireSchoolRole(ctx, 'STUDENT');
    const grade = await studentGradeLevel(ctx.classroomId);
    const emptyCounts = { TEST: 0, TUNNEL: 0, WRITTEN: 0 };
    if (grade == null) return { items: [], total: 0, gradeLevel: null, counts: emptyCounts, subjects: [] };

    const db = prismaRead();
    const page = Math.max(1, Math.floor(input.page ?? 1));
    const pageSize = Math.min(50, Math.max(1, Math.floor(input.pageSize ?? 8)));
    const examType = (['TEST', 'TUNNEL', 'WRITTEN'] as const).includes(input.examType as never)
      ? (input.examType as string)
      : 'TEST';
    const subject = (input.subject ?? '').trim();
    const q = (input.q ?? '').trim();

    // Seviye kapsamlı temel filtre (tür/ders/arama HARİÇ) — facet sayımları bundan türer.
    const baseWhere: Prisma.SchoolExamWhereInput = {
      schoolId: ctx.schoolId,
      isArchived: false,
      OR: [{ gradeLevel: grade }, { gradeLevel: null }],
      questions: { some: {} }, // en az 1 soru
    };
    const examTypeFilter = examType as Prisma.SchoolExamWhereInput['examType'];

    // Facet: tür sayıları (sekme rozetleri) + aktif türün dersleri (Ders seçeneği)
    const grouped = await db.schoolExam.groupBy({ by: ['examType'], where: baseWhere, _count: { _all: true } });
    const counts = { ...emptyCounts };
    for (const g of grouped) if (g.examType in counts) (counts as Record<string, number>)[g.examType] = g._count._all;

    const subjectRows = await db.schoolExam.findMany({
      where: { ...baseWhere, examType: examTypeFilter },
      select: { subject: true },
      distinct: ['subject'],
    });
    const subjects = subjectRows
      .map((r) => r.subject)
      .filter((s): s is string => !!s)
      .sort((a, b) => a.localeCompare(b, 'tr'));

    // Sayfa sorgusu (tür + ders + arama + offset)
    const pageWhere: Prisma.SchoolExamWhereInput = {
      ...baseWhere,
      examType: examTypeFilter,
      ...(subject ? { subject } : {}),
      ...(q ? { title: { contains: q, mode: 'insensitive' } } : {}),
    };
    const [total, exams] = await Promise.all([
      db.schoolExam.count({ where: pageWhere }),
      db.schoolExam.findMany({
        where: pageWhere,
        orderBy: [{ createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true, title: true, examType: true, subject: true, topic: true,
          durationMinutes: true, gradeLevel: true, _count: { select: { questions: true } },
        },
      }),
    ]);
    const examIds = exams.map((e) => e.id);

    // TEST/WRITTEN alıştırma teslimleri
    const subs = await db.schoolSubmission.findMany({
      where: { kind: 'PRACTICE', studentId: actorId as string, examId: { in: examIds } },
      select: { examId: true, status: true, totalScore: true, maxScore: true },
    });
    const subByExam = new Map(subs.map((s) => [s.examId as string, s]));

    // TUNNEL ilerlemesi (SchoolTunnelAttempt)
    const tunnelAttempts = await db.schoolTunnelAttempt.findMany({
      where: { studentId: actorId as string, examId: { in: examIds } },
      select: { examId: true, status: true },
    });
    const tunnelByExam = new Map(tunnelAttempts.map((t) => [t.examId, t]));

    const items = exams.map((e) => {
      if (e.examType === 'TUNNEL') {
        const t = tunnelByExam.get(e.id);
        return {
          id: e.id, title: e.title, examType: e.examType, subject: e.subject, topic: e.topic,
          questionCount: e._count.questions, durationMinutes: e.durationMinutes,
          status: t?.status ?? null, score: null, maxScore: null,
        };
      }
      const s = subByExam.get(e.id);
      const submitted = s?.status === 'SUBMITTED' || s?.status === 'GRADED';
      return {
        id: e.id, title: e.title, examType: e.examType, subject: e.subject, topic: e.topic,
        questionCount: e._count.questions, durationMinutes: e.durationMinutes,
        status: s?.status ?? null,
        score: submitted ? s?.totalScore ?? null : null,
        maxScore: submitted ? s?.maxScore ?? null : null,
      };
    });
    return { items, total, gradeLevel: grade, counts, subjects };
  }
}

/** Alıştırma çözme ekranı — sorular (DOĞRU CEVAP SIZDIRMAZ) + kayıtlı cevaplar. */
export class GetPracticeSolveUseCase {
  async execute(examId: string, actorId?: string) {
    const ctx = await resolveSchoolContext(actorId);
    requireSchoolRole(ctx, 'STUDENT');
    const grade = await studentGradeLevel(ctx.classroomId);
    const exam = await loadPracticeExam(examId, ctx.schoolId, grade);

    // TUNNEL → exam-scoped tünel akışı (schoolTunnel) ile çözülür; burada meta yeter.
    if (exam.examType === 'TUNNEL') {
      return { id: exam.id, title: exam.title, examId: exam.id, examType: 'TUNNEL', open: true, submitted: false, questions: [] };
    }

    const sub = await prisma.schoolSubmission.findUnique({
      where: { examId_studentId: { examId, studentId: actorId as string } },
      include: { answers: true },
    });
    const submitted = sub?.status === 'SUBMITTED' || sub?.status === 'GRADED';
    const answerByQ = new Map((sub?.answers ?? []).map((x) => [x.questionId, x]));
    const isChoice = exam.examType === 'TEST';

    return {
      id: exam.id,
      title: exam.title,
      examId: exam.id,
      examType: exam.examType,
      durationMinutes: exam.durationMinutes,
      open: true, // alıştırmada son tarih yok
      submitted,
      submissionId: sub?.id ?? null,
      submissionStatus: sub?.status ?? null,
      questions: exam.questions.map((q) => ({
        id: q.id,
        content: q.content,
        mediaUrl: q.mediaUrl,
        points: q.points,
        options: isChoice ? q.options.map((o) => ({ id: o.id, content: o.content })) : [],
        selectedOptionId: answerByQ.get(q.id)?.selectedOptionId ?? null,
        textAnswer: answerByQ.get(q.id)?.textAnswer ?? null,
        imageUrls: answerByQ.get(q.id)?.imageUrls ?? [],
      })),
    };
  }
}

async function getPracticeSubmission(examId: string, actorId: string) {
  return prisma.schoolSubmission.findUnique({ where: { examId_studentId: { examId, studentId: actorId } } });
}

export class StartPracticeUseCase {
  async execute(examId: string, actorId?: string) {
    const ctx = await resolveSchoolContext(actorId);
    requireSchoolRole(ctx, 'STUDENT');
    const grade = await studentGradeLevel(ctx.classroomId);
    const exam = await loadPracticeExam(examId, ctx.schoolId, grade);
    if (exam.examType === 'TUNNEL') throw new AppError('USE_TUNNEL_FLOW', 'Tünel ayrı akışla çözülür', 400);

    const existing = await getPracticeSubmission(examId, actorId as string);
    if (existing) {
      if (existing.status !== 'IN_PROGRESS') {
        // Tekrar çözmek için sıfırla (alıştırma — istediğin kadar dene)
        await prisma.$transaction([
          prisma.schoolSubmissionAnswer.deleteMany({ where: { submissionId: existing.id } }),
          // questionsSnapshot dokunulmaz — bir sonraki teslim üzerine yazar (sonuç yalnız teslim sonrası görünür).
          prisma.schoolSubmission.update({ where: { id: existing.id }, data: { status: 'IN_PROGRESS', submittedAt: null, totalScore: null, maxScore: null } }),
        ]);
        return { submissionId: existing.id, resumed: false, reset: true };
      }
      return { submissionId: existing.id, resumed: true };
    }
    const created = await prisma.schoolSubmission.create({ data: { examId, studentId: actorId as string, kind: 'PRACTICE' } });
    logger.info('school.practice.started', { examId, actorId });
    return { submissionId: created.id, resumed: false };
  }
}

export class SavePracticeAnswerUseCase {
  async execute(examId: string, input: { questionId: string; selectedOptionId?: string | null; textAnswer?: string | null; imageUrls?: string[] }, actorId?: string) {
    const ctx = await resolveSchoolContext(actorId);
    requireSchoolRole(ctx, 'STUDENT');
    const sub = await getPracticeSubmission(examId, actorId as string);
    if (!sub) throw new AppError('NOT_STARTED', 'Önce alıştırmayı başlatın', 409);
    if (sub.status !== 'IN_PROGRESS') throw new AppError('ALREADY_SUBMITTED', 'Teslim edilmiş alıştırma değiştirilemez', 409);
    if (!input.questionId) throw new AppError('QUESTION_REQUIRED', 'Soru gerekli', 400);
    const imageUrls = Array.isArray(input.imageUrls) ? input.imageUrls.filter((u) => typeof u === 'string' && u.trim()).slice(0, 5) : [];

    await prisma.schoolSubmissionAnswer.upsert({
      where: { submissionId_questionId: { submissionId: sub.id, questionId: input.questionId } },
      create: { submissionId: sub.id, questionId: input.questionId, selectedOptionId: input.selectedOptionId ?? null, textAnswer: (input.textAnswer ?? '').trim() || null, imageUrls },
      update: { selectedOptionId: input.selectedOptionId ?? null, textAnswer: (input.textAnswer ?? '').trim() || null, imageUrls },
    });
    return { ok: true };
  }
}

export class SubmitPracticeUseCase {
  async execute(examId: string, actorId?: string) {
    const ctx = await resolveSchoolContext(actorId);
    requireSchoolRole(ctx, 'STUDENT');
    const grade = await studentGradeLevel(ctx.classroomId);
    const exam = await loadPracticeExam(examId, ctx.schoolId, grade);
    if (exam.examType === 'TUNNEL') throw new AppError('USE_TUNNEL_FLOW', 'Tünel ayrı akışla çözülür', 400);

    const sub = await prisma.schoolSubmission.findUnique({ where: { examId_studentId: { examId, studentId: actorId as string } }, include: { answers: true } });
    if (!sub) throw new AppError('NOT_STARTED', 'Önce alıştırmayı başlatın', 409);
    if (sub.status !== 'IN_PROGRESS') throw new AppError('ALREADY_SUBMITTED', 'Zaten teslim edildi', 409);

    const isChoice = exam.examType === 'TEST';
    const answerByQ = new Map(sub.answers.map((x) => [x.questionId, x]));
    let totalScore = 0;
    let maxScore = 0;

    await prisma.$transaction(async (tx) => {
      if (isChoice) {
        for (const q of exam.questions) {
          maxScore += q.points;
          const ans = answerByQ.get(q.id);
          const correctOpt = q.options.find((o) => o.isCorrect);
          const correct = !!ans?.selectedOptionId && ans.selectedOptionId === correctOpt?.id;
          const earned = correct ? q.points : 0;
          totalScore += earned;
          if (ans) {
            await tx.schoolSubmissionAnswer.update({ where: { id: ans.id }, data: { isCorrect: correct, earnedPoints: earned, maxPoints: q.points } });
          } else {
            await tx.schoolSubmissionAnswer.create({ data: { submissionId: sub.id, questionId: q.id, isCorrect: false, earnedPoints: 0, maxPoints: q.points } });
          }
        }
      } else {
        for (const q of exam.questions) maxScore += q.points;
      }
      await tx.schoolSubmission.update({
        where: { id: sub.id },
        data: {
          // WRITTEN alıştırmada öğretmen puanlaması yok → öz-değerlendirme; SUBMITTED kalır.
          status: (isChoice ? 'GRADED' : 'SUBMITTED') as any,
          submittedAt: new Date(),
          totalScore: isChoice ? totalScore : null,
          maxScore,
          // Çözüldüğü versiyonu dondur (sınav sonradan güncellense de sonuç sabit).
          questionsSnapshot: buildExamSnapshot(exam.questions) as object,
        },
      });
    });

    logger.info('school.practice.submitted', { examId, actorId, autoGraded: isChoice, totalScore: isChoice ? totalScore : null });
    return { status: isChoice ? 'GRADED' : 'SUBMITTED', totalScore: isChoice ? totalScore : null, maxScore };
  }
}

/** Alıştırma sonucu — teslimden hemen sonra görünür (SUBMIT). Soru-bazlı doğru/çözüm. */
export class GetPracticeResultUseCase {
  async execute(examId: string, actorId?: string) {
    const ctx = await resolveSchoolContext(actorId);
    requireSchoolRole(ctx, 'STUDENT');
    const grade = await studentGradeLevel(ctx.classroomId);
    const exam = await loadPracticeExam(examId, ctx.schoolId, grade);

    const sub = await prisma.schoolSubmission.findUnique({ where: { examId_studentId: { examId, studentId: actorId as string } }, include: { answers: true } });
    const submitted = sub?.status === 'SUBMITTED' || sub?.status === 'GRADED';
    if (!sub || !submitted) throw new AppError('NOT_SUBMITTED', 'Henüz teslim edilmedi', 409);

    const isChoice = exam.examType === 'TEST';
    const answerByQ = new Map(sub.answers.map((x) => [x.questionId, x]));
    // Çözüldüğü versiyon: snapshot varsa onu, yoksa canlı sınav (eski teslimler).
    const resultQuestions = resolveResultQuestions(sub.questionsSnapshot, exam.questions);
    return {
      visible: true,
      status: sub.status,
      examType: exam.examType,
      title: exam.title,
      totalScore: sub.totalScore,
      maxScore: sub.maxScore,
      feedback: null,
      questions: resultQuestions.map((q) => {
        const ans = answerByQ.get(q.id);
        return {
          id: q.id,
          content: q.content,
          points: q.points,
          solutionText: q.solutionText ?? null,
          ...(isChoice
            ? {
                options: q.options.map((o) => ({ id: o.id, content: o.content, isCorrect: o.isCorrect })),
                selectedOptionId: ans?.selectedOptionId ?? null,
                isCorrect: ans?.isCorrect ?? null,
                earnedPoints: ans?.earnedPoints ?? null,
              }
            : {
                textAnswer: ans?.textAnswer ?? null,
                imageUrls: ans?.imageUrls ?? [],
                earnedPoints: ans?.earnedPoints ?? null,
              }),
        };
      }),
    };
  }
}
