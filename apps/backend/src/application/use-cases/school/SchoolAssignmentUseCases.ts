/**
 * E-Sınıf — Sprint 3: Öğretmen ödev atama + rapor use-case'leri.
 * Havuzdan sınav seçip bir/çok sınıfa ödev atar (sınıf başına bir Assignment).
 */
import { prisma } from '../../../infrastructure/database/prisma';
import { AppError } from '../../errors/AppError';
import { getDefaultTenantId } from '../../../common/tenant';
import { logger } from '../../../infrastructure/logger/logger';
import { resolveSchoolContext, requireSchoolRole, type SchoolContext } from './schoolHelpers';

const RESULT_VIS = ['SUBMIT', 'DUE_DATE', 'TEACHER_RELEASE'];

/** Tarih + kapalı bayrağından efektif durum. */
export function effectiveStatus(a: { status: string; availableFrom: Date; dueDate: Date }): string {
  if (a.status === 'CLOSED') return 'CLOSED';
  const now = Date.now();
  if (now < new Date(a.availableFrom).getTime()) return 'SCHEDULED';
  return 'ACTIVE';
}

function canManageExam(exam: { createdById: string; departmentId: string | null; poolVisibility: string }, ctx: SchoolContext, actorId: string): boolean {
  if (exam.poolVisibility === 'SCHOOL') return true;
  if (exam.departmentId && exam.departmentId === ctx.departmentId) return true;
  if (exam.createdById === actorId) return true;
  return false;
}

export class CreateAssignmentUseCase {
  async execute(
    input: {
      examId: string; classroomIds: string[]; title?: string; availableFrom: string; dueDate: string;
      allowLateSubmit?: boolean; showResultAfter?: string; shuffleQuestions?: boolean; shuffleOptions?: boolean;
    },
    actorId?: string,
  ) {
    const ctx = await resolveSchoolContext(actorId);
    requireSchoolRole(ctx, 'TEACHER', 'DEPT_HEAD');

    const exam = await prisma.schoolExam.findFirst({
      where: { id: input.examId, schoolId: ctx.schoolId, isArchived: false },
      select: { id: true, title: true, createdById: true, departmentId: true, poolVisibility: true, questions: { select: { id: true } } },
    });
    if (!exam) throw new AppError('EXAM_NOT_FOUND', 'Sınav bulunamadı veya arşivli', 404);
    if (!canManageExam(exam, ctx, actorId as string)) throw new AppError('FORBIDDEN', 'Bu sınavı atayamazsınız', 403);
    if (exam.questions.length === 0) throw new AppError('EXAM_EMPTY', 'Sınavda soru yok', 400);

    const from = new Date(input.availableFrom);
    const due = new Date(input.dueDate);
    if (isNaN(from.getTime()) || isNaN(due.getTime())) throw new AppError('INVALID_DATE', 'Geçersiz tarih', 400);
    if (due <= from) throw new AppError('INVALID_RANGE', 'Son tarih, başlangıçtan sonra olmalı', 400);

    const classroomIds = [...new Set(input.classroomIds ?? [])];
    if (classroomIds.length === 0) throw new AppError('NO_CLASSROOM', 'En az bir sınıf seçin', 400);
    const validClassrooms = await prisma.classroom.findMany({ where: { id: { in: classroomIds }, schoolId: ctx.schoolId }, select: { id: true } });
    if (validClassrooms.length === 0) throw new AppError('CLASSROOM_NOT_FOUND', 'Geçerli sınıf yok', 404);

    const showResultAfter = RESULT_VIS.includes(input.showResultAfter ?? '') ? input.showResultAfter! : 'SUBMIT';
    const title = (input.title ?? '').trim() || exam.title;
    const status = from.getTime() <= Date.now() ? 'ACTIVE' : 'SCHEDULED';

    const created = await prisma.$transaction(
      validClassrooms.map((c) =>
        prisma.schoolAssignment.create({
          data: {
            schoolId: ctx.schoolId, examId: exam.id, classroomId: c.id, createdById: actorId as string,
            title, availableFrom: from, dueDate: due,
            allowLateSubmit: !!input.allowLateSubmit, showResultAfter: showResultAfter as any,
            shuffleQuestions: !!input.shuffleQuestions, shuffleOptions: !!input.shuffleOptions,
            status: status as any, tenantId: getDefaultTenantId(),
          },
        }),
      ),
    );
    logger.info('school.assignment.created', { examId: exam.id, classrooms: created.length, actorId });
    return { created: created.length, assignmentIds: created.map((a) => a.id) };
  }
}

export class ListAssignmentsUseCase {
  async execute(input: { classroomId?: string }, actorId?: string) {
    const ctx = await resolveSchoolContext(actorId);
    requireSchoolRole(ctx, 'TEACHER', 'DEPT_HEAD', 'SCHOOL_ADMIN', 'BRANCH_ADMIN');
    const isManager = ctx.schoolRole === 'SCHOOL_ADMIN' || ctx.schoolRole === 'BRANCH_ADMIN';
    const rows = await prisma.schoolAssignment.findMany({
      where: {
        schoolId: ctx.schoolId,
        ...(input.classroomId ? { classroomId: input.classroomId } : {}),
        ...(isManager ? {} : { createdById: actorId }),
      },
      orderBy: [{ createdAt: 'desc' }],
      include: {
        exam: { select: { title: true, examType: true } },
        classroom: { select: { name: true } },
        _count: { select: { submissions: true } },
      },
    });
    return rows.map((a) => ({
      id: a.id,
      title: a.title,
      examType: a.exam.examType,
      examTitle: a.exam.title,
      classroomName: a.classroom.name,
      availableFrom: a.availableFrom,
      dueDate: a.dueDate,
      status: effectiveStatus(a),
      showResultAfter: a.showResultAfter,
      resultsReleased: a.resultsReleased,
      submissionCount: a._count.submissions,
      createdAt: a.createdAt,
    }));
  }
}

export class GetAssignmentReportUseCase {
  async execute(assignmentId: string, actorId?: string) {
    const ctx = await resolveSchoolContext(actorId);
    requireSchoolRole(ctx, 'TEACHER', 'DEPT_HEAD', 'SCHOOL_ADMIN', 'BRANCH_ADMIN');
    const a = await prisma.schoolAssignment.findFirst({
      where: { id: assignmentId, schoolId: ctx.schoolId },
      include: {
        exam: { select: { title: true, examType: true, totalPoints: true } },
        classroom: { select: { name: true, id: true } },
        submissions: { include: { student: { select: { username: true, firstName: true, lastName: true } } } },
      },
    });
    if (!a) throw new AppError('ASSIGNMENT_NOT_FOUND', 'Ödev bulunamadı', 404);

    const totalStudents = await prisma.schoolUser.count({ where: { classroomId: a.classroom.id, schoolRole: 'STUDENT' as any, isActive: true } });
    const submitted = a.submissions.filter((s) => s.status === 'SUBMITTED' || s.status === 'GRADED');
    const scored = submitted.filter((s) => s.totalScore != null).map((s) => s.totalScore as number);
    const avg = scored.length ? Math.round((scored.reduce((x, y) => x + y, 0) / scored.length) * 10) / 10 : null;

    return {
      id: a.id,
      title: a.title,
      examTitle: a.exam.title,
      examType: a.exam.examType,
      maxPoints: a.exam.totalPoints,
      classroomName: a.classroom.name,
      status: effectiveStatus(a),
      showResultAfter: a.showResultAfter,
      resultsReleased: a.resultsReleased,
      stats: {
        totalStudents,
        submittedCount: submitted.length,
        submissionRate: totalStudents ? Math.round((submitted.length / totalStudents) * 100) : 0,
        avgScore: avg,
        maxScore: scored.length ? Math.max(...scored) : null,
        minScore: scored.length ? Math.min(...scored) : null,
      },
      submissions: a.submissions.map((s) => ({
        id: s.id,
        studentUsername: s.student.username,
        studentName: `${s.student.firstName ?? ''} ${s.student.lastName ?? ''}`.trim() || null,
        status: s.status,
        totalScore: s.totalScore,
        maxScore: s.maxScore,
        submittedAt: s.submittedAt,
      })),
    };
  }
}

export class ReleaseAssignmentResultsUseCase {
  async execute(assignmentId: string, actorId?: string) {
    const ctx = await resolveSchoolContext(actorId);
    requireSchoolRole(ctx, 'TEACHER', 'DEPT_HEAD');
    const a = await prisma.schoolAssignment.findFirst({ where: { id: assignmentId, schoolId: ctx.schoolId }, select: { id: true, createdById: true } });
    if (!a) throw new AppError('ASSIGNMENT_NOT_FOUND', 'Ödev bulunamadı', 404);
    if (a.createdById !== actorId && ctx.schoolRole !== 'DEPT_HEAD') throw new AppError('FORBIDDEN', 'Yetkiniz yok', 403);
    await prisma.schoolAssignment.update({ where: { id: assignmentId }, data: { resultsReleased: true } });
    logger.info('school.assignment.results_released', { assignmentId, actorId });
    return { ok: true };
  }
}

export class CloseAssignmentUseCase {
  async execute(assignmentId: string, input: { status: 'CLOSED' | 'ACTIVE' }, actorId?: string) {
    const ctx = await resolveSchoolContext(actorId);
    requireSchoolRole(ctx, 'TEACHER', 'DEPT_HEAD');
    const a = await prisma.schoolAssignment.findFirst({ where: { id: assignmentId, schoolId: ctx.schoolId }, select: { id: true, createdById: true } });
    if (!a) throw new AppError('ASSIGNMENT_NOT_FOUND', 'Ödev bulunamadı', 404);
    if (a.createdById !== actorId && ctx.schoolRole !== 'DEPT_HEAD') throw new AppError('FORBIDDEN', 'Yetkiniz yok', 403);
    const status = input.status === 'CLOSED' ? 'CLOSED' : 'ACTIVE';
    await prisma.schoolAssignment.update({ where: { id: assignmentId }, data: { status: status as any } });
    logger.info('school.assignment.status', { assignmentId, status, actorId });
    return { id: assignmentId, status };
  }
}
