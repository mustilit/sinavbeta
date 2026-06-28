/**
 * E-Sınıf — Sprint 4: Yazılı (WRITTEN) manuel değerlendirme.
 * Öğretmen teslim edilen yazılı cevapları puanlar; toplam skor + GRADED durumu.
 */
import { prisma } from '../../../infrastructure/database/prisma';
import { AppError } from '../../errors/AppError';
import { logger } from '../../../infrastructure/logger/logger';
import { resolveSchoolContext, requireSchoolRole, type SchoolContext } from './schoolHelpers';

/** Ödevin sahibi/zümre başkanı/yönetici mi (değerlendirme yetkisi). */
function canGrade(assignment: { createdById: string; exam: { departmentId: string | null } }, ctx: SchoolContext, actorId: string): boolean {
  /* istanbul ignore next -- çağıranlar requireSchoolRole(TEACHER,DEPT_HEAD) ile gated; yönetici buraya ulaşmaz */
  if (ctx.schoolRole === 'SCHOOL_ADMIN' || ctx.schoolRole === 'BRANCH_ADMIN') return false; // yönetici puanlamaz
  if (assignment.createdById === actorId) return true;
  if (ctx.schoolRole === 'DEPT_HEAD' && assignment.exam.departmentId && assignment.exam.departmentId === ctx.departmentId) return true;
  return false;
}

/** Tek teslimi değerlendirme için yükler: öğrenci + sorular + cevaplar + çözüm. */
export class GetSubmissionForGradingUseCase {
  async execute(submissionId: string, actorId?: string) {
    const ctx = await resolveSchoolContext(actorId);
    requireSchoolRole(ctx, 'TEACHER', 'DEPT_HEAD');
    const sub = await prisma.schoolSubmission.findUnique({
      where: { id: submissionId },
      include: {
        student: { select: { username: true, firstName: true, lastName: true } },
        answers: true,
        assignment: { select: { id: true, schoolId: true, title: true, createdById: true, exam: { select: { examType: true, departmentId: true, questions: { orderBy: { order: 'asc' } } } } } },
      },
    });
    if (!sub || sub.assignment.schoolId !== ctx.schoolId) throw new AppError('SUBMISSION_NOT_FOUND', 'Teslim bulunamadı', 404);
    if (!canGrade(sub.assignment, ctx, actorId as string)) throw new AppError('FORBIDDEN', 'Bu ödevi değerlendiremezsiniz', 403);
    if (sub.assignment.exam.examType !== 'WRITTEN') throw new AppError('NOT_WRITTEN', 'Yalnızca yazılı sınavlar manuel değerlendirilir', 400);

    const answerByQ = new Map(sub.answers.map((a) => [a.questionId, a]));
    return {
      submissionId: sub.id,
      assignmentTitle: sub.assignment.title,
      status: sub.status,
      feedback: sub.feedback ?? null,
      totalScore: sub.totalScore,
      maxScore: sub.maxScore,
      student: { username: sub.student.username, name: `${sub.student.firstName ?? ''} ${sub.student.lastName ?? ''}`.trim() || null },
      questions: sub.assignment.exam.questions.map((q) => {
        const a = answerByQ.get(q.id);
        return {
          questionId: q.id,
          content: q.content,
          points: q.points,
          solutionText: q.solutionText ?? null,
          textAnswer: a?.textAnswer ?? null,
          imageUrls: a?.imageUrls ?? [],
          earnedPoints: a?.earnedPoints ?? null,
        };
      }),
    };
  }
}

export class GradeSubmissionUseCase {
  async execute(
    submissionId: string,
    input: { grades: Array<{ questionId: string; earnedPoints: number }>; feedback?: string },
    actorId?: string,
  ) {
    const ctx = await resolveSchoolContext(actorId);
    requireSchoolRole(ctx, 'TEACHER', 'DEPT_HEAD');
    const sub = await prisma.schoolSubmission.findUnique({
      where: { id: submissionId },
      include: {
        answers: true,
        assignment: { select: { schoolId: true, createdById: true, exam: { select: { examType: true, departmentId: true, questions: { select: { id: true, points: true } } } } } },
      },
    });
    if (!sub || sub.assignment.schoolId !== ctx.schoolId) throw new AppError('SUBMISSION_NOT_FOUND', 'Teslim bulunamadı', 404);
    if (!canGrade(sub.assignment, ctx, actorId as string)) throw new AppError('FORBIDDEN', 'Yetkiniz yok', 403);
    if (sub.assignment.exam.examType !== 'WRITTEN') throw new AppError('NOT_WRITTEN', 'Yalnızca yazılı sınavlar puanlanır', 400);
    if (sub.status === 'IN_PROGRESS') throw new AppError('NOT_SUBMITTED', 'Teslim edilmemiş ödev puanlanamaz', 409);

    const maxByQ = new Map(sub.assignment.exam.questions.map((q) => [q.id, q.points]));
    const gradeByQ = new Map((input.grades ?? []).map((g) => [g.questionId, g.earnedPoints]));
    const answerByQ = new Map(sub.answers.map((a) => [a.questionId, a]));

    let totalScore = 0;
    let maxScore = 0;
    const ops: any[] = [];
    for (const [qid, max] of maxByQ) {
      maxScore += max;
      const raw = gradeByQ.get(qid);
      const earned = Math.max(0, Math.min(max, Math.round((Number(raw) || 0) * 100) / 100));
      totalScore += earned;
      const ans = answerByQ.get(qid);
      if (ans) ops.push(prisma.schoolSubmissionAnswer.update({ where: { id: ans.id }, data: { earnedPoints: earned, maxPoints: max } }));
      else ops.push(prisma.schoolSubmissionAnswer.create({ data: { submissionId: sub.id, questionId: qid, earnedPoints: earned, maxPoints: max } }));
    }
    ops.push(prisma.schoolSubmission.update({
      where: { id: sub.id },
      data: { status: 'GRADED' as any, totalScore, maxScore, feedback: (input.feedback ?? '').trim() || null, gradedAt: new Date(), gradedById: actorId as string },
    }));
    await prisma.$transaction(ops);
    logger.info('school.submission.graded', { submissionId, totalScore, maxScore, actorId });
    return { status: 'GRADED', totalScore, maxScore };
  }
}
