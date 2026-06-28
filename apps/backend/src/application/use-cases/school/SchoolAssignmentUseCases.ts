/**
 * E-Sınıf — Sprint 3: Öğretmen ödev atama + rapor use-case'leri.
 * Havuzdan sınav seçip bir/çok sınıfa ödev atar (sınıf başına bir Assignment).
 */
import { prisma } from '../../../infrastructure/database/prisma';
import { AppError } from '../../errors/AppError';
import { getDefaultTenantId } from '../../../common/tenant';
import { logger } from '../../../infrastructure/logger/logger';
import { resolveSchoolContext, requireSchoolRole, resolveSchoolScope, scopedClassroomWhere, resolveReportScope, type SchoolContext } from './schoolHelpers';

const RESULT_VIS = ['SUBMIT', 'DUE_DATE', 'TEACHER_RELEASE'];

/** Tarih + kapalı bayrağından efektif durum. */
export function effectiveStatus(a: { status: string; availableFrom: Date; dueDate: Date }): string {
  if (a.status === 'CLOSED') return 'CLOSED';
  const now = Date.now();
  if (now < new Date(a.availableFrom).getTime()) return 'SCHEDULED';
  return 'ACTIVE';
}

function canManageExam(exam: { createdById: string; departmentId: string | null; poolVisibility: string }, ctx: SchoolContext, actorId: string): boolean {
  // Yönetici (okul/şube) havuzdaki sınavları atayabilir; sınıf kapsamı ayrıca kısıtlar.
  if (ctx.schoolRole === 'SCHOOL_ADMIN' || ctx.schoolRole === 'BRANCH_ADMIN') return true;
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
    requireSchoolRole(ctx, 'TEACHER', 'DEPT_HEAD', 'SCHOOL_ADMIN', 'BRANCH_ADMIN');

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
    // Hiyerarşi: yalnız kapsamındaki sınıflara atayabilir (okul yön.→tümü, şube→şube,
    // seviye sorumlusu→seviye, sınıf öğretmeni→sınıf, zümre→zümre seviye/şube span'ı).
    const scope = await resolveSchoolScope(actorId);
    const validClassrooms = await prisma.classroom.findMany({
      where: { AND: [{ id: { in: classroomIds } }, scopedClassroomWhere(scope)] },
      select: { id: true },
    });
    if (validClassrooms.length === 0) throw new AppError('CLASSROOM_NOT_FOUND', 'Yetki alanınızda geçerli sınıf yok', 404);

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

/**
 * Ödev atama seçenekleri — hiyerarşik kapsamda Seviye (gradeLevel) + Ders listesi:
 *  - SCHOOL_ADMIN → tüm seviyeler + tüm dersler
 *  - BRANCH_ADMIN → şubesinin seviyeleri + tüm dersler
 *  - Seviye Sorumlusu → kendi seviye(ler)i + tüm dersler
 *  - Sınıf Öğretmeni → sınıf(lar)ının seviyesi + tüm dersler
 *  - Zümre Başkanı/öğretmen → zümresinin seviyesi + YALNIZ kendi ders alanı
 */
export class GetAssignOptionsUseCase {
  async execute(actorId?: string) {
    const ctx = await resolveSchoolContext(actorId);
    requireSchoolRole(ctx, 'SCHOOL_ADMIN', 'BRANCH_ADMIN', 'DEPT_HEAD', 'TEACHER');
    const schoolId = ctx.schoolId;
    const uid = ctx.userId;

    let levelWhere: Record<string, unknown>;
    let allSubjects = false;
    const deptSubjects = new Set<string>();

    if (ctx.schoolRole === 'SCHOOL_ADMIN') {
      levelWhere = { schoolId };
      allSubjects = true;
    } else {
      const levelIds = new Set<string>();
      const branchIds = new Set<string>();
      let wholeSchoolLevels = false;
      if (ctx.schoolRole === 'BRANCH_ADMIN' && ctx.branchId) { branchIds.add(ctx.branchId); allSubjects = true; }
      const myLevels = await prisma.schoolLevel.findMany({ where: { schoolId, adminUserId: uid }, select: { id: true } });
      if (myLevels.length) { myLevels.forEach((l) => levelIds.add(l.id)); allSubjects = true; }
      const myClasses = await prisma.classroom.findMany({ where: { schoolId, adminUserId: uid }, select: { levelId: true } });
      if (myClasses.length) { myClasses.forEach((c) => c.levelId && levelIds.add(c.levelId)); allSubjects = true; }
      const deptIds = new Set<string>();
      if (ctx.departmentId) deptIds.add(ctx.departmentId);
      const headed = await prisma.department.findMany({ where: { schoolId, headUserId: uid }, select: { id: true } });
      headed.forEach((d) => deptIds.add(d.id));
      if (deptIds.size) {
        const depts = await prisma.department.findMany({ where: { id: { in: [...deptIds] } }, select: { subject: true, levelId: true, branchId: true } });
        for (const d of depts) {
          if (d.subject) deptSubjects.add(d.subject);
          if (d.levelId) levelIds.add(d.levelId);
          else if (d.branchId) branchIds.add(d.branchId);
          else wholeSchoolLevels = true; // okul-geneli zümre → tüm seviyeler (branşa kısıtlı)
        }
      }
      if (wholeSchoolLevels) levelWhere = { schoolId };
      else {
        const or: Array<Record<string, unknown>> = [];
        if (branchIds.size) or.push({ branchId: { in: [...branchIds] } });
        if (levelIds.size) or.push({ id: { in: [...levelIds] } });
        levelWhere = or.length ? { schoolId, OR: or } : { id: '__none__' };
      }
    }

    const lvls = await prisma.schoolLevel.findMany({ where: levelWhere, select: { gradeLevel: true } });
    const gradeLevels = [...new Set(lvls.map((l) => l.gradeLevel))].sort((a, b) => a - b);

    let subjects: string[];
    if (allSubjects || deptSubjects.size === 0) {
      const subs = await prisma.schoolSubject.findMany({ where: { schoolId }, select: { name: true }, orderBy: { name: 'asc' } });
      subjects = subs.map((s) => s.name);
    } else {
      subjects = [...deptSubjects].sort();
    }

    return { levels: gradeLevels.map((gradeLevel) => ({ gradeLevel })), subjects: subjects.map((name) => ({ name })) };
  }
}

export class ListAssignmentsUseCase {
  async execute(input: { classroomId?: string }, actorId?: string) {
    const ctx = await resolveSchoolContext(actorId);
    requireSchoolRole(ctx, 'TEACHER', 'DEPT_HEAD', 'SCHOOL_ADMIN', 'BRANCH_ADMIN');
    // Hiyerarşik görünürlük (designation tabanlı, kimse yukarıyı görmez):
    //  - SCHOOL_ADMIN → tüm okul
    //  - BRANCH_ADMIN → şubesi, Seviye Sorumlusu → seviyesi, Sınıf Öğretmeni → sınıfı
    //  - Zümre Başkanı → zümresinin sınıf span'ı + YALNIZ kendi branşının sınavları
    //  - Herkes kendi attığı ödevleri görür (createdById)
    const scope = await resolveReportScope(actorId);
    const scopeWhere: Record<string, unknown> = {};
    if (!scope.isSchoolAdmin) {
      const or: Array<Record<string, unknown>> = [{ createdById: actorId }];
      for (const cw of scope.allSubjectWhere) or.push({ classroom: cw });
      if (scope.subjectDeptIds.length) {
        for (const cw of scope.subjectSpanWhere) or.push({ AND: [{ classroom: cw }, { exam: { departmentId: { in: scope.subjectDeptIds } } }] });
      }
      scopeWhere.AND = [{ OR: or }];
    }
    const rows = await prisma.schoolAssignment.findMany({
      where: {
        schoolId: ctx.schoolId,
        ...(input.classroomId ? { classroomId: input.classroomId } : {}),
        ...scopeWhere,
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
