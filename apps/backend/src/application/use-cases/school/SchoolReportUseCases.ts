/**
 * E-Sınıf — Sprint 5: Raporlama. Okul/şube performans özetleri.
 * Aggregate sorgular read replica'dan (prismaRead). Skor yüzdesi = totalScore/maxScore.
 */
import { prismaRead } from '../../../infrastructure/database/dbRouter';
import { AppError } from '../../errors/AppError';
import { resolveSchoolContext, requireSchoolRole } from './schoolHelpers';

function pct(score: number | null, max: number | null): number | null {
  if (score == null || !max) return null;
  return Math.round((score / max) * 1000) / 10;
}
function avg(nums: number[]): number | null {
  if (!nums.length) return null;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10;
}

/** Okul geneli rapor — şube + zümre kırılımı (SCHOOL_ADMIN). */
export class GetSchoolReportUseCase {
  async execute(actorId?: string) {
    const ctx = await resolveSchoolContext(actorId);
    requireSchoolRole(ctx, 'SCHOOL_ADMIN');
    const db = prismaRead();

    const [branches, departments, classrooms, students, assignments, submissions] = await Promise.all([
      db.branch.findMany({ where: { schoolId: ctx.schoolId }, select: { id: true, name: true } }),
      db.department.findMany({ where: { schoolId: ctx.schoolId }, select: { id: true, name: true, _count: { select: { exams: true } } } }),
      db.classroom.findMany({ where: { schoolId: ctx.schoolId }, select: { id: true, branchId: true } }),
      db.schoolUser.groupBy({ by: ['branchId'], where: { schoolId: ctx.schoolId, schoolRole: 'STUDENT' as any, isActive: true }, _count: { _all: true } }),
      db.schoolAssignment.findMany({ where: { schoolId: ctx.schoolId }, select: { id: true, classroomId: true, exam: { select: { departmentId: true } } } }),
      db.schoolSubmission.findMany({
        where: { assignment: { schoolId: ctx.schoolId }, status: { in: ['SUBMITTED', 'GRADED'] as any } },
        select: { totalScore: true, maxScore: true, assignment: { select: { classroomId: true, exam: { select: { departmentId: true } } } } },
      }),
    ]);

    const branchOfClassroom = new Map(classrooms.map((c) => [c.id, c.branchId]));
    const studentCountByBranch = new Map(students.map((s) => [s.branchId ?? '__none__', s._count._all]));
    const classroomCountByBranch = new Map<string, number>();
    classrooms.forEach((c) => classroomCountByBranch.set(c.branchId, (classroomCountByBranch.get(c.branchId) ?? 0) + 1));

    const assignmentCountByBranch = new Map<string, number>();
    assignments.forEach((a) => {
      const b = branchOfClassroom.get(a.classroomId);
      if (b) assignmentCountByBranch.set(b, (assignmentCountByBranch.get(b) ?? 0) + 1);
    });

    // Şube bazlı skor yüzdeleri
    const pctByBranch = new Map<string, number[]>();
    const pctByDept = new Map<string, number[]>();
    let overallPcts: number[] = [];
    for (const s of submissions) {
      const p = pct(s.totalScore, s.maxScore);
      if (p == null) continue;
      overallPcts.push(p);
      const b = branchOfClassroom.get(s.assignment.classroomId);
      if (b) pctByBranch.set(b, [...(pctByBranch.get(b) ?? []), p]);
      const d = s.assignment.exam.departmentId;
      if (d) pctByDept.set(d, [...(pctByDept.get(d) ?? []), p]);
    }

    const assignmentCountByDept = new Map<string, number>();
    assignments.forEach((a) => { const d = a.exam.departmentId; if (d) assignmentCountByDept.set(d, (assignmentCountByDept.get(d) ?? 0) + 1); });

    return {
      overall: {
        branchCount: branches.length,
        departmentCount: departments.length,
        classroomCount: classrooms.length,
        assignmentCount: assignments.length,
        submissionCount: submissions.length,
        avgPercent: avg(overallPcts),
      },
      branches: branches.map((b) => ({
        id: b.id,
        name: b.name,
        classroomCount: classroomCountByBranch.get(b.id) ?? 0,
        studentCount: studentCountByBranch.get(b.id) ?? 0,
        assignmentCount: assignmentCountByBranch.get(b.id) ?? 0,
        avgPercent: avg(pctByBranch.get(b.id) ?? []),
      })),
      departments: departments.map((d) => ({
        id: d.id,
        name: d.name,
        examCount: d._count.exams,
        assignmentCount: assignmentCountByDept.get(d.id) ?? 0,
        avgPercent: avg(pctByDept.get(d.id) ?? []),
      })),
    };
  }
}

/** Şube raporu — şubedeki sınıfların performansı (BRANCH_ADMIN kendi şubesi / SCHOOL_ADMIN herhangi). */
export class GetBranchReportUseCase {
  async execute(branchId: string, actorId?: string) {
    const ctx = await resolveSchoolContext(actorId);
    requireSchoolRole(ctx, 'SCHOOL_ADMIN', 'BRANCH_ADMIN');
    if (ctx.schoolRole === 'BRANCH_ADMIN' && ctx.branchId !== branchId) throw new AppError('FORBIDDEN', 'Yalnız kendi şubenizin raporu', 403);
    const db = prismaRead();

    const branch = await db.branch.findFirst({ where: { id: branchId, schoolId: ctx.schoolId }, select: { id: true, name: true } });
    if (!branch) throw new AppError('BRANCH_NOT_FOUND', 'Şube bulunamadı', 404);

    const classrooms = await db.classroom.findMany({ where: { branchId, schoolId: ctx.schoolId }, select: { id: true, name: true, gradeLevel: true, _count: { select: { students: true } } } });
    const clsIds = classrooms.map((c) => c.id);
    const [assignments, submissions] = await Promise.all([
      db.schoolAssignment.groupBy({ by: ['classroomId'], where: { classroomId: { in: clsIds } }, _count: { _all: true } }),
      db.schoolSubmission.findMany({
        where: { assignment: { classroomId: { in: clsIds } }, status: { in: ['SUBMITTED', 'GRADED'] as any } },
        select: { totalScore: true, maxScore: true, assignment: { select: { classroomId: true } } },
      }),
    ]);
    const asgByCls = new Map(assignments.map((a) => [a.classroomId, a._count._all]));
    const pctByCls = new Map<string, number[]>();
    let subCountByCls = new Map<string, number>();
    for (const s of submissions) {
      subCountByCls.set(s.assignment.classroomId, (subCountByCls.get(s.assignment.classroomId) ?? 0) + 1);
      const p = pct(s.totalScore, s.maxScore);
      if (p != null) pctByCls.set(s.assignment.classroomId, [...(pctByCls.get(s.assignment.classroomId) ?? []), p]);
    }

    return {
      branchName: branch.name,
      classrooms: classrooms
        .sort((a, b) => a.gradeLevel - b.gradeLevel || a.name.localeCompare(b.name))
        .map((c) => ({
          id: c.id,
          name: c.name,
          gradeLevel: c.gradeLevel,
          studentCount: c._count.students,
          assignmentCount: asgByCls.get(c.id) ?? 0,
          submissionCount: subCountByCls.get(c.id) ?? 0,
          avgPercent: avg(pctByCls.get(c.id) ?? []),
        })),
    };
  }
}
