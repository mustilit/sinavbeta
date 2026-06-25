/**
 * E-Sınıf — Sprint 3: Öğrenci ödev çözme use-case'leri.
 * Liste → başlat → cevap kaydet (autosave) → teslim (TEST/TUNNEL otomatik puanlanır) → sonuç.
 */
import { prisma } from '../../../infrastructure/database/prisma';
import { AppError } from '../../errors/AppError';
import { logger } from '../../../infrastructure/logger/logger';
import { resolveSchoolContext, requireSchoolRole } from './schoolHelpers';

function isOpen(a: { status: string; availableFrom: Date; dueDate: Date; allowLateSubmit: boolean }): boolean {
  if (a.status === 'CLOSED') return false;
  const now = Date.now();
  if (now < new Date(a.availableFrom).getTime()) return false;
  if (now > new Date(a.dueDate).getTime() && !a.allowLateSubmit) return false;
  return true;
}

/** Sonuç görünür mü (showResultAfter kuralı). */
function resultVisible(a: { showResultAfter: string; dueDate: Date; resultsReleased: boolean }, submitted: boolean): boolean {
  if (!submitted) return false;
  if (a.showResultAfter === 'SUBMIT') return true;
  if (a.showResultAfter === 'DUE_DATE') return Date.now() > new Date(a.dueDate).getTime();
  if (a.showResultAfter === 'TEACHER_RELEASE') return a.resultsReleased;
  return false;
}

export class ListStudentAssignmentsUseCase {
  async execute(input: { filter?: 'pending' | 'submitted' | 'all' }, actorId?: string) {
    const ctx = await resolveSchoolContext(actorId);
    requireSchoolRole(ctx, 'STUDENT');
    if (!ctx.classroomId) return { items: [] };

    const rows = await prisma.schoolAssignment.findMany({
      where: { classroomId: ctx.classroomId, availableFrom: { lte: new Date() } },
      orderBy: [{ dueDate: 'asc' }],
      include: {
        exam: { select: { title: true, examType: true, durationMinutes: true } },
        submissions: { where: { studentId: actorId }, select: { id: true, status: true, totalScore: true, maxScore: true } },
      },
    });
    let items = rows.map((a) => {
      const sub = a.submissions[0] ?? null;
      const submitted = sub?.status === 'SUBMITTED' || sub?.status === 'GRADED';
      return {
        id: a.id,
        title: a.title,
        examType: a.exam.examType,
        durationMinutes: a.exam.durationMinutes,
        dueDate: a.dueDate,
        allowLateSubmit: a.allowLateSubmit,
        open: isOpen(a),
        submissionStatus: sub?.status ?? null,
        submitted,
        score: resultVisible(a, !!submitted) ? sub?.totalScore ?? null : null,
        maxScore: resultVisible(a, !!submitted) ? sub?.maxScore ?? null : null,
      };
    });
    if (input.filter === 'pending') items = items.filter((i) => !i.submitted);
    else if (input.filter === 'submitted') items = items.filter((i) => i.submitted);
    return { items };
  }
}

/** Ödev çözme ekranı — sorular (DOĞRU CEVAP SIZDIRMAZ) + kayıtlı cevaplar. */
export class GetStudentAssignmentUseCase {
  async execute(assignmentId: string, actorId?: string) {
    const ctx = await resolveSchoolContext(actorId);
    requireSchoolRole(ctx, 'STUDENT');
    const a = await prisma.schoolAssignment.findFirst({
      where: { id: assignmentId, classroomId: ctx.classroomId ?? '__none__' },
      include: { exam: { include: { questions: { orderBy: { order: 'asc' }, include: { options: { orderBy: { order: 'asc' } } } } } } },
    });
    if (!a) throw new AppError('ASSIGNMENT_NOT_FOUND', 'Ödev bulunamadı', 404);

    const sub = await prisma.schoolSubmission.findUnique({
      where: { assignmentId_studentId: { assignmentId, studentId: actorId as string } },
      include: { answers: true },
    });
    const submitted = sub?.status === 'SUBMITTED' || sub?.status === 'GRADED';
    const answerByQ = new Map((sub?.answers ?? []).map((x) => [x.questionId, x]));
    const isChoice = a.exam.examType === 'TEST' || a.exam.examType === 'TUNNEL';

    return {
      id: a.id,
      title: a.title,
      examType: a.exam.examType,
      durationMinutes: a.exam.durationMinutes,
      dueDate: a.dueDate,
      open: isOpen(a),
      submitted,
      submissionId: sub?.id ?? null,
      submissionStatus: sub?.status ?? null,
      questions: a.exam.questions.map((q) => ({
        id: q.id,
        content: q.content,
        mediaUrl: q.mediaUrl,
        points: q.points,
        // Şıklar — isCorrect SIZDIRILMAZ
        options: isChoice ? q.options.map((o) => ({ id: o.id, content: o.content })) : [],
        // Öğrencinin mevcut cevabı (resume)
        selectedOptionId: answerByQ.get(q.id)?.selectedOptionId ?? null,
        textAnswer: answerByQ.get(q.id)?.textAnswer ?? null,
        imageUrls: answerByQ.get(q.id)?.imageUrls ?? [],
      })),
    };
  }
}

async function getOpenSubmission(assignmentId: string, actorId: string, classroomId: string | null) {
  const a = await prisma.schoolAssignment.findFirst({
    where: { id: assignmentId, classroomId: classroomId ?? '__none__' },
    select: { id: true, status: true, availableFrom: true, dueDate: true, allowLateSubmit: true },
  });
  if (!a) throw new AppError('ASSIGNMENT_NOT_FOUND', 'Ödev bulunamadı', 404);
  if (!isOpen(a)) throw new AppError('ASSIGNMENT_CLOSED', 'Ödev şu an çözüme kapalı', 409);
  return a;
}

export class StartSubmissionUseCase {
  async execute(assignmentId: string, actorId?: string) {
    const ctx = await resolveSchoolContext(actorId);
    requireSchoolRole(ctx, 'STUDENT');
    await getOpenSubmission(assignmentId, actorId as string, ctx.classroomId);
    const existing = await prisma.schoolSubmission.findUnique({ where: { assignmentId_studentId: { assignmentId, studentId: actorId as string } } });
    if (existing) {
      if (existing.status !== 'IN_PROGRESS') throw new AppError('ALREADY_SUBMITTED', 'Bu ödevi zaten teslim ettiniz', 409);
      return { submissionId: existing.id, resumed: true };
    }
    const created = await prisma.schoolSubmission.create({ data: { assignmentId, studentId: actorId as string } });
    logger.info('school.submission.started', { assignmentId, actorId });
    return { submissionId: created.id, resumed: false };
  }
}

export class SaveAnswerUseCase {
  async execute(assignmentId: string, input: { questionId: string; selectedOptionId?: string | null; textAnswer?: string | null; imageUrls?: string[] }, actorId?: string) {
    const ctx = await resolveSchoolContext(actorId);
    requireSchoolRole(ctx, 'STUDENT');
    await getOpenSubmission(assignmentId, actorId as string, ctx.classroomId);
    const sub = await prisma.schoolSubmission.findUnique({ where: { assignmentId_studentId: { assignmentId, studentId: actorId as string } }, select: { id: true, status: true } });
    if (!sub) throw new AppError('NOT_STARTED', 'Önce ödevi başlatın', 409);
    if (sub.status !== 'IN_PROGRESS') throw new AppError('ALREADY_SUBMITTED', 'Teslim edilmiş ödev değiştirilemez', 409);
    if (!input.questionId) throw new AppError('QUESTION_REQUIRED', 'Soru gerekli', 400);
    // Yazılı foto cevap: en fazla 5 görsel
    const imageUrls = Array.isArray(input.imageUrls) ? input.imageUrls.filter((u) => typeof u === 'string' && u.trim()).slice(0, 5) : [];

    await prisma.schoolSubmissionAnswer.upsert({
      where: { submissionId_questionId: { submissionId: sub.id, questionId: input.questionId } },
      create: { submissionId: sub.id, questionId: input.questionId, selectedOptionId: input.selectedOptionId ?? null, textAnswer: (input.textAnswer ?? '').trim() || null, imageUrls },
      update: { selectedOptionId: input.selectedOptionId ?? null, textAnswer: (input.textAnswer ?? '').trim() || null, imageUrls },
    });
    return { ok: true };
  }
}

export class SubmitAssignmentUseCase {
  async execute(assignmentId: string, actorId?: string) {
    const ctx = await resolveSchoolContext(actorId);
    requireSchoolRole(ctx, 'STUDENT');
    const a = await prisma.schoolAssignment.findFirst({
      where: { id: assignmentId, classroomId: ctx.classroomId ?? '__none__' },
      include: { exam: { include: { questions: { include: { options: true } } } } },
    });
    if (!a) throw new AppError('ASSIGNMENT_NOT_FOUND', 'Ödev bulunamadı', 404);
    if (!isOpen(a)) throw new AppError('ASSIGNMENT_CLOSED', 'Ödev çözüme kapalı', 409);

    const sub = await prisma.schoolSubmission.findUnique({ where: { assignmentId_studentId: { assignmentId, studentId: actorId as string } }, include: { answers: true } });
    if (!sub) throw new AppError('NOT_STARTED', 'Önce ödevi başlatın', 409);
    if (sub.status !== 'IN_PROGRESS') throw new AppError('ALREADY_SUBMITTED', 'Zaten teslim edildi', 409);

    const isChoice = a.exam.examType === 'TEST' || a.exam.examType === 'TUNNEL';
    const answerByQ = new Map(sub.answers.map((x) => [x.questionId, x]));
    let totalScore = 0;
    let maxScore = 0;

    await prisma.$transaction(async (tx) => {
      if (isChoice) {
        for (const q of a.exam.questions) {
          maxScore += q.points;
          const ans = answerByQ.get(q.id);
          const correctOpt = q.options.find((o) => o.isCorrect);
          const correct = !!ans?.selectedOptionId && ans.selectedOptionId === correctOpt?.id;
          const earned = correct ? q.points : 0;
          totalScore += earned;
          if (ans) {
            await tx.schoolSubmissionAnswer.update({ where: { id: ans.id }, data: { isCorrect: correct, earnedPoints: earned, maxPoints: q.points } });
          } else {
            // Cevaplanmamış soru — 0 puanlı kayıt
            await tx.schoolSubmissionAnswer.create({ data: { submissionId: sub.id, questionId: q.id, isCorrect: false, earnedPoints: 0, maxPoints: q.points } });
          }
        }
      } else {
        // WRITTEN: maxScore puan toplamı; puanlama öğretmende
        for (const q of a.exam.questions) maxScore += q.points;
      }
      await tx.schoolSubmission.update({
        where: { id: sub.id },
        data: {
          status: (isChoice ? 'GRADED' : 'SUBMITTED') as any,
          submittedAt: new Date(),
          totalScore: isChoice ? totalScore : null,
          maxScore,
        },
      });
    });

    logger.info('school.submission.submitted', { assignmentId, actorId, autoGraded: isChoice, totalScore: isChoice ? totalScore : null });
    return { status: isChoice ? 'GRADED' : 'SUBMITTED', totalScore: isChoice ? totalScore : null, maxScore };
  }
}

/** Sonuç — showResultAfter kuralına göre; izinliyse soru-bazlı doğru/çözüm. */
export class GetStudentResultUseCase {
  async execute(assignmentId: string, actorId?: string) {
    const ctx = await resolveSchoolContext(actorId);
    requireSchoolRole(ctx, 'STUDENT');
    const a = await prisma.schoolAssignment.findFirst({
      where: { id: assignmentId, classroomId: ctx.classroomId ?? '__none__' },
      include: { exam: { include: { questions: { orderBy: { order: 'asc' }, include: { options: { orderBy: { order: 'asc' } } } } } } },
    });
    if (!a) throw new AppError('ASSIGNMENT_NOT_FOUND', 'Ödev bulunamadı', 404);
    const sub = await prisma.schoolSubmission.findUnique({ where: { assignmentId_studentId: { assignmentId, studentId: actorId as string } }, include: { answers: true } });
    const submitted = sub?.status === 'SUBMITTED' || sub?.status === 'GRADED';
    if (!sub || !submitted) throw new AppError('NOT_SUBMITTED', 'Henüz teslim edilmedi', 409);

    if (!resultVisible(a, true)) {
      return { visible: false, status: sub.status, reason: a.showResultAfter };
    }
    const isChoice = a.exam.examType === 'TEST' || a.exam.examType === 'TUNNEL';
    const answerByQ = new Map(sub.answers.map((x) => [x.questionId, x]));
    return {
      visible: true,
      status: sub.status,
      examType: a.exam.examType,
      totalScore: sub.totalScore,
      maxScore: sub.maxScore,
      feedback: sub.feedback ?? null,
      questions: a.exam.questions.map((q) => {
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
                earnedPoints: ans?.earnedPoints ?? null, // öğretmen puanlarsa (Sprint 4)
              }),
        };
      }),
    };
  }
}
